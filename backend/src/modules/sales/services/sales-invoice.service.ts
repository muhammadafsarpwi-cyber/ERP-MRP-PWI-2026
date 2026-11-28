import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SalesInvoice, SalesInvoiceLine, SalesCustomer, SalesOrder, SalesDelivery, SalesQuotation, SalesReturn } from '../entities';
import { Customer } from '../../customer/entities/customer.entity';
import { FinanceAutoPostingService } from '../../finance/services/finance-auto-posting.service';
import { CustomerLedgerService } from '../../customer/services/customer-ledger.service';
import { CustomerDocumentType } from '../../customer/entities/customer-ledger.entity';
import { customerNameMatchKeys } from './customer-match.util';
import { withTransaction } from '../../../common/transaction.util';
import {
  extractAuditActor,
  isAdministratorRequest,
  recordAdminOverrideAudit,
} from '../../../common/utils/admin-override.util';
import { CustomerReceiptService } from './customer-receipt.service';
import {
  applyDivisionScopeFilter,
  assertDivisionInScope,
  DivisionAccess,
} from '../../../common/division-scope.util';
import {
  ensureSalesInvoiceSchema,
  extractSocNumber,
  formatCreditTermsLabel,
  generateNextSalesInvoiceNo,
  isUuid,
  resolvePaymentTermsAndDueDate,
} from './sales-invoice.util';

@Injectable()
export class SalesInvoiceService implements OnModuleInit {
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
    @Optional()
    @InjectRepository(SalesInvoiceLine)
    private readonly lineRepo?: Repository<SalesInvoiceLine>,
    @Optional()
    @Inject(forwardRef(() => CustomerReceiptService))
    private readonly customerReceiptService?: CustomerReceiptService,
    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

  async onModuleInit() {
    await ensureSalesInvoiceSchema((this.repo as any)?.manager, this.logger);
  }

