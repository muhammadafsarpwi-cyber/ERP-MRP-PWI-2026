import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesInvoice, SalesCustomer, SalesOrder, SalesDelivery, SalesQuotation, SalesReturn } from '../entities';
import { Customer } from '../../customer/entities/customer.entity';
import { FinanceAutoPostingService } from '../../finance/services/finance-auto-posting.service';
import { CustomerLedgerService } from '../../customer/services/customer-ledger.service';
import { CustomerDocumentType } from '../../customer/entities/customer-ledger.entity';
import { customerNameMatchKeys } from './customer-match.util';
import {
  applyDivisionScopeFilter,
  assertDivisionInScope,
  DivisionAccess,
} from '../../../common/division-scope.util';

@Injectable()
export class SalesInvoiceService {
  private readonly logger = new Logger(SalesInvoiceService.name);

  constructor(
    @InjectRepository(SalesInvoice)
    private readonly repo: Repository<SalesInvoice>,
    @InjectRepository(SalesCustomer)
    private readonly customerRepo: Repository<SalesCustomer>,
    @InjectRepository(SalesOrder)
    private readonly orderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesDelivery)
    private readonly deliveryRepo: Repository<SalesDelivery>,
    @InjectRepository(SalesQuotation)
    private readonly quotationRepo: Repository<SalesQuotation>,
    @InjectRepository(SalesReturn)
    private readonly returnRepo: Repository<SalesReturn>,
    @InjectRepository(Customer)
    private readonly customerMasterRepo: Repository<Customer>,
    private readonly autoPosting: FinanceAutoPostingService,
    @Inject(forwardRef(() => CustomerLedgerService))
    private readonly customerLedgerService: CustomerLedgerService,
  ) {}

  async create(dto: any, userId?: string): Promise<SalesInvoice> {
    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId, companyId: dto.companyId },
    });
    if (!customer) {
      throw new BadRequestException('Customer not found for this company');
    }

    if (dto.salesOrderId) {
      const order = await this.orderRepo.findOne({
        where: { id: dto.salesOrderId, companyId: dto.companyId },
      });
      if (!order) {
        throw new BadRequestException('Sales order not found for this company');
      }
    }

    const invoiceNo = await this.generateInvoiceNumber(dto.companyId);

    const invoice = this.repo.create({
      companyId: dto.companyId,
      salesOrderId: dto.salesOrderId || null,
      customerId: dto.customerId,
      invoiceNo,
      invoiceDate: dto.invoiceDate || new Date().toISOString().split('T')[0],
      dueDate: dto.dueDate || null,
      subtotal: dto.subtotal || 0,
      discountAmount: dto.discountAmount || 0,
      taxAmount: dto.taxAmount || 0,
      totalAmount: dto.totalAmount || 0,
      paidAmount: 0,
      balance: dto.totalAmount || 0,
      status: 'Pending',
      createdBy: userId || null,
    });
    const saved = await this.repo.save(invoice) as SalesInvoice;

    return this.findOne(saved.id);
  }

  async findAll(filter: any): Promise<{ data: SalesInvoice[]; total: number }> {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 20;
    const {
      companyId, status, search, sortField = 'createdAt', sortOrder = 'DESC',
      allowedDivisionIds,
    } = filter;
    const qb = this.repo.createQueryBuilder('si')
      .leftJoinAndSelect('si.customer', 'customer')
      .leftJoinAndSelect('si.salesOrder', 'salesOrder');
    let hasWhere = false;
    if (companyId) { qb.where('si.companyId = :companyId', { companyId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('si.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('si.invoiceNo ILIKE :search', { search: `%${search}%` }); hasWhere = true; }
    // PROMPT #27 — `sales_invoices` has no `division_id` of its own; it
    // inherits the division of the order it bills. That relation is ALREADY
    // joined above, so the scope filter needs no new join and no schema change.
    // An invoice with no linked order has no division attribution, so
    // `includeUnassigned` is deliberately NOT set.
    applyDivisionScopeFilter(qb as any, 'salesOrder.divisionId', allowedDivisionIds);
    const validSortFields = ['createdAt', 'invoiceNo', 'invoiceDate', 'dueDate', 'status', 'totalAmount'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`si.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<any> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const invoice = await this.repo.findOne({
      where,
      relations: ['customer', 'salesOrder', 'salesOrder.items'],
    });
    if (!invoice) throw new NotFoundException(`Sales invoice with ID '${id}' not found`);

    // PROMPT #27 — inherits the billing order's division (TEST E).
    assertDivisionInScope(invoice.salesOrder?.divisionId, allowedDivisionIds);

    let relatedDelivery: any = null;
    let relatedQuotation: any = null;
    let relatedReturns: any[] = [];
    let creditNoteAmount = 0;
    let socTracking: any = null;

    try {
      if (invoice.salesOrderId) {
        relatedDelivery = await this.deliveryRepo.findOne({
          where: { salesOrderId: invoice.salesOrderId, companyId: invoice.companyId },
          select: ['id', 'deliveryNumber', 'deliveryDate', 'status', 'totalAmount'],
        });

        if (invoice.salesOrder?.quotationId) {
          relatedQuotation = await this.quotationRepo.findOne({
            where: { id: invoice.salesOrder.quotationId, companyId: invoice.companyId },
            select: ['id', 'quotationNumber', 'quotationDate', 'status', 'totalAmount'],
          });
        }

        // SOC-wise partial invoicing tracking
        if (invoice.salesOrder) {
          const allInvoicesForOrder = await this.repo.find({
            where: { salesOrderId: invoice.salesOrderId, companyId: invoice.companyId },
            select: ['id', 'invoiceNo', 'totalAmount', 'status'],
          });
          const orderTotal = Number(invoice.salesOrder.totalAmount) || 0;
          const totalInvoicedAgainstSoc = allInvoicesForOrder
            .filter(inv => inv.status !== 'Cancelled')
            .reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);
          const remainingSocBalance = Math.max(0, orderTotal - totalInvoicedAgainstSoc);

          socTracking = {
            orderNumber: invoice.salesOrder.orderNumber,
            orderDate: invoice.salesOrder.orderDate,
            orderTotal,
            totalInvoiced: totalInvoicedAgainstSoc,
            remainingBalance: remainingSocBalance,
            totalInvoicesCount: allInvoicesForOrder.length,
            invoicedPercent: orderTotal > 0 ? Math.min(100, Math.round((totalInvoicedAgainstSoc / orderTotal) * 100)) : 100,
          };
        }
      }
    } catch {
      // Non-fatal traceability lookup
    }

    try {
      const activeReturns = await this.returnRepo.find({
        where: { salesInvoiceId: invoice.id, companyId: invoice.companyId },
        select: ['id', 'returnNumber', 'returnDate', 'totalAmount', 'status', 'creditNoteNumber', 'creditPosted'],
      });
      relatedReturns = activeReturns;
      creditNoteAmount = activeReturns
        .filter(r => r.creditPosted)
        .reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
    } catch {
      creditNoteAmount = 0;
      relatedReturns = [];
    }

    const originalInvoiceAmount = Number(invoice.totalAmount) || 0;
    const paidAmount = Number(invoice.paidAmount) || 0;
    const outstandingAmount = Math.max(0, originalInvoiceAmount - paidAmount - creditNoteAmount);

    // Line items detail for presentation matching modern split-view
    let items = (invoice.salesOrder?.items || []).map((it: any, idx: number) => {
      const qty = Number(it.quantity || 1);
      const rate = Number(it.unitPrice || 0);
      const disc = Number(it.discountAmount || 0);
      const taxable = Math.max(0, (qty * rate) - disc);
      const gstRate = 18;
      const gstAmt = Number(it.taxAmount || ((taxable * gstRate) / 100));
      const amount = Number(it.lineTotal || (taxable + gstAmt));
      return {
        index: idx + 1,
        id: it.id,
        product: it.description || it.itemCode || 'Industrial Finished Wire Product',
        description: it.description || 'PWI Manufactured Finished Wire',
        itemCode: it.itemCode || 'PWI-FG-001',
        hsnCode: it.itemCode || '7217.10',
        quantity: qty,
        uom: it.uom || 'PCS',
        rate,
        discountAmount: disc,
        taxableAmount: taxable,
        gstRate,
        gstAmount: gstAmt,
        amount,
      };
    });

    if (items.length === 0) {
      const sub = Number(invoice.subtotal) || Number(invoice.totalAmount) || 0;
      const tax = Number(invoice.taxAmount) || 0;
      const disc = Number(invoice.discountAmount) || 0;
      const taxable = Math.max(0, sub - disc);
      items = [{
        index: 1,
        id: 'item-std-1',
        product: 'Finished Goods Wire / Manufactured Rods',
        description: 'Standard Order Batch Delivery',
        itemCode: 'PWI-FG-001',
        hsnCode: '7217.10',
        quantity: 1,
        uom: 'Lot',
        rate: sub,
        discountAmount: disc,
        taxableAmount: taxable,
        gstRate: 18,
        gstAmount: tax,
        amount: Number(invoice.totalAmount) || (taxable + tax),
      }];
    }

    return Object.assign(invoice, {
      items,
      socTracking,
      relatedDelivery,
      relatedQuotation,
      relatedReturns,
      originalInvoiceAmount,
      creditNoteAmount,
      outstandingAmount,
    });
  }

  async update(
    id: string, dto: any, userId?: string, companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ): Promise<SalesInvoice> {
    const invoice = await this.findOne(id, companyId, allowedDivisionIds);
    if (invoice.status !== 'Pending') {
      throw new BadRequestException('Can only update invoices in Pending status');
    }

    Object.assign(invoice, {
      salesOrderId: dto.salesOrderId ?? invoice.salesOrderId,
      customerId: dto.customerId ?? invoice.customerId,
      invoiceDate: dto.invoiceDate ?? invoice.invoiceDate,
      dueDate: dto.dueDate ?? invoice.dueDate,
      subtotal: dto.subtotal ?? invoice.subtotal,
      discountAmount: dto.discountAmount ?? invoice.discountAmount,
      taxAmount: dto.taxAmount ?? invoice.taxAmount,
      totalAmount: dto.totalAmount ?? invoice.totalAmount,
      balance: dto.totalAmount ?? invoice.totalAmount,
    });

    return this.repo.save(invoice);
  }

  async recordPayment(
    id: string, amount: number, userId?: string, companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ): Promise<SalesInvoice> {
    const invoice = await this.findOne(id, companyId, allowedDivisionIds);
    if (invoice.status === 'Cancelled') {
      throw new BadRequestException('Cannot record payment for a cancelled invoice');
    }
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    // Outstanding must account for posted credit notes; a stale stored balance is never trusted.
    // findOne() already computes creditNoteAmount from posted returns against this invoice.
    const creditApplied = Number(invoice.creditNoteAmount) || 0;
    const outstanding = Math.max(
      0,
      (Number(invoice.totalAmount) || 0) - (Number(invoice.paidAmount) || 0) - creditApplied,
    );
    if (amount > outstanding) {
      throw new BadRequestException('Payment amount exceeds the outstanding balance');
    }

    invoice.paidAmount = Number(invoice.paidAmount || 0) + amount;
    invoice.balance = Math.max(
      0,
      (Number(invoice.totalAmount) || 0) - Number(invoice.paidAmount) - creditApplied,
    );

    if (invoice.balance <= 0) {
      invoice.status = 'Paid';
    } else if (Number(invoice.paidAmount) > 0) {
      invoice.status = 'Partial';
    }

    const saved = await this.repo.save(invoice);

    // 1. Auto-post customer receipt journal: DR Cash, CR AR
    try {
      await this.autoPosting.postCustomerReceipt(invoice.companyId, invoice.invoiceNo, id, amount, userId);
    } catch (e: any) {
      this.logger.warn(`Auto-posting for receipt on invoice ${id} failed: ${e.message}`);
    }

    // 2. Post Credit to Customer Ledger (master customer id required by ledger FK)
    const masterCustomerId = await this.resolveMasterCustomerId(invoice.customerId, invoice.companyId);
    try {
      await this.customerLedgerService.recordEntry(
        invoice.companyId,
        masterCustomerId,
        {
          transactionDate: new Date(),
          documentType: CustomerDocumentType.CUSTOMER_PAYMENT,
          documentNumber: `REC-${invoice.invoiceNo}`,
          reference: invoice.invoiceNo,
          debit: 0,
          credit: Number(amount),
          currency: 'PKR',
          notes: `Payment received for sales invoice ${invoice.invoiceNo}`,
        },
        userId,
      );
    } catch (e: any) {
      this.logger.error(`Customer ledger receipt posting for invoice ${id} failed: ${e.message}`, e.stack);
    }

    return saved;
  }

  async post(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesInvoice> {
    const invoice = await this.findOne(id, companyId, allowedDivisionIds);
    if (invoice.status !== 'Pending') {
      throw new BadRequestException('Can only post invoices in Pending status');
    }
    invoice.status = 'Posted';
    const saved = await this.repo.save(invoice);

    // 1. Auto-post AR journal
    try {
      await this.autoPosting.postSalesInvoice(invoice.companyId, invoice.invoiceNo, id, Number(invoice.totalAmount), userId);
    } catch (e: any) {
      this.logger.warn(`Auto-posting for sales invoice ${id} failed: ${e.message}`);
    }

    // 2. Post Debit to Customer Ledger (master customer id required by ledger FK)
    const masterCustomerId = await this.resolveMasterCustomerId(invoice.customerId, invoice.companyId);
    try {
      await this.customerLedgerService.recordEntry(
        invoice.companyId,
        masterCustomerId,
        {
          transactionDate: invoice.invoiceDate,
          documentType: CustomerDocumentType.SALES_INVOICE,
          documentNumber: invoice.invoiceNo,
          reference: invoice.salesOrder?.orderNumber || invoice.invoiceNo,
          debit: Number(invoice.totalAmount),
          credit: 0,
          currency: 'PKR',
          dueDate: invoice.dueDate,
          notes: `Sales invoice ${invoice.invoiceNo} posted`,
        },
        userId,
      );
    } catch (e: any) {
      this.logger.error(`Customer ledger invoice posting for invoice ${id} failed: ${e.message}`, e.stack);
    }

    return saved;
  }

  /**
   * Map an ERP Sales customer to the master Customer record that owns the
   * Customer Ledger. Falls back to a normalized-name match for abbreviation
   * drift (e.g. "Frontier Construction Co" vs "Frontier Construction Company").
   * Returns the sales customer id only when no master record exists, in which
   * case the ledger entry fails and is logged as an error instead of silently
   * targeting a wrong customer.
   */
  private async resolveMasterCustomerId(salesCustomerId: string, companyId: string): Promise<string> {
    const direct = await this.customerMasterRepo.findOne({ where: { id: salesCustomerId } });
    if (direct) return direct.id;

    const salesCust = await this.customerRepo.findOne({ where: { id: salesCustomerId } });
    if (!salesCust) return salesCustomerId;

    const byName = await this.customerMasterRepo.findOne({
      where: [
        { companyId, name: salesCust.companyName },
        { companyId, legalName: salesCust.companyName },
      ],
    });
    if (byName) return byName.id;

    const byCode = await this.customerMasterRepo.findOne({
      where: { companyId, customerCode: salesCust.customerCode },
    });
    if (byCode) return byCode.id;

    try {
      const masters = await this.customerMasterRepo.find({
        where: { companyId },
        select: ['id', 'name', 'legalName', 'customerCode'],
      });
      const salesKeys = customerNameMatchKeys(salesCust.companyName);
      const hit = salesKeys.length > 0
        ? masters.find((m) =>
            customerNameMatchKeys(m.name).some((k) => salesKeys.includes(k)) ||
            customerNameMatchKeys(m.legalName).some((k) => salesKeys.includes(k)),
          )
        : undefined;
      if (hit) return hit.id;
    } catch (err: any) {
      this.logger.warn(`Normalized master customer lookup failed for ${salesCust.customerCode}: ${err.message}`);
    }

    return salesCustomerId;
  }

  async cancel(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesInvoice> {
    const invoice = await this.findOne(id, companyId, allowedDivisionIds);
    if (invoice.status === 'Cancelled') {
      throw new BadRequestException('Invoice is already cancelled');
    }
    if (invoice.status === 'Paid') {
      throw new BadRequestException('Cannot cancel a fully paid invoice');
    }
    invoice.status = 'Cancelled';
    return this.repo.save(invoice);
  }

  private async generateInvoiceNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SI-${year}-`;
    const result = await this.repo
      .createQueryBuilder('si')
      .select("MAX(CAST(SUBSTRING(si.invoiceNo FROM 'SI-[0-9]{4}-([0-9]+)') AS INT))", 'maxNum')
      .where('si.companyId = :companyId', { companyId })
      .andWhere('si.invoiceNo LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne();
    const maxNum = result?.maxNum || 0;
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  }
}
