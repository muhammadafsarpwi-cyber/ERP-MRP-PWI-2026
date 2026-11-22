import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { withTransaction } from '../../../common/transaction.util';
import { assertDivisionInScope, DivisionAccess } from '../../../common/division-scope.util';
import {
  AllocationType,
  ChequeClearanceStatus,
  CustomerPaymentMode,
  CustomerReceipt,
  CustomerReceiptAllocation,
  CustomerReceiptType,
  SalesCustomer,
  SalesInvoice,
  SalesOrder,
  SalesReturn,
} from '../entities';
import { Customer } from '../../customer/entities/customer.entity';
import { CustomerDocumentType, CustomerLedgerEntry } from '../../customer/entities/customer-ledger.entity';
import { CustomerLedgerService } from '../../customer/services/customer-ledger.service';
import { FinanceAutoPostingService } from '../../finance/services/finance-auto-posting.service';
import { FinanceAccount } from '../../finance/entities/finance-account.entity';
import {
  ApplyAdvanceDto,
  BounceChequeDto,
  ClearChequeDto,
  CreateCustomerReceiptDto,
} from '../dto/customer-receipt.dto';
import { customerNameMatchKeys } from './customer-match.util';
import { ensureSalesInvoiceSchema, isUuid } from './sales-invoice.util';
import { CustomerCreditService } from './customer-credit.service';

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n: number): number => Math.round((Number(n) || 0) * 10000) / 10000;

@Injectable()
export class CustomerReceiptService implements OnModuleInit {
  private readonly logger = new Logger(CustomerReceiptService.name);