  async create(dto: any, userId?: string): Promise<SalesInvoice> {
    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId, companyId: dto.companyId },
    });
    if (!customer) {
      throw new BadRequestException('Customer not found for this company');
    }

    let order: SalesOrder | null = null;
    if (dto.salesOrderId) {
      order = await this.orderRepo.findOne({
        where: { id: dto.salesOrderId, companyId: dto.companyId },
      });
      if (!order) {
        throw new BadRequestException('Sales order not found for this company');
      }
    }

    const invoiceNo = await this.generateInvoiceNumber(dto.companyId);
    const invoiceDate = dto.invoiceDate || new Date().toISOString().split('T')[0];
    const masterCust = await this.resolveMasterCustomerRecord(dto.customerId, dto.companyId);
    const { paymentTerms, dueDate } = resolvePaymentTermsAndDueDate({
      invoiceDate,
      requestedTerms: dto.paymentTerms,
      requestedDueDate: dto.dueDate,
      customerPaymentTerms: masterCust?.paymentTerms || null,
      customerCreditDays: masterCust?.creditDays ?? customer.creditDays,
    });

    const subtotal = Number(dto.subtotal || 0);
    const discountAmount = Number(dto.discountAmount || 0);
    const taxAmount = Number(dto.taxAmount || 0);
    const totalAmount = Number(dto.totalAmount ?? Math.max(0, subtotal - discountAmount + taxAmount));

    const invoice = this.repo.create({
      companyId: dto.companyId,
      salesOrderId: dto.salesOrderId || null,
      salesDeliveryId: dto.salesDeliveryId || null,
      deliveryNumber: dto.deliveryNumber || null,
      gatePassNumber: dto.gatePassNumber || null,
      divisionId: dto.divisionId || order?.divisionId || null,
      customerId: dto.customerId,
      invoiceNo,
      invoiceDate,
      dueDate,
      paymentTerms,
      documentType: dto.documentType || 'Tax Invoice',
      subtotal,
      discountAmount,
      taxAmount,
      totalAmount,
      paidAmount: 0,
      balance: totalAmount,
      status: 'Pending',
      notes: dto.notes || null,
      createdBy: isUuid(userId) ? userId : null,
    });
    const saved = (await this.repo.save(invoice)) as SalesInvoice;

    if (Array.isArray(dto.lines) && dto.lines.length > 0 && this.lineRepo && saved?.id) {
      try {
        const lineEntities = dto.lines.map((l: any, idx: number) => {
          const qty = Number(l.quantity || 1);
          const rate = Number(l.unitPrice ?? l.rate ?? 0);
          const disc = Number(l.discountAmount || l.discount || 0);
          const taxable = Math.max(0, qty * rate - disc);
          const taxRate = Number(l.taxRate ?? l.gstRate ?? 0);
          const lineTax = Number(l.taxAmount ?? ((taxable * taxRate) / 100));
          const lineTotal = Number(l.lineTotal ?? (taxable + lineTax));
          return this.lineRepo!.create({
            invoiceId: saved.id,
            lineNumber: idx + 1,
            itemId: isUuid(l.itemId) ? l.itemId : null,
            itemCode: l.itemCode || null,
            description: l.description || l.product || null,
            socNumber: l.socNumber || order?.orderNumber || null,
            quantity: qty,
            uomId: isUuid(l.uomId) ? l.uomId : null,
            uomCode: l.uomCode || l.uom || 'GRS',
            unitPrice: rate,
            discountAmount: disc,
            taxRate,
            taxAmount: lineTax,
            lineTotal,
          });
        });
        await this.lineRepo.save(lineEntities);
      } catch (err: any) {
        this.logger.warn(`Failed saving sales invoice lines for ${saved.invoiceNo}: ${err?.message || err}`);
      }
    }

    return this.findOne(saved.id);
  }

  private mapNormalizedItems(
    rawLines: any[],
    fallbackSoc?: string | null,
  ): Array<{
    index: number;
    id: string;
    itemId: string | null;
    product: string;
    description: string;
    itemCode: string | null;
    socNumber: string | null;
    quantity: number;
    uom: string;
    rate: number;
    discountAmount: number;
    taxableAmount: number;
    gstRate: number;
    gstAmount: number;
    amount: number;
  }> {
    return rawLines.map((it: any, idx: number) => {
      const qty = Number(it.quantity ?? 1);
      const rate = Number(it.unitPrice ?? it.rate ?? 0);
      const disc = Number(it.discountAmount ?? 0);
      const taxable = Math.max(0, Math.round((qty * rate - disc) * 100) / 100);
      const gstAmt = Math.round(Number(it.taxAmount ?? 0) * 100) / 100;
      const inferredRate =
        it.taxRate != null && Number(it.taxRate) > 0
          ? Number(it.taxRate)
          : taxable > 0 && gstAmt > 0
          ? Math.round((gstAmt / taxable) * 10000) / 100
          : 0;
      const amount =
        it.lineTotal != null && Number(it.lineTotal) > 0
          ? Math.round(Number(it.lineTotal) * 100) / 100
          : Math.round((taxable + gstAmt) * 100) / 100;
      const itemCode = it.itemCode || it.item?.itemCode || null;
      const itemName = it.item?.name || it.itemName || it.description || itemCode || 'Finished Goods Product';
      const socNumber = it.socNumber || extractSocNumber(it.description, fallbackSoc);

      return {
        index: idx + 1,
        id: it.id || `line-${idx + 1}`,
        itemId: it.itemId || it.item?.id || null,
        product: String(itemName),
        description: String(it.description || itemName),
        itemCode,
        socNumber,
        quantity: qty,
        uom: it.uomCode || it.uom?.code || (typeof it.uom === 'string' ? it.uom : '') || 'GRS',
        rate,
        discountAmount: disc,
        taxableAmount: taxable,
        gstRate: inferredRate,
        gstAmount: gstAmt,
        amount,
      };
    });
  }

  async findAll(filter: any): Promise<{ data: SalesInvoice[]; total: number; statusCounts?: any }> {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 20;
    const {
      companyId, status, customerId, search, sortField = 'createdAt', sortOrder = 'DESC',
      allowedDivisionIds,
    } = filter;
    const qb = this.repo.createQueryBuilder('si')
      .leftJoinAndSelect('si.customer', 'customer')
      .leftJoinAndSelect('si.salesOrder', 'salesOrder')
      .leftJoinAndSelect('salesOrder.division', 'orderDivision')
      .leftJoinAndSelect('si.division', 'division')
      .leftJoinAndSelect('si.salesDelivery', 'salesDelivery')
      .leftJoinAndSelect('si.lines', 'lines')
      .leftJoinAndSelect('lines.item', 'lineItem')
      .leftJoinAndSelect('lines.uom', 'lineUom');
    let hasWhere = false;
    if (companyId) { qb.where('si.companyId = :companyId', { companyId }); hasWhere = true; }
    if (customerId) { qb[hasWhere ? 'andWhere' : 'where']('si.customerId = :customerId', { customerId }); hasWhere = true; }
    if (status && String(status).toUpperCase() !== 'ALL') {
      const upper = String(status).toUpperCase();
      if (upper === 'PENDING') {
        qb[hasWhere ? 'andWhere' : 'where']("LOWER(COALESCE(si.status, 'pending')) IN ('pending', 'posted')");
      } else {
        qb[hasWhere ? 'andWhere' : 'where']('LOWER(si.status) = LOWER(:status)', { status });
      }
      hasWhere = true;
    }
    if (search) {
      qb[hasWhere ? 'andWhere' : 'where'](
        `(si.invoiceNo ILIKE :search
          OR COALESCE(si.deliveryNumber, '') ILIKE :search
          OR COALESCE(si.gatePassNumber, '') ILIKE :search
          OR COALESCE(customer.companyName, '') ILIKE :search
          OR COALESCE(customer.customerCode, '') ILIKE :search
          OR COALESCE(salesOrder.orderNumber, '') ILIKE :search
          OR COALESCE(salesDelivery.deliveryNumber, '') ILIKE :search
          OR COALESCE(salesDelivery.gatePassNumber, '') ILIKE :search)`,
        { search: `%${search}%` },
      );
      hasWhere = true;
    }
    // PROMPT #27 — keep parent order division scope enforcement invariant.
    applyDivisionScopeFilter(qb as any, 'salesOrder.divisionId', allowedDivisionIds);
    const validSortFields = ['createdAt', 'invoiceNo', 'invoiceDate', 'dueDate', 'status', 'totalAmount'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`si.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [rawData, total] = await qb.getManyAndCount();

    // Compute live status breakdown across all matching records (independent of pagination)
    let statusCounts = {
      all: total,
      pending: 0,
      awaitingApproval: 0,
      posted: 0,
      partial: 0,
      paid: 0,
      cancelled: 0,
    };
    try {
      const countQb = this.repo
        .createQueryBuilder('si')
        .leftJoin('si.salesOrder', 'salesOrder')
        .select('LOWER(COALESCE(si.status, \'pending\'))', 'statusKey')
        .addSelect('COUNT(si.id)', 'cnt');
      if (companyId) {
        countQb.where('si.companyId = :companyId', { companyId });
      }
      applyDivisionScopeFilter(countQb as any, 'salesOrder.divisionId', allowedDivisionIds);
      countQb.groupBy("LOWER(COALESCE(si.status, 'pending'))");
      const rawCounts: any[] = typeof (countQb as any).getRawMany === 'function' ? await (countQb as any).getRawMany() : [];
      if (rawCounts.length > 0) {
        let allSum = 0;
        for (const r of rawCounts) {
          const cnt = Number(r.cnt || 0);
          allSum += cnt;
          const k = String(r.statusKey || r.statuskey || '').toLowerCase();
          if (k === 'pending' || k === 'draft') {
            statusCounts.awaitingApproval += cnt;
            statusCounts.pending += cnt;
          } else if (k === 'posted') {
            statusCounts.posted += cnt;
            statusCounts.pending += cnt;
          } else if (k === 'partial') {
            statusCounts.partial += cnt;
          } else if (k === 'paid' || k === 'settled') {
            statusCounts.paid += cnt;
          } else if (k === 'cancelled') {
            statusCounts.cancelled += cnt;
          }
        }
        statusCounts.all = allSum;
      }
    } catch {
      // Non-fatal fallback on mocked QBs in unit tests
    }

    // Batch-enrich with master customer payment terms/NTN
    const masterByCode = new Map<string, any>();
    try {
      if (companyId && typeof this.customerMasterRepo?.find === 'function') {
        const masters = await this.customerMasterRepo.find({ where: { companyId } });
        for (const m of masters || []) {
          if (m.customerCode) masterByCode.set(m.customerCode, m);
        }
      }
    } catch {
      // Non-fatal
    }

    const data = rawData.map((inv: any) => {
      const master = inv.customer?.customerCode ? masterByCode.get(inv.customer.customerCode) : null;
      const divisionName = inv.division?.name || inv.salesOrder?.division?.name || null;
      const deliveryNumber = inv.deliveryNumber || inv.salesDelivery?.deliveryNumber || null;
      const gatePassNumber = inv.gatePassNumber || inv.salesDelivery?.gatePassNumber || null;
      const socNumber = inv.salesOrder?.orderNumber || null;
      const customerPo = inv.salesOrder?.customerPo || inv.salesDelivery?.customerPo || null;
      const paymentTerms = formatCreditTermsLabel(
        inv.paymentTerms || master?.paymentTerms,
        master?.creditDays ?? inv.customer?.creditDays,
      );
      const items =
        Array.isArray(inv.lines) && inv.lines.length > 0
          ? this.mapNormalizedItems(
              [...inv.lines].sort((a, b) => (a.lineNumber || 0) - (b.lineNumber || 0)),
              socNumber,
            )
          : undefined;

      return Object.assign(inv, {
        divisionName,
        deliveryNumber,
        gatePassNumber,
        socNumber,
        customerPo,
        paymentTerms,
        documentType: inv.documentType || 'Tax Invoice',
        relatedDelivery:
          inv.salesDelivery || deliveryNumber
            ? {
                id: inv.salesDeliveryId || inv.salesDelivery?.id || null,
                deliveryNumber,
                gatePassNumber,
              }
            : null,
        ...(items ? { items } : {}),
        ...(master
          ? {
              customerTaxNumber: master.taxNumber || null,
              customerStrn: master.salesTaxNumber || null,
            }
          : {}),
      });
    });

    return { data, total, statusCounts };
  }

  async findOne(id: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<any> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const invoice = await this.repo.findOne({
      where,
      relations: [
        'customer',
        'salesOrder',
        'salesOrder.division',
        'salesOrder.items',
        'salesOrder.items.item',
        'salesOrder.items.uom',
        'salesDelivery',
        'division',
        'lines',
        'lines.item',
        'lines.uom',
      ],
    });
    if (!invoice) throw new NotFoundException(`Sales invoice with ID '${id}' not found`);

    // PROMPT #27 — inherits the billing order's division (TEST E).
    assertDivisionInScope(invoice.salesOrder?.divisionId ?? invoice.divisionId, allowedDivisionIds);

    let relatedDelivery: any = invoice.salesDelivery || null;
    let relatedQuotation: any = null;
    let relatedReturns: any[] = [];
    let creditNoteAmount = 0;
    let socTracking: any = null;
    let masterCustomer: Customer | null = null;

    try {
      if (invoice.salesDeliveryId && typeof this.deliveryRepo?.findOne === 'function') {
        relatedDelivery = await this.deliveryRepo.findOne({
          where: { id: invoice.salesDeliveryId, companyId: invoice.companyId },
          relations: ['lines', 'lines.item', 'lines.uom'],
        });
      } else if (invoice.salesOrderId && typeof this.deliveryRepo?.findOne === 'function') {
        relatedDelivery = await this.deliveryRepo.findOne({
          where: { salesOrderId: invoice.salesOrderId, companyId: invoice.companyId },
          relations: ['lines', 'lines.item', 'lines.uom'],
        });
      }

      if (invoice.salesOrderId) {
        if (invoice.salesOrder?.quotationId && typeof this.quotationRepo?.findOne === 'function') {
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
          const totalInvoicedAgainstSoc = (allInvoicesForOrder || [])
            .filter((inv) => inv.status !== 'Cancelled')
            .reduce((sum, inv) => sum + (Number(inv.totalAmount) || 0), 0);
          const remainingSocBalance = Math.max(0, orderTotal - totalInvoicedAgainstSoc);

          socTracking = {
            orderNumber: invoice.salesOrder.orderNumber,
            orderDate: invoice.salesOrder.orderDate,
            orderTotal,
            totalInvoiced: totalInvoicedAgainstSoc,
            remainingBalance: remainingSocBalance,
            totalInvoicesCount: (allInvoicesForOrder || []).length,
            invoicedPercent: orderTotal > 0 ? Math.min(100, Math.round((totalInvoicedAgainstSoc / orderTotal) * 100)) : 100,
          };
        }
      }
    } catch {
      // Non-fatal traceability lookup
    }

    try {
      masterCustomer = await this.resolveMasterCustomerRecord(invoice.customerId, invoice.companyId);
    } catch {
      masterCustomer = null;
    }

    try {
      const activeReturns = await this.returnRepo.find({
        where: { salesInvoiceId: invoice.id, companyId: invoice.companyId },
        select: ['id', 'returnNumber', 'returnDate', 'totalAmount', 'status', 'creditNoteNumber', 'creditPosted'],
      });
      relatedReturns = activeReturns || [];
      creditNoteAmount = relatedReturns
        .filter((r) => r.creditPosted)
        .reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
    } catch {
      creditNoteAmount = 0;
      relatedReturns = [];
    }

    const originalInvoiceAmount = Number(invoice.totalAmount) || 0;
    const paidAmount = Number(invoice.paidAmount) || 0;
    const outstandingAmount = Math.max(0, originalInvoiceAmount - paidAmount - creditNoteAmount);
    const socNumber = invoice.salesOrder?.orderNumber || null;

    let items: any[] = [];
    if (Array.isArray(invoice.lines) && invoice.lines.length > 0) {
      items = this.mapNormalizedItems(
        [...invoice.lines].sort((a, b) => (a.lineNumber || 0) - (b.lineNumber || 0)),
        socNumber,
      );
    } else if (Array.isArray(relatedDelivery?.lines) && relatedDelivery.lines.length > 0) {
      items = this.mapNormalizedItems(relatedDelivery.lines, socNumber);
    } else if (Array.isArray(invoice.salesOrder?.items) && invoice.salesOrder.items.length > 0) {
      items = this.mapNormalizedItems(invoice.salesOrder.items, socNumber);
    }

    if (items.length === 0) {
      const sub = Number(invoice.subtotal) || Number(invoice.totalAmount) || 0;
      const tax = Number(invoice.taxAmount) || 0;
      const disc = Number(invoice.discountAmount) || 0;
      const taxable = Math.max(0, sub - disc);
      items = [{
        index: 1,
        id: 'item-std-1',
        itemId: null,
        product: 'Finished Goods Wire / Manufactured Rods',
        description: invoice.notes || 'Standard Order Batch Delivery',
        itemCode: null,
        socNumber,
        quantity: 1,
        uom: 'Lot',
        rate: sub,
        discountAmount: disc,
        taxableAmount: taxable,
        gstRate: taxable > 0 && tax > 0 ? Math.round((tax / taxable) * 10000) / 100 : 0,
        gstAmount: tax,
        amount: Number(invoice.totalAmount) || (taxable + tax),
      }];
    }

    const deliveryNumber = invoice.deliveryNumber || relatedDelivery?.deliveryNumber || null;
    const gatePassNumber = invoice.gatePassNumber || relatedDelivery?.gatePassNumber || null;
    const divisionName = invoice.division?.name || invoice.salesOrder?.division?.name || null;
    const customerPo = invoice.salesOrder?.customerPo || relatedDelivery?.customerPo || null;
    const paymentTerms = formatCreditTermsLabel(
      invoice.paymentTerms || masterCustomer?.paymentTerms,
      masterCustomer?.creditDays ?? invoice.customer?.creditDays,
    );

    if (invoice.customer && masterCustomer) {
      (invoice.customer as any).taxNumber = (invoice.customer as any).taxNumber || masterCustomer.taxNumber || null;
      (invoice.customer as any).salesTaxNumber = masterCustomer.salesTaxNumber || null;
      (invoice.customer as any).addressLine1 = (invoice.customer as any).addressLine1 || masterCustomer.addressLine1 || null;
      (invoice.customer as any).paymentTerms = paymentTerms;
    }

    return Object.assign(invoice, {
      items,
      divisionName,
      deliveryNumber,
      gatePassNumber,
      socNumber,
      customerPo,
      paymentTerms,
      documentType: invoice.documentType || 'Tax Invoice',
      socTracking,
      relatedDelivery:
        relatedDelivery || deliveryNumber
          ? {
              ...(relatedDelivery || {}),
              id: invoice.salesDeliveryId || relatedDelivery?.id || null,
              deliveryNumber,
              gatePassNumber,
            }
          : null,
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
    req?: any,
  ): Promise<SalesInvoice> {
    const invoice = await this.findOne(id, companyId, allowedDivisionIds);
    const statusUpper = String(invoice.status || 'Pending').toUpperCase();
    const isDraftOrPending = statusUpper === 'PENDING' || statusUpper === 'DRAFT';
    const isAdmin = req ? await isAdministratorRequest(req, this.repo.manager) : false;

    if (!isDraftOrPending) {
      if (!isAdmin) {
        throw new BadRequestException('Can only update invoices in Pending status');
      }
      if (statusUpper === 'CANCELLED') {
        throw new BadRequestException('Cancelled invoices cannot be edited.');
      }
    }

    const nextTotal = Number(dto.totalAmount ?? invoice.totalAmount ?? 0);
    const paidAmt = Number(invoice.paidAmount ?? 0);
    const creditAmt = Number(invoice.creditNoteAmount ?? 0);
    if (!isDraftOrPending && nextTotal < paidAmt - 0.01) {
      throw new BadRequestException(
        `Invoice total (${nextTotal}) cannot be reduced below already paid amount (${paidAmt}).`,
      );
    }

    Object.assign(invoice, {
      salesOrderId: dto.salesOrderId ?? invoice.salesOrderId,
      customerId: dto.customerId ?? invoice.customerId,
      invoiceDate: dto.invoiceDate ?? invoice.invoiceDate,
      dueDate: dto.dueDate ?? invoice.dueDate,
      subtotal: dto.subtotal ?? invoice.subtotal,
      discountAmount: dto.discountAmount ?? invoice.discountAmount,
      taxAmount: dto.taxAmount ?? invoice.taxAmount,
      totalAmount: nextTotal,
      balance: Math.max(0, Math.round((nextTotal - paidAmt - creditAmt) * 100) / 100),
    });

    const saved = await this.repo.save(invoice);

    if (!isDraftOrPending && isAdmin) {
      await recordAdminOverrideAudit(this.repo.manager, {
        actor: extractAuditActor(req),
        targetType: 'SALES_INVOICE',
        targetId: saved.id,
        targetName: saved.invoiceNo,
        previousStatus: invoice.status,
        details: `Admin override edited sales invoice ${saved.invoiceNo} (Total: ${saved.totalAmount}, Balance: ${saved.balance})`,
      });
    }

    return saved;
  }

  async recordPayment(
    id: string,
    amountOrDto: number | {
      paidAmount?: number;
      amount?: number;
      paymentMode?: string;
      bankAccountId?: string;
      bankName?: string;
      chequeNumber?: string;
      chequeDate?: string;
      clearanceStatus?: string;
      receiptDate?: string;
      referenceNo?: string;
      notes?: string;
    },
    userId?: string,
    companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ): Promise<SalesInvoice & { receipt?: any }> {
    const paymentOpts = typeof amountOrDto === 'number' ? { paidAmount: amountOrDto } : (amountOrDto || {});
    const amount = Number(paymentOpts.paidAmount ?? paymentOpts.amount ?? 0);

    const invoice = await this.findOne(id, companyId, allowedDivisionIds);
    if (invoice.status === 'Cancelled') {
      throw new BadRequestException('Cannot record payment for a cancelled invoice');
    }
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    // Route through unified CustomerReceiptService when wired at runtime so single-invoice
    // payments create an official RCV voucher, allocation row, GL bank/cash journal, and Customer Ledger row atomically.
    if (this.customerReceiptService && typeof (this.dataSource as any)?.createQueryRunner === 'function') {
      const masterCustomerId = await this.resolveMasterCustomerId(invoice.customerId, invoice.companyId);
      const receipt = await this.customerReceiptService.createReceipt(
        {
          companyId: invoice.companyId,
          customerId: masterCustomerId,
          divisionId: invoice.divisionId || invoice.salesOrder?.divisionId || undefined,
          receiptDate: paymentOpts.receiptDate,
          salesOrderId: invoice.salesOrderId || undefined,
          socNumber: invoice.salesOrder?.orderNumber || invoice.socNumber || undefined,
          receiptType: 'INVOICE_PAYMENT',
          paymentMode: (paymentOpts.paymentMode || 'CASH').toUpperCase(),
          bankAccountId: paymentOpts.bankAccountId,
          bankName: paymentOpts.bankName,
          chequeNumber: paymentOpts.chequeNumber,
          chequeDate: paymentOpts.chequeDate,
          clearanceStatus: paymentOpts.clearanceStatus || 'CLEARED',
          amount,
          referenceNo: paymentOpts.referenceNo || invoice.invoiceNo,
          remarks: paymentOpts.notes || `Payment received for sales invoice ${invoice.invoiceNo}`,
          allocations: [{ salesInvoiceId: invoice.id, allocatedAmount: amount }],
        },
        userId,
        invoice.companyId,
        allowedDivisionIds,
      );
      const refreshed = await this.findOne(id, invoice.companyId, allowedDivisionIds);
      return Object.assign(refreshed, { receipt });
    }

    // Standalone unit-test fallback
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

    try {
      await this.autoPosting.postCustomerReceipt(invoice.companyId, invoice.invoiceNo, id, amount, userId);
    } catch (e: any) {
      this.logger.warn(`Auto-posting for receipt on invoice ${id} failed: ${e.message}`);
    }

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

    const masterCustomerId = await this.resolveMasterCustomerId(invoice.customerId, invoice.companyId);

    const runPostWork = async (manager?: any): Promise<SalesInvoice> => {
      const invRepo = manager ? manager.getRepository(SalesInvoice) : this.repo;
      invoice.status = 'Posted';
      const saved = await invRepo.save(invoice);

      try {
        await this.autoPosting.postSalesInvoice(
          invoice.companyId,
          invoice.invoiceNo,
          id,
          Number(invoice.totalAmount),
          userId,
          manager || undefined,
          invoice.invoiceDate ? new Date(invoice.invoiceDate) : new Date(),
          {
            subtotal: Number(invoice.subtotal || 0),
            taxAmount: Number(invoice.taxAmount || 0),
            divisionId: invoice.divisionId || invoice.salesOrder?.divisionId || null,
            customerId: masterCustomerId || invoice.customerId || null,
          },
        );
      } catch (e: any) {
        this.logger.warn(`Auto-posting for sales invoice ${id} failed: ${e.message}`);
      }

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
            paymentTerms: invoice.paymentTerms || 'Cash / Immediate',
            divisionId: invoice.divisionId || invoice.salesOrder?.divisionId || null,
            salesOrderId: invoice.salesOrderId || null,
            socNumber: invoice.salesOrder?.orderNumber || null,
            salesInvoiceId: invoice.id,
            notes: `Sales invoice ${invoice.invoiceNo} posted`,
          },
          userId,
          ...(manager ? [manager] : []),
        );
      } catch (e: any) {
        this.logger.error(`Customer ledger invoice posting for invoice ${id} failed: ${e.message}`, e.stack);
      }

      return saved;
    };

    if (typeof (this.dataSource as any)?.createQueryRunner === 'function') {
      return withTransaction(this.dataSource!, (manager) => runPostWork(manager));
    }
    return runPostWork();
  }

  /**
   * Map an ERP Sales customer to the master Customer record that owns the
   * Customer Ledger. Falls back to a normalized-name match for abbreviation
   * drift (e.g. "Frontier Construction Co" vs "Frontier Construction Company").
   * Returns the sales customer id only when no master record exists, in which
   * case the ledger entry fails and is logged as an error instead of silently
   * targeting a wrong customer.
   */
  private async resolveMasterCustomerRecord(salesCustomerId: string, companyId: string): Promise<Customer | null> {
    const direct = await this.customerMasterRepo.findOne({ where: { id: salesCustomerId } });
    if (direct) return direct;

    const salesCust = await this.customerRepo.findOne({ where: { id: salesCustomerId } });
    if (!salesCust) return null;

    const byName = await this.customerMasterRepo.findOne({
      where: [
        { companyId, name: salesCust.companyName },
        { companyId, legalName: salesCust.companyName },
      ],
    });
    if (byName) return byName;

    const byCode = await this.customerMasterRepo.findOne({
      where: { companyId, customerCode: salesCust.customerCode },
    });
    if (byCode) return byCode;

    try {
      const masters = await this.customerMasterRepo.find({
        where: { companyId },
        select: ['id', 'name', 'legalName', 'customerCode', 'paymentTerms', 'creditDays', 'taxNumber', 'salesTaxNumber', 'addressLine1'],
      });
      const salesKeys = customerNameMatchKeys(salesCust.companyName);
      const hit = salesKeys.length > 0
        ? masters.find((m) =>
            customerNameMatchKeys(m.name).some((k) => salesKeys.includes(k)) ||
            customerNameMatchKeys(m.legalName).some((k) => salesKeys.includes(k)),
          )
        : undefined;
      if (hit) return hit;
    } catch (err: any) {
      this.logger.warn(`Normalized master customer lookup failed for ${salesCust.customerCode}: ${err.message}`);
    }

    return null;
  }

  private async resolveMasterCustomerId(salesCustomerId: string, companyId: string): Promise<string> {
    const resolved = await this.resolveMasterCustomerRecord(salesCustomerId, companyId);
    return resolved?.id || salesCustomerId;
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

  /**
   * Move an invoice to the Recycle Bin.
   *
   * AN ACCOUNTING GUARD, not a convenience one. An invoice is a financial
   * record: if any money has been recorded against it (`paid_amount > 0`), or
   * it has been posted or paid in full, hiding the row would leave the
   * receivables ledger referencing a document no operator can see. Those must
   * be voided on the accounts screen so the reversal lands in the ledger; only
   * a never-touched invoice may simply be recycled.
   */
  async remove(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesInvoice> {
    const invoice = await this.findOne(id, companyId, allowedDivisionIds);
    const status = String(invoice.status || '').toLowerCase();
    const paid = Number(invoice.paidAmount ?? 0);

    if (paid > 0) {
      throw new BadRequestException(
        'This invoice has payments recorded against it and cannot be recycled. ' +
          'Void it on the accounts screen so the reversal lands in the ledger.',
      );
    }
    if (['paid', 'posted', 'settled'].includes(status)) {
      throw new BadRequestException(
        `A ${invoice.status} invoice is a financial record and cannot be recycled. Void it instead.`,
      );
    }

    invoice.deletedAt = new Date();
    invoice.deletedBy = userId || null;
    return this.repo.save(invoice);
  }

  private async generateInvoiceNumber(_companyId?: string): Promise<string> {
    return generateNextSalesInvoiceNo(this.repo);
  }
}