  constructor(
    @InjectRepository(CustomerReceipt)
    private readonly receiptRepo: Repository<CustomerReceipt>,
    @InjectRepository(CustomerReceiptAllocation)
    private readonly allocRepo: Repository<CustomerReceiptAllocation>,
    @InjectRepository(SalesInvoice)
    private readonly invoiceRepo: Repository<SalesInvoice>,
    @InjectRepository(SalesCustomer)
    private readonly salesCustomerRepo: Repository<SalesCustomer>,
    @InjectRepository(SalesOrder)
    private readonly orderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesReturn)
    private readonly returnRepo: Repository<SalesReturn>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(CustomerLedgerEntry)
    private readonly ledgerEntryRepo: Repository<CustomerLedgerEntry>,
    @Inject(forwardRef(() => CustomerLedgerService))
    private readonly customerLedgerService: CustomerLedgerService,
    private readonly autoPosting: FinanceAutoPostingService,
    private readonly dataSource: DataSource,
    @Optional()
    private readonly customerCreditService?: CustomerCreditService,
  ) {}

  async onModuleInit() {
    await this.ensureSchemaAndBackfill();
  }

  async ensureSchemaAndBackfill(): Promise<void> {
    try {
      await ensureSalesInvoiceSchema(this.receiptRepo.manager, this.logger);
      await this.receiptRepo.manager.query(`
        CREATE SCHEMA IF NOT EXISTS erp_sales;

        CREATE TABLE IF NOT EXISTS erp_sales.customer_receipts (
          id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          company_id uuid NOT NULL,
          division_id uuid NULL,
          customer_id uuid NOT NULL,
          receipt_number varchar(50) NOT NULL UNIQUE,
          receipt_date date NOT NULL,
          sales_order_id uuid NULL,
          soc_number varchar(60) NULL,
          po_reference varchar(100) NULL,
          receipt_type varchar(30) NOT NULL DEFAULT 'INVOICE_PAYMENT',
          payment_mode varchar(30) NOT NULL DEFAULT 'BANK_TRANSFER',
          bank_account_id uuid NULL,
          bank_name varchar(150) NULL,
          cheque_number varchar(80) NULL,
          cheque_date date NULL,
          clearance_date date NULL,
          clearance_status varchar(30) NOT NULL DEFAULT 'CLEARED',
          amount numeric(15,4) NOT NULL DEFAULT 0,
          allocated_amount numeric(15,4) NOT NULL DEFAULT 0,
          unallocated_advance_amount numeric(15,4) NOT NULL DEFAULT 0,
          currency varchar(3) NOT NULL DEFAULT 'PKR',
          reference_no varchar(120) NULL,
          remarks text NULL,
          journal_id uuid NULL,
          ledger_entry_id uuid NULL,
          status varchar(20) NOT NULL DEFAULT 'POSTED',
          created_by uuid NULL,
          updated_by uuid NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          deleted_at TIMESTAMP WITH TIME ZONE NULL,
          deleted_by uuid NULL
        );
        CREATE INDEX IF NOT EXISTS idx_customer_receipts_company_cust
          ON erp_sales.customer_receipts(company_id, customer_id, receipt_date);
        CREATE INDEX IF NOT EXISTS idx_customer_receipts_division
          ON erp_sales.customer_receipts(division_id);

        CREATE TABLE IF NOT EXISTS erp_sales.customer_receipt_allocations (
          id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          company_id uuid NOT NULL,
          receipt_id uuid NOT NULL REFERENCES erp_sales.customer_receipts(id) ON DELETE CASCADE,
          customer_id uuid NOT NULL,
          sales_invoice_id uuid NOT NULL REFERENCES erp_sales.sales_invoices(id) ON DELETE RESTRICT,
          invoice_no varchar(50) NOT NULL,
          allocation_date date NOT NULL,
          allocation_type varchar(30) NOT NULL DEFAULT 'DIRECT',
          allocated_amount numeric(15,4) NOT NULL,
          journal_id uuid NULL,
          status varchar(20) NOT NULL DEFAULT 'POSTED',
          notes text NULL,
          created_by uuid NULL,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_receipt_allocations_receipt
          ON erp_sales.customer_receipt_allocations(receipt_id);
        CREATE INDEX IF NOT EXISTS idx_receipt_allocations_invoice
          ON erp_sales.customer_receipt_allocations(sales_invoice_id);
      `);

      // Seed COA system accounts (2050 Customer Advances, 1020 Cheques in Hand, etc.)
      const companies: any[] = await this.receiptRepo.manager
        .query(`SELECT id FROM public.companies`)
        .catch(() => []);
      for (const co of companies || []) {
        await this.autoPosting.ensureSystemArAccounts(co.id).catch(() => undefined);
      }

      // Idempotent backfill of SI-2026-00004 & any Posted/Partial/Paid invoices missing Customer Ledger debits
      await this.backfillInvoicesToLedgerAndGl();
      this.logger.log('Customer Receipts & Allocations schema and invoice ledger backfill verified.');
    } catch (err: any) {
      this.logger.warn(`CustomerReceiptService schema/backfill warning: ${err?.message || err}`);
    }
  }

  private async backfillInvoicesToLedgerAndGl(): Promise<void> {
    const invoices: any[] = await this.receiptRepo.manager
      .query(
        `SELECT si.*, so.order_number AS soc_number
         FROM erp_sales.sales_invoices si
         LEFT JOIN erp_sales.sales_orders so ON so.id = si.sales_order_id
         WHERE si.deleted_at IS NULL
           AND LOWER(COALESCE(si.status, 'pending')) <> 'cancelled'
           AND (
             LOWER(COALESCE(si.status, 'pending')) IN ('posted', 'partial', 'paid', 'settled')
             OR si.invoice_no = 'SI-2026-00004'
           )
         ORDER BY si.invoice_date ASC, si.created_at ASC`,
      )
      .catch(() => []);

    const touchedCustomers = new Set<string>();

    for (const row of invoices || []) {
      if (row.invoice_no === 'SI-2026-00004' && String(row.status || '').toLowerCase() === 'pending') {
        await this.receiptRepo.manager.query(
          `UPDATE erp_sales.sales_invoices SET status = 'Posted', updated_at = now() WHERE id = $1`,
          [row.id],
        );
      }

      const masterCustomer = await this.resolveMasterCustomerRecord(row.customer_id, row.company_id).catch(() => null);
      if (!masterCustomer) continue;

      const existingLedger = await this.ledgerEntryRepo.findOne({
        where: {
          companyId: row.company_id,
          customerId: masterCustomer.id,
          documentType: CustomerDocumentType.SALES_INVOICE,
          documentNumber: row.invoice_no,
        },
      });

      if (!existingLedger) {
        await this.customerLedgerService.recordEntry(
          row.company_id,
          masterCustomer.id,
          {
            transactionDate: row.invoice_date || new Date(),
            documentType: CustomerDocumentType.SALES_INVOICE,
            documentNumber: row.invoice_no,
            reference: row.soc_number || row.delivery_number || row.invoice_no,
            debit: Number(row.total_amount) || 0,
            credit: 0,
            currency: 'PKR',
            dueDate: row.due_date || null,
            paymentTerms: row.payment_terms || masterCustomer.paymentTerms || 'Cash / Immediate',
            divisionId: row.division_id || null,
            salesOrderId: row.sales_order_id || null,
            socNumber: row.soc_number || null,
            salesInvoiceId: row.id,
            notes: `Sales invoice ${row.invoice_no} posted`,
          },
          row.created_by || undefined,
        );
        touchedCustomers.add(`${row.company_id}:${masterCustomer.id}`);
      }

      await this.autoPosting
        .postSalesInvoice(
          row.company_id,
          row.invoice_no,
          row.id,
          Number(row.total_amount) || 0,
          row.created_by || undefined,
          undefined,
          row.invoice_date ? new Date(row.invoice_date) : new Date(),
        )
        .catch(() => undefined);
    }

    // Also recalculate running balance for any customer with ledger entries where running_balance may be 0
    const ledgerCusts: any[] = await this.receiptRepo.manager
      .query(`SELECT DISTINCT company_id, customer_id FROM public.customer_ledger`)
      .catch(() => []);
    for (const pair of ledgerCusts || []) {
      await this.customerLedgerService
        .recalculateRunningBalances(pair.customer_id, pair.company_id)
        .catch(() => undefined);
    }
    void touchedCustomers;
  }

  async resolveMasterCustomerRecord(
    anyCustomerId: string,
    companyId: string,
    manager?: EntityManager,
  ): Promise<Customer | null> {
    const custRepo = manager ? manager.getRepository(Customer) : this.customerRepo;
    const salesCustRepo = manager ? manager.getRepository(SalesCustomer) : this.salesCustomerRepo;

    const direct = await custRepo.findOne({ where: { id: anyCustomerId } });
    if (direct) return direct;

    const salesCust = await salesCustRepo.findOne({ where: { id: anyCustomerId } });
    if (!salesCust) return null;

    const byCode = await custRepo.findOne({
      where: { companyId, customerCode: salesCust.customerCode },
    });
    if (byCode) return byCode;

    const byName = await custRepo.findOne({
      where: [
        { companyId, name: salesCust.companyName },
        { companyId, legalName: salesCust.companyName },
      ],
    });
    if (byName) return byName;

    const masters = await custRepo.find({ where: { companyId } });
    const keys = customerNameMatchKeys(salesCust.companyName);
    return (
      masters.find(
        (m) =>
          customerNameMatchKeys(m.name).some((k) => keys.includes(k)) ||
          customerNameMatchKeys(m.legalName).some((k) => keys.includes(k)),
      ) || null
    );
  }

  /**
   * Resolves all customer UUIDs (both public.customers.id and matching erp_sales.customers.id)
   * so invoices belonging to either ID are unified cleanly.
   */
  private async resolveMatchingCustomerIds(
    masterCustomer: Customer,
    companyId: string,
    manager?: EntityManager,
  ): Promise<string[]> {
    const salesCustRepo = manager ? manager.getRepository(SalesCustomer) : this.salesCustomerRepo;
    const ids = new Set<string>([masterCustomer.id]);
    const matchingSales = await salesCustRepo.find({
      where: [
        { companyId, id: masterCustomer.id },
        { companyId, customerCode: masterCustomer.customerCode },
        { companyId, companyName: masterCustomer.name },
      ],
    });
    for (const sc of matchingSales || []) {
      ids.add(sc.id);
    }
    return Array.from(ids);
  }

  async generateNextReceiptNumber(companyId: string, manager?: EntityManager): Promise<string> {
    const repo = manager ? manager.getRepository(CustomerReceipt) : this.receiptRepo;
    const year = new Date().getFullYear();
    const prefix = `RCV-${year}-`;
    const r = await repo
      .createQueryBuilder('r')
      .withDeleted()
      .select("MAX(CAST(NULLIF(SUBSTRING(r.receipt_number FROM '([0-9]+)$'), '') AS INT))", 'maxNum')
      .where('r.company_id = :companyId', { companyId })
      .andWhere('r.receipt_number LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne();
    const nextNum = (Number(r?.maxNum) || 0) + 1;
    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  }

  async getBankCashAccounts(companyId: string) {
    await this.autoPosting.ensureSystemArAccounts(companyId);
    const repo = this.dataSource.getRepository(FinanceAccount);
    const all = await repo.find({
      where: { companyId, status: 'ACTIVE' },
      order: { accountCode: 'ASC' },
    });
    return all.filter((a) => a.isBankCash || ['1000', '1010', '1020'].includes(a.accountCode));
  }

  private async resolveDepositAccount(
    companyId: string,
    paymentMode: string,
    clearanceStatus: string,
    bankAccountId: string | undefined,
    manager: EntityManager,
  ): Promise<{ accountId: string | null; accountCode: string; accountName: string }> {
    await this.autoPosting.ensureSystemArAccounts(companyId, manager);
    const acctRepo = manager.getRepository(FinanceAccount);

    if (clearanceStatus === ChequeClearanceStatus.PENDING_CLEARANCE) {
      const cheqAcct = await acctRepo.findOne({ where: { companyId, accountCode: '1020' } });
      return {
        accountId: cheqAcct?.id || null,
        accountCode: '1020',
        accountName: cheqAcct?.accountName || 'Cheques in Hand (Uncleared)',
      };
    }

    if (bankAccountId && isUuid(bankAccountId)) {
      const chosen = await acctRepo.findOne({ where: { id: bankAccountId, companyId } });
      if (chosen) {
        return {
          accountId: chosen.id,
          accountCode: chosen.accountCode,
          accountName: chosen.accountName,
        };
      }
    }

    const fallbackCode = paymentMode === CustomerPaymentMode.CASH ? '1000' : '1010';
    const fallbackAcct = await acctRepo.findOne({ where: { companyId, accountCode: fallbackCode } });
    return {
      accountId: fallbackAcct?.id || null,
      accountCode: fallbackCode,
      accountName: fallbackAcct?.accountName || (fallbackCode === '1000' ? 'Cash in Hand' : 'Bank Accounts'),
    };
  }

  private async getPostedCreditNoteTotal(
    invoiceId: string,
    companyId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager ? manager.getRepository(SalesReturn) : this.returnRepo;
    const returns = await repo.find({
      where: { salesInvoiceId: invoiceId, companyId },
      select: ['id', 'totalAmount', 'creditPosted'],
    });
    return round2(
      (returns || [])
        .filter((r) => r.creditPosted)
        .reduce((s, r) => s + (Number(r.totalAmount) || 0), 0),
    );
  }

  /**
   * Guarantees that an invoice has its SALES_INVOICE debit in customer_ledger and GL AR journal
   * BEFORE we credit/settle it, so customer running balance stays mathematically accurate.
   */
  private async ensureInvoicePostedToLedgerAndGl(
    invoice: SalesInvoice,
    masterCustomerId: string,
    userId: string | undefined,
    manager: EntityManager,
  ): Promise<void> {
    const invRepo = manager.getRepository(SalesInvoice);
    const ledgerRepo = manager.getRepository(CustomerLedgerEntry);

    if (String(invoice.status || '').toLowerCase() === 'pending') {
      invoice.status = 'Posted';
      await invRepo.save(invoice);
    }

    const existingLedger = await ledgerRepo.findOne({
      where: {
        companyId: invoice.companyId,
        customerId: masterCustomerId,
        documentType: CustomerDocumentType.SALES_INVOICE,
        documentNumber: invoice.invoiceNo,
      },
    });

    if (!existingLedger) {
      let socNumber: string | null = null;
      if (invoice.salesOrderId) {
        const order = await manager.getRepository(SalesOrder).findOne({
          where: { id: invoice.salesOrderId },
          select: ['id', 'orderNumber'],
        });
        socNumber = order?.orderNumber || null;
      }

      await this.customerLedgerService.recordEntry(
        invoice.companyId,
        masterCustomerId,
        {
          transactionDate: invoice.invoiceDate || new Date(),
          documentType: CustomerDocumentType.SALES_INVOICE,
          documentNumber: invoice.invoiceNo,
          reference: socNumber || invoice.deliveryNumber || invoice.invoiceNo,
          debit: Number(invoice.totalAmount) || 0,
          credit: 0,
          currency: 'PKR',
          dueDate: invoice.dueDate || null,
          paymentTerms: invoice.paymentTerms || 'Cash / Immediate',
          divisionId: invoice.divisionId || null,
          salesOrderId: invoice.salesOrderId || null,
          socNumber,
          salesInvoiceId: invoice.id,
          notes: `Sales invoice ${invoice.invoiceNo} posted`,
        },
        userId,
        manager,
      );
    }

    await this.autoPosting.postSalesInvoice(
      invoice.companyId,
      invoice.invoiceNo,
      invoice.id,
      Number(invoice.totalAmount) || 0,
      userId,
      manager,
      invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date(),
    );
  }

  /**
   * Resolves a division input that may be a PostgreSQL UUID, division code (e.g. DIV-001-SPI),
   * or division name (e.g. "Spoke Division") to the canonical public.divisions.id UUID.
   */
  private async resolveDivisionIdInput(
    rawDivision: string | undefined | null,
    companyId: string,
    manager?: EntityManager,
  ): Promise<string | null> {
    const trimmed = String(rawDivision || '').trim();
    if (!trimmed) return null;
    if (isUuid(trimmed)) return trimmed;

    const mgr = manager || this.receiptRepo.manager;
    const rows: any[] = await mgr
      .query(
        `SELECT id
         FROM public.divisions
         WHERE company_id = $1
           AND deleted_at IS NULL
           AND (LOWER(TRIM(division_code)) = LOWER($2) OR LOWER(TRIM(name)) = LOWER($2))
         LIMIT 1`,
        [companyId, trimmed],
      )
      .catch(() => []);
    return rows?.[0]?.id || null;
  }

  /**
   * Create a unified Customer Receipt Voucher (Invoice Payment, Multi-Invoice Bill-to-Bill, or Advance Payment)
   * atomically across Customer Receipts, Allocations, Sales Invoices, Customer Ledger, and GL Journal.
   */
  async createReceipt(
    dto: CreateCustomerReceiptDto,
    userId: string | undefined,
    companyId: string,
    allowedDivisionIds?: DivisionAccess,
  ): Promise<any> {
    if (!dto.amount || Number(dto.amount) <= 0) {
      throw new BadRequestException('Receipt amount must be greater than zero');
    }
    const normalizedDtoDivisionId = await this.resolveDivisionIdInput(dto.divisionId, companyId);
    if (normalizedDtoDivisionId) {
      assertDivisionInScope(normalizedDtoDivisionId, allowedDivisionIds);
    }

    const receiptAmount = round2(Number(dto.amount));
    const receiptDateStr = (dto.receiptDate && String(dto.receiptDate).slice(0, 10)) || new Date().toISOString().split('T')[0];
    const receiptDateObj = new Date(`${receiptDateStr}T00:00:00Z`);
    const safeUserId = isUuid(userId) ? userId : undefined;
    const paymentMode = dto.paymentMode || CustomerPaymentMode.BANK_TRANSFER;
    const clearanceStatus = dto.clearanceStatus || ChequeClearanceStatus.CLEARED;

    const savedReceiptId = await withTransaction(this.dataSource, async (manager) => {
      const receiptRepo = manager.getRepository(CustomerReceipt);
      const allocRepo = manager.getRepository(CustomerReceiptAllocation);
      const invRepo = manager.getRepository(SalesInvoice);

      const masterCustomer = await this.resolveMasterCustomerRecord(dto.customerId, companyId, manager);
      if (!masterCustomer) {
        throw new NotFoundException(`Customer '${dto.customerId}' not found`);
      }

      const matchingCustomerIds = await this.resolveMatchingCustomerIds(masterCustomer, companyId, manager);

      // Build requested allocations map (or FIFO auto-allocate)
      const requestedAllocations: Array<{ invoice: SalesInvoice; amount: number }> = [];

      if (Array.isArray(dto.allocations) && dto.allocations.length > 0) {
        const grouped = new Map<string, number>();
        for (const item of dto.allocations) {
          const amt = round2(Number(item.allocatedAmount) || 0);
          if (amt <= 0) continue;
          grouped.set(item.salesInvoiceId, round2((grouped.get(item.salesInvoiceId) || 0) + amt));
        }

        for (const [invoiceId, allocAmt] of grouped.entries()) {
          const invoice = await invRepo.findOne({
            where: { id: invoiceId, companyId },
            relations: ['salesOrder'],
          });
          if (!invoice) {
            throw new NotFoundException(`Sales Invoice '${invoiceId}' not found`);
          }
          if (!matchingCustomerIds.includes(invoice.customerId)) {
            throw new BadRequestException(`Invoice ${invoice.invoiceNo} does not belong to customer ${masterCustomer.name}`);
          }
          if (String(invoice.status || '').toLowerCase() === 'cancelled') {
            throw new BadRequestException(`Cannot allocate payment to cancelled invoice ${invoice.invoiceNo}`);
          }
          assertDivisionInScope(invoice.salesOrder?.divisionId ?? invoice.divisionId, allowedDivisionIds);

          const creditNotes = await this.getPostedCreditNoteTotal(invoice.id, companyId, manager);
          const outstanding = round2(
            Math.max(0, (Number(invoice.totalAmount) || 0) - (Number(invoice.paidAmount) || 0) - creditNotes),
          );
          if (allocAmt > outstanding + 0.01) {
            throw new BadRequestException(
              `Allocated amount Rs ${allocAmt.toLocaleString()} exceeds outstanding balance Rs ${outstanding.toLocaleString()} for invoice ${invoice.invoiceNo}`,
            );
          }
          requestedAllocations.push({ invoice, amount: Math.min(allocAmt, outstanding) });
        }
      } else if (dto.autoAllocate && dto.receiptType !== CustomerReceiptType.ADVANCE_PAYMENT) {
        const openInvoices = await invRepo.find({
          where: { companyId, customerId: In(matchingCustomerIds) },
          relations: ['salesOrder'],
          order: { dueDate: 'ASC', invoiceDate: 'ASC', createdAt: 'ASC' },
        });
        let remainingToAllocate = receiptAmount;
        for (const invoice of openInvoices || []) {
          if (remainingToAllocate <= 0.005) break;
          if (String(invoice.status || '').toLowerCase() === 'cancelled') continue;
          const creditNotes = await this.getPostedCreditNoteTotal(invoice.id, companyId, manager);
          const outstanding = round2(
            Math.max(0, (Number(invoice.totalAmount) || 0) - (Number(invoice.paidAmount) || 0) - creditNotes),
          );
          if (outstanding <= 0.005) continue;
          const chunk = round2(Math.min(remainingToAllocate, outstanding));
          requestedAllocations.push({ invoice, amount: chunk });
          remainingToAllocate = round2(remainingToAllocate - chunk);
        }
      }

      const totalAllocated = round2(requestedAllocations.reduce((s, a) => s + a.amount, 0));
      if (totalAllocated > receiptAmount + 0.01) {
        throw new BadRequestException(
          `Total invoice allocations (Rs ${totalAllocated.toLocaleString()}) exceed receipt amount (Rs ${receiptAmount.toLocaleString()})`,
        );
      }
      const unallocatedAdvanceAmount = round2(Math.max(0, receiptAmount - totalAllocated));

      const receiptType =
        totalAllocated === 0
          ? (dto.receiptType === CustomerReceiptType.ON_ACCOUNT
              ? CustomerReceiptType.ON_ACCOUNT
              : CustomerReceiptType.ADVANCE_PAYMENT)
          : (dto.receiptType || CustomerReceiptType.INVOICE_PAYMENT);

      let socNumber = dto.socNumber?.trim() || null;
      if (!socNumber && dto.salesOrderId && isUuid(dto.salesOrderId)) {
        const so = await manager.getRepository(SalesOrder).findOne({
          where: { id: dto.salesOrderId, companyId },
          select: ['id', 'orderNumber'],
        });
        socNumber = so?.orderNumber || null;
      }

      const resolvedDivisionId =
        normalizedDtoDivisionId ||
        requestedAllocations[0]?.invoice?.divisionId ||
        requestedAllocations[0]?.invoice?.salesOrder?.divisionId ||
        masterCustomer.divisionId ||
        null;

      const receiptNumber = await this.generateNextReceiptNumber(companyId, manager);
      const depositAcct = await this.resolveDepositAccount(
        companyId,
        paymentMode,
        clearanceStatus,
        dto.bankAccountId,
        manager,
      );

      const receiptEntity = receiptRepo.create({
        companyId,
        divisionId: resolvedDivisionId,
        customerId: masterCustomer.id,
        receiptNumber,
        receiptDate: receiptDateStr,
        salesOrderId: isUuid(dto.salesOrderId) ? dto.salesOrderId : null,
        socNumber,
        poReference: dto.poReference?.trim() || null,
        receiptType,
        paymentMode,
        bankAccountId: depositAcct.accountId,
        bankName: dto.bankName?.trim() || (paymentMode === CustomerPaymentMode.CASH ? 'Cash Desk' : depositAcct.accountName),
        chequeNumber: dto.chequeNumber?.trim() || null,
        chequeDate: dto.chequeDate ? String(dto.chequeDate).slice(0, 10) : null,
        clearanceDate: clearanceStatus === ChequeClearanceStatus.CLEARED ? receiptDateStr : null,
        clearanceStatus,
        amount: receiptAmount,
        allocatedAmount: totalAllocated,
        unallocatedAdvanceAmount,
        currency: masterCustomer.currencyCode || 'PKR',
        referenceNo: dto.referenceNo?.trim() || dto.chequeNumber?.trim() || null,
        remarks: dto.remarks?.trim() || null,
        status: 'POSTED',
        createdBy: safeUserId || null,
        updatedBy: safeUserId || null,
      });

      const savedReceipt = await receiptRepo.save(receiptEntity);

      // Update allocated invoices & insert allocation rows
      const settledInvoiceNos: string[] = [];
      for (const { invoice, amount: allocAmt } of requestedAllocations) {
        await this.ensureInvoicePostedToLedgerAndGl(invoice, masterCustomer.id, safeUserId, manager);

        const creditNotes = await this.getPostedCreditNoteTotal(invoice.id, companyId, manager);
        invoice.paidAmount = round2((Number(invoice.paidAmount) || 0) + allocAmt);
        const remainingBal = round2(
          Math.max(0, (Number(invoice.totalAmount) || 0) - invoice.paidAmount - creditNotes),
        );
        invoice.balance = remainingBal <= 0.005 ? 0 : remainingBal;
        invoice.status = invoice.balance <= 0 ? 'Paid' : 'Partial';
        await invRepo.save(invoice);

        settledInvoiceNos.push(invoice.invoiceNo);

        await allocRepo.save(
          allocRepo.create({
            companyId,
            receiptId: savedReceipt.id,
            customerId: masterCustomer.id,
            salesInvoiceId: invoice.id,
            invoiceNo: invoice.invoiceNo,
            allocationDate: receiptDateStr,
            allocationType: AllocationType.DIRECT,
            allocatedAmount: allocAmt,
            status: 'POSTED',
            notes: `Settled via Receipt ${receiptNumber}`,
            createdBy: safeUserId || null,
          }),
        );
      }

      // Post balanced GL Journal
      const journal = await this.autoPosting.postUnifiedCustomerReceipt({
        companyId,
        receiptId: savedReceipt.id,
        receiptNumber,
        receiptDate: receiptDateObj,
        totalAmount: receiptAmount,
        invoiceAllocatedAmount: totalAllocated,
        advanceAmount: unallocatedAdvanceAmount,
        debitAccountId: depositAcct.accountId,
        debitAccountCode: depositAcct.accountCode,
        customerName: masterCustomer.name,
        invoiceNumbers: settledInvoiceNos,
        actorId: safeUserId,
        manager,
      });

      // Post Credit entry to Customer Ledger
      const ledgerDocType =
        totalAllocated === 0 && receiptType === CustomerReceiptType.ADVANCE_PAYMENT
          ? CustomerDocumentType.ADVANCE_RECEIPT
          : CustomerDocumentType.CUSTOMER_PAYMENT;

      const refParts = [paymentMode.replace(/_/g, ' ')];
      if (dto.chequeNumber?.trim()) refParts.push(`Chq #${dto.chequeNumber.trim()}`);
      if (dto.referenceNo?.trim() && dto.referenceNo.trim() !== dto.chequeNumber?.trim()) {
        refParts.push(`Ref: ${dto.referenceNo.trim()}`);
      }
      if (settledInvoiceNos.length > 0) refParts.push(`Inv: ${settledInvoiceNos.join(', ')}`);
      if (unallocatedAdvanceAmount > 0) refParts.push(`Advance: Rs ${unallocatedAdvanceAmount.toLocaleString()}`);

      const ledgerEntry = await this.customerLedgerService.recordEntry(
        companyId,
        masterCustomer.id,
        {
          transactionDate: receiptDateObj,
          documentType: ledgerDocType,
          documentNumber: receiptNumber,
          reference: refParts.join(' | ').slice(0, 250),
          debit: 0,
          credit: receiptAmount,
          currency: masterCustomer.currencyCode || 'PKR',
          divisionId: resolvedDivisionId,
          salesOrderId: savedReceipt.salesOrderId,
          socNumber,
          poReference: savedReceipt.poReference,
          paymentMode,
          receiptId: savedReceipt.id,
          salesInvoiceId: requestedAllocations.length === 1 ? requestedAllocations[0].invoice.id : null,
          notes:
            dto.remarks?.trim() ||
            (totalAllocated > 0
              ? `Payment ${receiptNumber} allocated against ${settledInvoiceNos.join(', ')}${unallocatedAdvanceAmount > 0 ? ` (Rs ${unallocatedAdvanceAmount.toLocaleString()} kept as Advance)` : ''}`
              : `Advance receipt ${receiptNumber} recorded for ${masterCustomer.name}`),
        },
        safeUserId,
        manager,
      );

      savedReceipt.journalId = journal?.id || null;
      savedReceipt.ledgerEntryId = ledgerEntry?.id || null;
      await receiptRepo.save(savedReceipt);

      return savedReceipt.id;
    });

    return this.getReceipt(savedReceiptId, companyId, allowedDivisionIds);
  }

  /**
   * Adjust previously received Unallocated Advance(s) against New/Open Invoices
   * with ZERO double-counting in Customer Ledger while reclassifying GL (DR 2050 Advances / CR 1100 AR).
   */
  async applyAdvanceToInvoices(
    dto: ApplyAdvanceDto,
    userId: string | undefined,
    companyId: string,
    allowedDivisionIds?: DivisionAccess,
  ): Promise<any> {
    if (!Array.isArray(dto.invoiceAllocations) || dto.invoiceAllocations.length === 0) {
      throw new BadRequestException('Please select at least one invoice to apply the advance against');
    }

    const adjDateStr = (dto.adjustmentDate && String(dto.adjustmentDate).slice(0, 10)) || new Date().toISOString().split('T')[0];
    const adjDateObj = new Date(`${adjDateStr}T00:00:00Z`);
    const safeUserId = isUuid(userId) ? userId : undefined;

    return withTransaction(this.dataSource, async (manager) => {
      const receiptRepo = manager.getRepository(CustomerReceipt);
      const allocRepo = manager.getRepository(CustomerReceiptAllocation);
      const invRepo = manager.getRepository(SalesInvoice);

      const masterCustomer = await this.resolveMasterCustomerRecord(dto.customerId, companyId, manager);
      if (!masterCustomer) {
        throw new NotFoundException(`Customer '${dto.customerId}' not found`);
      }
      const matchingCustomerIds = await this.resolveMatchingCustomerIds(masterCustomer, companyId, manager);

      // Load candidate advance receipts
      const advQb = receiptRepo
        .createQueryBuilder('r')
        .where('r.company_id = :companyId', { companyId })
        .andWhere('r.customer_id = :customerId', { customerId: masterCustomer.id })
        .andWhere('r.status = :st', { st: 'POSTED' })
        .andWhere("COALESCE(r.clearance_status, 'CLEARED') <> 'BOUNCED'")
        .andWhere('r.unallocated_advance_amount > 0')
        .orderBy('r.receipt_date', 'ASC')
        .addOrderBy('r.created_at', 'ASC');
      if (dto.receiptId) {
        advQb.andWhere('r.id = :receiptId', { receiptId: dto.receiptId });
      }
      const advanceReceipts = await advQb.getMany();
      const totalAvailableAdvance = round2(
        advanceReceipts.reduce((s, r) => s + (Number(r.unallocatedAdvanceAmount) || 0), 0),
      );

      // Validate target invoices and requested total
      const grouped = new Map<string, number>();
      for (const item of dto.invoiceAllocations) {
        const amt = round2(Number(item.allocatedAmount) || 0);
        if (amt <= 0) continue;
        grouped.set(item.salesInvoiceId, round2((grouped.get(item.salesInvoiceId) || 0) + amt));
      }
      if (grouped.size === 0) {
        throw new BadRequestException('Please specify positive adjustment amounts for the target invoices');
      }

      const targets: Array<{ invoice: SalesInvoice; amount: number }> = [];
      let totalRequested = 0;

      for (const [invoiceId, amt] of grouped.entries()) {
        const invoice = await invRepo.findOne({
          where: { id: invoiceId, companyId },
          relations: ['salesOrder'],
        });
        if (!invoice) throw new NotFoundException(`Sales Invoice '${invoiceId}' not found`);
        if (!matchingCustomerIds.includes(invoice.customerId)) {
          throw new BadRequestException(`Invoice ${invoice.invoiceNo} does not belong to customer ${masterCustomer.name}`);
        }
        if (String(invoice.status || '').toLowerCase() === 'cancelled') {
          throw new BadRequestException(`Cannot adjust advance onto cancelled invoice ${invoice.invoiceNo}`);
        }
        assertDivisionInScope(invoice.salesOrder?.divisionId ?? invoice.divisionId, allowedDivisionIds);

        const creditNotes = await this.getPostedCreditNoteTotal(invoice.id, companyId, manager);
        const outstanding = round2(
          Math.max(0, (Number(invoice.totalAmount) || 0) - (Number(invoice.paidAmount) || 0) - creditNotes),
        );
        if (amt > outstanding + 0.01) {
          throw new BadRequestException(
            `Adjustment amount Rs ${amt.toLocaleString()} exceeds outstanding Rs ${outstanding.toLocaleString()} for invoice ${invoice.invoiceNo}`,
          );
        }
        const safeAmt = Math.min(amt, outstanding);
        targets.push({ invoice, amount: safeAmt });
        totalRequested = round2(totalRequested + safeAmt);
      }

      if (totalRequested > totalAvailableAdvance + 0.01) {
        throw new BadRequestException(
          `Requested adjustment (Rs ${totalRequested.toLocaleString()}) exceeds available unallocated advance balance (Rs ${totalAvailableAdvance.toLocaleString()})`,
        );
      }

      // Consume advances FIFO across candidate receipts & settle invoices
      const receiptUsage = new Map<string, { receipt: CustomerReceipt; totalUsed: number; invoices: string[] }>();

      let recIdx = 0;
      let currentRecRemaining = advanceReceipts[0]
        ? round2(Number(advanceReceipts[0].unallocatedAdvanceAmount) || 0)
        : 0;

      for (const { invoice, amount: invTargetAmt } of targets) {
        await this.ensureInvoicePostedToLedgerAndGl(invoice, masterCustomer.id, safeUserId, manager);

        let invLeft = invTargetAmt;
        while (invLeft > 0.005 && recIdx < advanceReceipts.length) {
          if (currentRecRemaining <= 0.005) {
            recIdx += 1;
            if (recIdx >= advanceReceipts.length) break;
            currentRecRemaining = round2(Number(advanceReceipts[recIdx].unallocatedAdvanceAmount) || 0);
            continue;
          }

          const rec = advanceReceipts[recIdx];
          const chunk = round2(Math.min(invLeft, currentRecRemaining));
          if (chunk <= 0) break;

          rec.allocatedAmount = round2((Number(rec.allocatedAmount) || 0) + chunk);
          rec.unallocatedAdvanceAmount = round2(Math.max(0, (Number(rec.unallocatedAdvanceAmount) || 0) - chunk));
          rec.updatedBy = safeUserId || null;

          const usage = receiptUsage.get(rec.id) || { receipt: rec, totalUsed: 0, invoices: [] };
          usage.totalUsed = round2(usage.totalUsed + chunk);
          if (!usage.invoices.includes(invoice.invoiceNo)) usage.invoices.push(invoice.invoiceNo);
          receiptUsage.set(rec.id, usage);

          await allocRepo.save(
            allocRepo.create({
              companyId,
              receiptId: rec.id,
              customerId: masterCustomer.id,
              salesInvoiceId: invoice.id,
              invoiceNo: invoice.invoiceNo,
              allocationDate: adjDateStr,
              allocationType: AllocationType.ADVANCE_ADJUSTMENT,
              allocatedAmount: chunk,
              status: 'POSTED',
              notes: dto.notes?.trim() || `Advance adjusted from ${rec.receiptNumber}`,
              createdBy: safeUserId || null,
            }),
          );

          currentRecRemaining = round2(currentRecRemaining - chunk);
          invLeft = round2(invLeft - chunk);
        }

        const creditNotes = await this.getPostedCreditNoteTotal(invoice.id, companyId, manager);
        invoice.paidAmount = round2((Number(invoice.paidAmount) || 0) + invTargetAmt);
        const remainingBal = round2(
          Math.max(0, (Number(invoice.totalAmount) || 0) - invoice.paidAmount - creditNotes),
        );
        invoice.balance = remainingBal <= 0.005 ? 0 : remainingBal;
        invoice.status = invoice.balance <= 0 ? 'Paid' : 'Partial';
        await invRepo.save(invoice);
      }

      const journalsPosted: string[] = [];
      for (const usage of receiptUsage.values()) {
        await receiptRepo.save(usage.receipt);

        const j = await this.autoPosting.postAdvanceAdjustment({
          companyId,
          referenceId: usage.receipt.id,
          receiptNumber: usage.receipt.receiptNumber,
          invoiceNumbers: usage.invoices,
          adjustmentDate: adjDateObj,
          amount: usage.totalUsed,
          customerName: masterCustomer.name,
          actorId: safeUserId,
          manager,
        });
        journalsPosted.push(j.journalNumber);

        // Record zero-impact audit entry in customer_ledger so statement traces the adjustment with zero double-counting
        await this.customerLedgerService.recordEntry(
          companyId,
          masterCustomer.id,
          {
            transactionDate: adjDateObj,
            documentType: CustomerDocumentType.ADVANCE_ADJUSTMENT,
            documentNumber: `ADJ-${usage.receipt.receiptNumber}`,
            reference: `${usage.invoices.join(', ')} (Adjusted Rs ${usage.totalUsed.toLocaleString()})`,
            debit: 0,
            credit: 0,
            currency: masterCustomer.currencyCode || 'PKR',
            divisionId: usage.receipt.divisionId || targets[0]?.invoice?.divisionId || null,
            receiptId: usage.receipt.id,
            salesInvoiceId: targets.length === 1 ? targets[0].invoice.id : null,
            paymentMode: usage.receipt.paymentMode,
            notes:
              dto.notes?.trim() ||
              `Advance Rs ${usage.totalUsed.toLocaleString()} from ${usage.receipt.receiptNumber} applied against ${usage.invoices.join(', ')}`,
          },
          safeUserId,
          manager,
        );
      }

      return {
        customerId: masterCustomer.id,
        customerName: masterCustomer.name,
        totalAdjusted: totalRequested,
        settledInvoices: targets.map((t) => ({
          invoiceId: t.invoice.id,
          invoiceNo: t.invoice.invoiceNo,
          adjustedAmount: t.amount,
          newPaidAmount: t.invoice.paidAmount,
          newBalance: t.invoice.balance,
          newStatus: t.invoice.status,
        })),
        journalsPosted,
      };
    });
  }

  async clearCheque(
    id: string,
    dto: ClearChequeDto,
    userId: string | undefined,
    companyId: string,
    allowedDivisionIds?: DivisionAccess,
  ) {
    const safeUserId = isUuid(userId) ? userId : undefined;
    const clearDateStr = (dto.clearanceDate && String(dto.clearanceDate).slice(0, 10)) || new Date().toISOString().split('T')[0];

    await withTransaction(this.dataSource, async (manager) => {
      const receiptRepo = manager.getRepository(CustomerReceipt);
      const receipt = await receiptRepo.findOne({ where: { id, companyId } });
      if (!receipt) throw new NotFoundException(`Receipt '${id}' not found`);
      assertDivisionInScope(receipt.divisionId, allowedDivisionIds);

      if (receipt.clearanceStatus === ChequeClearanceStatus.BOUNCED) {
        throw new BadRequestException('Cannot clear a bounced cheque receipt');
      }
      if (receipt.clearanceStatus === ChequeClearanceStatus.CLEARED) {
        throw new BadRequestException('Receipt is already marked cleared');
      }

      const bankAcct = await this.resolveDepositAccount(
        companyId,
        CustomerPaymentMode.BANK_TRANSFER,
        ChequeClearanceStatus.CLEARED,
        dto.bankAccountId || receipt.bankAccountId || undefined,
        manager,
      );

      receipt.clearanceStatus = ChequeClearanceStatus.CLEARED;
      receipt.clearanceDate = clearDateStr;
      receipt.bankAccountId = bankAcct.accountId;
      if (dto.remarks?.trim()) {
        receipt.remarks = receipt.remarks ? `${receipt.remarks} | ${dto.remarks.trim()}` : dto.remarks.trim();
      }
      receipt.updatedBy = safeUserId || null;
      await receiptRepo.save(receipt);

      await this.autoPosting.postChequeClearance({
        companyId,
        receiptId: receipt.id,
        receiptNumber: receipt.receiptNumber,
        clearanceDate: new Date(`${clearDateStr}T00:00:00Z`),
        amount: Number(receipt.amount) || 0,
        bankAccountId: bankAcct.accountId,
        actorId: safeUserId,
        manager,
      });
    });

    return this.getReceipt(id, companyId, allowedDivisionIds);
  }

  async bounceCheque(
    id: string,
    dto: BounceChequeDto,
    userId: string | undefined,
    companyId: string,
    allowedDivisionIds?: DivisionAccess,
  ) {
    const safeUserId = isUuid(userId) ? userId : undefined;
    const bounceDateStr = (dto.bounceDate && String(dto.bounceDate).slice(0, 10)) || new Date().toISOString().split('T')[0];

    await withTransaction(this.dataSource, async (manager) => {
      const receiptRepo = manager.getRepository(CustomerReceipt);
      const allocRepo = manager.getRepository(CustomerReceiptAllocation);
      const invRepo = manager.getRepository(SalesInvoice);

      const receipt = await receiptRepo.findOne({ where: { id, companyId } });
      if (!receipt) throw new NotFoundException(`Receipt '${id}' not found`);
      assertDivisionInScope(receipt.divisionId, allowedDivisionIds);

      if (receipt.clearanceStatus === ChequeClearanceStatus.BOUNCED) {
        throw new BadRequestException('Receipt is already marked as bounced');
      }

      const allocations = await allocRepo.find({
        where: { receiptId: receipt.id, status: 'POSTED' },
      });

      let reversedInvoiceAmount = 0;
      for (const alloc of allocations) {
        const amt = round2(Number(alloc.allocatedAmount) || 0);
        reversedInvoiceAmount = round2(reversedInvoiceAmount + amt);
        alloc.status = 'REVERSED';
        await allocRepo.save(alloc);

        const inv = await invRepo.findOne({ where: { id: alloc.salesInvoiceId, companyId } });
        if (inv) {
          const creditNotes = await this.getPostedCreditNoteTotal(inv.id, companyId, manager);
          inv.paidAmount = round2(Math.max(0, (Number(inv.paidAmount) || 0) - amt));
          inv.balance = round2(Math.max(0, (Number(inv.totalAmount) || 0) - inv.paidAmount - creditNotes));
          inv.status = inv.paidAmount > 0 ? 'Partial' : 'Posted';
          await invRepo.save(inv);
        }
      }

      const totalAmt = round2(Number(receipt.amount) || 0);
      const reversedAdvanceAmount = round2(Math.max(0, totalAmt - reversedInvoiceAmount));

      await this.autoPosting.postChequeBounce({
        companyId,
        receiptId: receipt.id,
        receiptNumber: receipt.receiptNumber,
        bounceDate: new Date(`${bounceDateStr}T00:00:00Z`),
        totalAmount: totalAmt,
        reversedInvoiceAmount,
        reversedAdvanceAmount,
        creditAccountId:
          receipt.clearanceStatus === ChequeClearanceStatus.CLEARED ? receipt.bankAccountId : null,
        creditAccountCode:
          receipt.clearanceStatus === ChequeClearanceStatus.CLEARED ? '1010' : '1020',
        actorId: safeUserId,
        manager,
      });

      await this.customerLedgerService.recordEntry(
        companyId,
        receipt.customerId,
        {
          transactionDate: new Date(`${bounceDateStr}T00:00:00Z`),
          documentType: CustomerDocumentType.DEBIT_NOTE,
          documentNumber: `BNC-${receipt.receiptNumber}`,
          reference: `Cheque Bounced: ${receipt.chequeNumber || receipt.receiptNumber} (${dto.reason})`,
          debit: totalAmt,
          credit: 0,
          currency: receipt.currency || 'PKR',
          divisionId: receipt.divisionId,
          receiptId: receipt.id,
          paymentMode: receipt.paymentMode,
          notes: `Dishonored/Bounced Cheque Reversal for ${receipt.receiptNumber}: ${dto.reason}`,
        },
        safeUserId,
        manager,
      );

      receipt.clearanceStatus = ChequeClearanceStatus.BOUNCED;
      receipt.status = 'BOUNCED';
      receipt.allocatedAmount = 0;
      receipt.unallocatedAdvanceAmount = 0;
      receipt.remarks = `${receipt.remarks ? `${receipt.remarks} | ` : ''}BOUNCED (${bounceDateStr}): ${dto.reason}`;
      receipt.updatedBy = safeUserId || null;
      await receiptRepo.save(receipt);
    });

    return this.getReceipt(id, companyId, allowedDivisionIds);
  }

  async getCustomerOpenInvoicesAndAdvances(
    customerId: string,
    companyId: string,
    allowedDivisionIds?: DivisionAccess,
  ) {
    const masterCustomer = await this.resolveMasterCustomerRecord(customerId, companyId);
    if (!masterCustomer) {
      throw new NotFoundException(`Customer '${customerId}' not found`);
    }

    const { summary } = await this.customerLedgerService.getLedger(masterCustomer.id, companyId, { limit: 1000 });
    const filteredOpenInvoices =
      allowedDivisionIds && allowedDivisionIds !== 'ALL'
        ? summary.openInvoices.filter((inv: any) => !inv.divisionId || allowedDivisionIds.includes(inv.divisionId))
        : summary.openInvoices;

    // Load sales orders strictly belonging to this customer (bridging public.customers <-> erp_sales.customers)
    const matchingCustomerIds = await this.resolveMatchingCustomerIds(masterCustomer, companyId);
    const rawOrderRows: any[] =
      matchingCustomerIds.length > 0
        ? await this.receiptRepo.manager
            .query(
              `SELECT so.id,
                      so.order_number,
                      so.order_date,
                      so.division_id,
                      d.name AS division_name,
                      so.customer_po,
                      so.total_amount,
                      so.status
               FROM erp_sales.sales_orders so
               LEFT JOIN public.divisions d ON d.id = so.division_id
               WHERE so.company_id = $1
                 AND so.customer_id = ANY($2::uuid[])
                 AND so.deleted_at IS NULL
                 AND LOWER(COALESCE(so.status, 'draft')) <> 'cancelled'
               ORDER BY so.order_date DESC, so.created_at DESC
               LIMIT 200`,
              [companyId, matchingCustomerIds],
            )
            .catch(() => [])
        : [];

    const customerOrders = (rawOrderRows || [])
      .filter((o: any) => {
        if (!allowedDivisionIds || allowedDivisionIds === 'ALL') return true;
        return !o.division_id || allowedDivisionIds.includes(o.division_id);
      })
      .map((o: any) => ({
        id: o.id,
        orderNumber: o.order_number,
        orderDate: o.order_date ? String(o.order_date).slice(0, 10) : null,
        divisionId: o.division_id || null,
        divisionName: o.division_name || null,
        customerPo: o.customer_po ? String(o.customer_po).trim() : null,
        totalAmount: round2(Number(o.total_amount) || 0),
        status: o.status || 'Draft',
      }));

    const poBySoc = new Map<string, string>();
    for (const o of customerOrders) {
      if (o.orderNumber && o.customerPo) {
        poBySoc.set(String(o.orderNumber).toUpperCase(), o.customerPo);
      }
    }

    const enrichedOpenInvoices = filteredOpenInvoices.map((inv: any) => ({
      ...inv,
      customerPo:
        inv.customerPo ||
        (inv.socNumber ? poBySoc.get(String(inv.socNumber).toUpperCase()) || null : null),
    }));

    const poSet = new Set<string>();
    for (const o of customerOrders) {
      if (o.customerPo) poSet.add(o.customerPo);
    }
    for (const inv of enrichedOpenInvoices) {
      if (inv.customerPo) poSet.add(String(inv.customerPo).trim());
    }
    const customerPos = Array.from(poSet);

    const creditPolicy = this.customerCreditService
      ? await this.customerCreditService.evaluatePolicy(companyId, masterCustomer.id, 0)
      : null;

    return {
      customer: {
        id: masterCustomer.id,
        customerCode: masterCustomer.customerCode,
        name: masterCustomer.name,
        divisionId: masterCustomer.divisionId,
        paymentTerms: summary.paymentTerms,
        creditLimit: summary.creditLimit,
        creditDays: summary.creditDays,
        creditHold: summary.creditHold,
        creditHoldReason: summary.creditHoldReason,
        phone: masterCustomer.phone,
        city: masterCustomer.city,
        addressLine1: masterCustomer.addressLine1,
        taxNumber: masterCustomer.taxNumber,
      },
      summary,
      openInvoices: enrichedOpenInvoices,
      customerOrders,
      customerPos,
      availableAdvances: summary.availableAdvances,
      creditPolicy,
    };
  }

  async listReceipts(
    filter: {
      companyId: string;
      customerId?: string;
      divisionId?: string;
      paymentMode?: string;
      receiptType?: string;
      clearanceStatus?: string;
      fromDate?: string;
      toDate?: string;
      search?: string;
      page?: number;
      limit?: number;
      allowedDivisionIds?: DivisionAccess;
    },
  ) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(filter.limit) || 25));

    const whereClauses: string[] = ['r.company_id = $1', 'r.deleted_at IS NULL'];
    const params: any[] = [filter.companyId];
    let idx = 2;

    if (filter.customerId) {
      const mc = await this.resolveMasterCustomerRecord(filter.customerId, filter.companyId).catch(() => null);
      whereClauses.push(`r.customer_id = $${idx++}`);
      params.push(mc?.id || filter.customerId);
    }
    if (filter.divisionId) {
      whereClauses.push(`r.division_id = $${idx++}`);
      params.push(filter.divisionId);
    }
    if (filter.allowedDivisionIds && filter.allowedDivisionIds !== 'ALL') {
      if (filter.allowedDivisionIds.length === 0) {
        return {
          data: [],
          total: 0,
          kpis: { totalReceipts: 0, totalCollected: 0, totalAllocated: 0, unallocatedAdvances: 0, pendingClearance: 0 },
        };
      }
      whereClauses.push(`(r.division_id IS NULL OR r.division_id = ANY($${idx++}::uuid[]))`);
      params.push(filter.allowedDivisionIds);
    }
    if (filter.paymentMode && filter.paymentMode !== 'ALL') {
      whereClauses.push(`r.payment_mode = $${idx++}`);
      params.push(filter.paymentMode);
    }
    if (filter.receiptType && filter.receiptType !== 'ALL') {
      whereClauses.push(`r.receipt_type = $${idx++}`);
      params.push(filter.receiptType);
    }
    if (filter.clearanceStatus && filter.clearanceStatus !== 'ALL') {
      whereClauses.push(`r.clearance_status = $${idx++}`);
      params.push(filter.clearanceStatus);
    }
    if (filter.fromDate) {
      whereClauses.push(`r.receipt_date >= $${idx++}`);
      params.push(filter.fromDate);
    }
    if (filter.toDate) {
      whereClauses.push(`r.receipt_date <= $${idx++}`);
      params.push(filter.toDate);
    }
    if (filter.search && String(filter.search).trim()) {
      const term = `%${String(filter.search).trim()}%`;
      whereClauses.push(
        `(r.receipt_number ILIKE $${idx} OR COALESCE(c.name, '') ILIKE $${idx} OR COALESCE(c.customer_code, '') ILIKE $${idx} OR COALESCE(r.cheque_number, '') ILIKE $${idx} OR COALESCE(r.soc_number, '') ILIKE $${idx} OR COALESCE(r.po_reference, '') ILIKE $${idx} OR COALESCE(r.reference_no, '') ILIKE $${idx})`,
      );
      params.push(term);
      idx++;
    }

    const whereSql = whereClauses.join(' AND ');

    const [rows, countRows, kpiRows]: [any[], any[], any[]] = await Promise.all([
      this.receiptRepo.manager.query(
        `SELECT r.*,
                c.name AS customer_name,
                c.customer_code,
                c.phone AS customer_phone,
                c.city AS customer_city,
                c.address_line1 AS customer_address,
                c.tax_number AS customer_tax_number,
                d.name AS division_name,
                fa.account_code AS bank_account_code,
                fa.account_name AS bank_account_name,
                fj.journal_number
         FROM erp_sales.customer_receipts r
         LEFT JOIN public.customers c ON c.id = r.customer_id
         LEFT JOIN public.divisions d ON d.id = r.division_id
         LEFT JOIN public.finance_accounts fa ON fa.id = r.bank_account_id
         LEFT JOIN public.finance_journals fj ON fj.id = r.journal_id
         WHERE ${whereSql}
         ORDER BY r.receipt_date DESC, r.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, (page - 1) * limit],
      ),
      this.receiptRepo.manager.query(
        `SELECT COUNT(*)::int AS cnt
         FROM erp_sales.customer_receipts r
         LEFT JOIN public.customers c ON c.id = r.customer_id
         WHERE ${whereSql}`,
        params,
      ),
      this.receiptRepo.manager.query(
        `SELECT COUNT(*)::int AS total_receipts,
                COALESCE(SUM(CASE WHEN r.status = 'POSTED' AND r.clearance_status <> 'BOUNCED' THEN r.amount ELSE 0 END), 0) AS total_collected,
                COALESCE(SUM(CASE WHEN r.status = 'POSTED' AND r.clearance_status <> 'BOUNCED' THEN r.allocated_amount ELSE 0 END), 0) AS total_allocated,
                COALESCE(SUM(CASE WHEN r.status = 'POSTED' AND r.clearance_status <> 'BOUNCED' THEN r.unallocated_advance_amount ELSE 0 END), 0) AS unallocated_advances,
                COALESCE(SUM(CASE WHEN r.clearance_status = 'PENDING_CLEARANCE' AND r.status = 'POSTED' THEN r.amount ELSE 0 END), 0) AS pending_clearance
         FROM erp_sales.customer_receipts r
         LEFT JOIN public.customers c ON c.id = r.customer_id
         WHERE ${whereSql}`,
        params,
      ),
    ]);

    const receiptIds = (rows || []).map((r) => r.id);
    const allocRows: any[] =
      receiptIds.length > 0
        ? await this.receiptRepo.manager.query(
            `SELECT a.*, si.total_amount AS invoice_total, si.balance AS invoice_balance, si.status AS invoice_status
             FROM erp_sales.customer_receipt_allocations a
             LEFT JOIN erp_sales.sales_invoices si ON si.id = a.sales_invoice_id
             WHERE a.receipt_id = ANY($1::uuid[])
             ORDER BY a.created_at ASC`,
            [receiptIds],
          )
        : [];

    const allocByReceipt = new Map<string, any[]>();
    for (const a of allocRows || []) {
      const list = allocByReceipt.get(a.receipt_id) || [];
      list.push({
        id: a.id,
        salesInvoiceId: a.sales_invoice_id,
        invoiceNo: a.invoice_no,
        allocationDate: a.allocation_date ? String(a.allocation_date).slice(0, 10) : null,
        allocationType: a.allocation_type,
        allocatedAmount: round2(Number(a.allocated_amount) || 0),
        invoiceTotal: round2(Number(a.invoice_total) || 0),
        invoiceBalance: round2(Number(a.invoice_balance) || 0),
        invoiceStatus: a.invoice_status || null,
        status: a.status,
        notes: a.notes || null,
      });
      allocByReceipt.set(a.receipt_id, list);
    }

    const data = (rows || []).map((r) => ({
      id: r.id,
      companyId: r.company_id,
      divisionId: r.division_id,
      divisionName: r.division_name || null,
      customerId: r.customer_id,
      customerName: r.customer_name || 'Customer',
      customerCode: r.customer_code || '',
      customerPhone: r.customer_phone || null,
      customerCity: r.customer_city || null,
      customerAddress: r.customer_address || null,
      customerTaxNumber: r.customer_tax_number || null,
      receiptNumber: r.receipt_number,
      receiptDate: r.receipt_date ? String(r.receipt_date).slice(0, 10) : null,
      salesOrderId: r.sales_order_id || null,
      socNumber: r.soc_number || null,
      poReference: r.po_reference || null,
      receiptType: r.receipt_type,
      paymentMode: r.payment_mode,
      bankAccountId: r.bank_account_id || null,
      bankAccountCode: r.bank_account_code || null,
      bankAccountName: r.bank_account_name || null,
      bankName: r.bank_name || null,
      chequeNumber: r.cheque_number || null,
      chequeDate: r.cheque_date ? String(r.cheque_date).slice(0, 10) : null,
      clearanceDate: r.clearance_date ? String(r.clearance_date).slice(0, 10) : null,
      clearanceStatus: r.clearance_status,
      amount: round2(Number(r.amount) || 0),
      allocatedAmount: round2(Number(r.allocated_amount) || 0),
      unallocatedAdvanceAmount: round2(Number(r.unallocated_advance_amount) || 0),
      currency: r.currency || 'PKR',
      referenceNo: r.reference_no || null,
      remarks: r.remarks || null,
      journalId: r.journal_id || null,
      journalNumber: r.journal_number || null,
      status: r.status,
      allocations: allocByReceipt.get(r.id) || [],
      createdAt: r.created_at,
    }));

    const kpi = kpiRows?.[0] || {};
    return {
      data,
      total: Number(countRows?.[0]?.cnt || 0),
      kpis: {
        totalReceipts: Number(kpi.total_receipts || 0),
        totalCollected: round2(Number(kpi.total_collected) || 0),
        totalAllocated: round2(Number(kpi.total_allocated) || 0),
        unallocatedAdvances: round2(Number(kpi.unallocated_advances) || 0),
        pendingClearance: round2(Number(kpi.pending_clearance) || 0),
      },
    };
  }

  async getReceipt(id: string, companyId: string, allowedDivisionIds?: DivisionAccess) {
    if (!isUuid(id)) {
      throw new BadRequestException(`Invalid receipt ID format: ${id}`);
    }
    const result = await this.listReceipts({
      companyId,
      allowedDivisionIds,
      limit: 500,
    });
    const exact = result.data.find((r) => r.id === id);
    if (!exact) {
      const exists = await this.receiptRepo.findOne({ where: { id, companyId } });
      if (!exists) throw new NotFoundException(`Receipt '${id}' not found`);
      assertDivisionInScope(exists.divisionId, allowedDivisionIds);
      throw new ForbiddenException('You do not have access to this receipt');
    }
    return exact;
  }

  /**
   * Company/Division-wide Receivables Aging Summary across all customers.
   */
  async getCompanyAgingSummary(companyId: string, divisionId?: string, allowedDivisionIds?: DivisionAccess) {
    if (divisionId) assertDivisionInScope(divisionId, allowedDivisionIds);

    const custWhere: string[] = ['c.company_id = $1', 'c.deleted_at IS NULL'];
    const params: any[] = [companyId];
    let idx = 2;
    if (divisionId) {
      custWhere.push(`c.division_id = $${idx++}`);
      params.push(divisionId);
    } else if (allowedDivisionIds && allowedDivisionIds !== 'ALL') {
      if (allowedDivisionIds.length === 0) return { customers: [], totals: {} };
      custWhere.push(`(c.division_id IS NULL OR c.division_id = ANY($${idx++}::uuid[]))`);
      params.push(allowedDivisionIds);
    }

    const customers: any[] = await this.receiptRepo.manager.query(
      `SELECT c.id, c.customer_code, c.name, c.division_id, d.name AS division_name,
              c.credit_limit, c.credit_days, c.payment_terms, c.credit_hold
       FROM public.customers c
       LEFT JOIN public.divisions d ON d.id = c.division_id
       WHERE ${custWhere.join(' AND ')}
       ORDER BY c.customer_code ASC`,
      params,
    );

    const rows: any[] = [];
    for (const c of customers || []) {
      const { summary } = await this.customerLedgerService.getLedger(c.id, companyId, { limit: 1000 });
      if (
        Math.abs(summary.netReceivableBalance) > 0.01 ||
        summary.unadjustedAdvanceBalance > 0.01 ||
        summary.aging.totalOpenBalance > 0.01
      ) {
        rows.push({
          customerId: c.id,
          customerCode: c.customer_code,
          customerName: c.name,
          divisionId: c.division_id,
          divisionName: c.division_name,
          paymentTerms: summary.paymentTerms,
          creditLimit: Number(c.credit_limit) || 0,
          creditHold: Boolean(c.credit_hold),
          netReceivableBalance: summary.netReceivableBalance,
          unadjustedAdvanceBalance: summary.unadjustedAdvanceBalance,
          ...summary.aging,
        });
      }
    }

    const totals = rows.reduce(
      (acc, r) => ({
        netReceivableBalance: round2(acc.netReceivableBalance + r.netReceivableBalance),
        unadjustedAdvanceBalance: round2(acc.unadjustedAdvanceBalance + r.unadjustedAdvanceBalance),
        current: round2(acc.current + r.current),
        days1to30: round2(acc.days1to30 + r.days1to30),
        days31to60: round2(acc.days31to60 + r.days31to60),
        days61to90: round2(acc.days61to90 + r.days61to90),
        days90Plus: round2(acc.days90Plus + r.days90Plus),
        overdueAmount: round2(acc.overdueAmount + r.overdueAmount),
      }),
      {
        netReceivableBalance: 0,
        unadjustedAdvanceBalance: 0,
        current: 0,
        days1to30: 0,
        days31to60: 0,
        days61to90: 0,
        days90Plus: 0,
        overdueAmount: 0,
      },
    );

    return { customers: rows, totals };
  }
}
