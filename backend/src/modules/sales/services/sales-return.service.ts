import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, EntityManager } from 'typeorm';
import {
  SalesReturn, SalesReturnLine, SalesCustomer, SalesOrder,
  SalesOrderItem, SalesInvoice, SalesDelivery, SalesDeliveryLine,
} from '../entities';
import { Item, ItemType } from '../../item/entities/item.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { Customer } from '../../customer/entities/customer.entity';
import { CustomerLedgerEntry, CustomerDocumentType } from '../../customer/entities/customer-ledger.entity';
import { StockLedger } from '../../inventory/entities';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { CustomerLedgerService } from '../../customer/services/customer-ledger.service';
import { CreateSalesReturnDto } from '../dto';
import { customerNameMatchKeys } from './customer-match.util';
import { isCommittedReturnStatus } from './sales-return-status.util';

@Injectable()
export class SalesReturnService {
  private readonly logger = new Logger(SalesReturnService.name);

  constructor(
    @InjectRepository(SalesReturn)
    private readonly repo: Repository<SalesReturn>,
    @InjectRepository(SalesReturnLine)
    private readonly lineRepo: Repository<SalesReturnLine>,
    @InjectRepository(SalesCustomer)
    private readonly customerRepo: Repository<SalesCustomer>,
    @InjectRepository(Customer)
    private readonly customerMasterRepo: Repository<Customer>,
    @InjectRepository(SalesOrder)
    private readonly orderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderItem)
    private readonly orderItemRepo: Repository<SalesOrderItem>,
    @InjectRepository(SalesInvoice)
    private readonly invoiceRepo: Repository<SalesInvoice>,
    @InjectRepository(SalesDelivery)
    private readonly deliveryRepo: Repository<SalesDelivery>,
    @InjectRepository(SalesDeliveryLine)
    private readonly deliveryLineRepo: Repository<SalesDeliveryLine>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(StockLedger)
    private readonly stockLedgerRepo: Repository<StockLedger>,
    @InjectRepository(CustomerLedgerEntry)
    private readonly customerLedgerRepo: Repository<CustomerLedgerEntry>,
    @Inject(forwardRef(() => StockLedgerService))
    private readonly stockLedgerService: StockLedgerService,
    @Inject(forwardRef(() => InventoryBalanceService))
    private readonly balanceService: InventoryBalanceService,
    @Inject(forwardRef(() => CustomerLedgerService))
    private readonly customerLedgerService: CustomerLedgerService,
  ) {}

  async create(dto: CreateSalesReturnDto, userId?: string): Promise<SalesReturn> {
    if (!dto.customerId) {
      throw new BadRequestException('Customer is required for Sales Return');
    }
    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId, companyId: dto.companyId },
    });
    if (!customer) {
      throw new BadRequestException('Customer not found for this company');
    }

    if (!dto.salesInvoiceId) {
      throw new BadRequestException('Sales invoice is required for Sales Return');
    }

    const invoice = await this.invoiceRepo.findOne({
      where: { id: dto.salesInvoiceId, companyId: dto.companyId },
    });
    if (!invoice) {
      throw new BadRequestException('Sales invoice not found for this company');
    }
    if (invoice.customerId !== dto.customerId) {
      throw new BadRequestException('Sales invoice does not belong to the selected customer');
    }
    if (!dto.salesOrderId && invoice.salesOrderId) {
      dto.salesOrderId = invoice.salesOrderId;
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

    // Auto-detect Delivery Note if not explicitly provided
    let deliveryId = dto.salesDeliveryId || null;
    if (!deliveryId && dto.salesOrderId) {
      const del = await this.deliveryRepo.findOne({
        where: { salesOrderId: dto.salesOrderId, companyId: dto.companyId },
        order: { createdAt: 'DESC' },
      });
      if (del) deliveryId = del.id;
    }

    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one return line item is required');
    }

    // Return Quantity Validation: Must never exceed Original Delivered - Previously Returned
    await this.validateReturnQuantities(dto.companyId!, dto.salesInvoiceId, dto.salesOrderId, dto.lines);

    const returnNumber = await this.generateReturnNumber(dto.companyId!);

    const salesReturn = this.repo.create({
      companyId: dto.companyId,
      salesOrderId: dto.salesOrderId || null,
      salesInvoiceId: dto.salesInvoiceId || null,
      salesDeliveryId: deliveryId,
      customerId: dto.customerId,
      warehouseId: dto.warehouseId || null,
      returnNumber,
      returnDate: dto.returnDate || new Date().toISOString().split('T')[0],
      reason: dto.reason || null,
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      status: 'DRAFT',
      stockPosted: false,
      creditPosted: false,
      currency: dto.currency || 'PKR',
      notes: dto.notes || null,
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(salesReturn);

    let subtotal = 0;
    let totalTax = 0;
    let totalAmount = 0;
    let lineNumber = 1;

    for (const lineDto of dto.lines) {
      const qty = Number(lineDto.quantity);
      if (qty <= 0 || isNaN(qty)) {
        throw new BadRequestException('Return line quantity must be greater than zero');
      }
      if (!lineDto.itemId) {
        throw new BadRequestException('Item ID is required for each return line');
      }
      const unitPrice = Number(lineDto.unitPrice);
      const discount = Number(lineDto.discountAmount || 0);
      const taxAmount = Number(lineDto.taxAmount || 0);
      const lineSubtotal = qty * unitPrice - discount;
      const lineTotal = lineDto.lineTotal !== undefined ? Number(lineDto.lineTotal) : (lineSubtotal + taxAmount);
      const rawCondition = (lineDto.condition || 'GOOD').toUpperCase();
      const validConditions = ['GOOD', 'DAMAGED', 'REJECTED', 'SCRAP', 'REWORK_REQUIRED'];
      const condition = validConditions.includes(rawCondition) ? rawCondition : 'GOOD';

      const line = this.lineRepo.create({
        returnId: saved.id,
        lineNumber: lineNumber++,
        itemId: lineDto.itemId,
        description: lineDto.description || null,
        quantity: qty,
        uomId: lineDto.uomId,
        unitPrice,
        discountAmount: discount,
        taxAmount,
        lineTotal,
        condition,
        salesDeliveryLineId: lineDto.salesDeliveryLineId || null,
        reason: lineDto.reason || null,
      });
      await this.lineRepo.save(line);

      subtotal += lineSubtotal;
      totalTax += taxAmount;
      totalAmount += lineTotal;
    }

    saved.subtotal = Math.round(subtotal * 10000) / 10000;
    saved.taxAmount = Math.round(totalTax * 10000) / 10000;
    saved.totalAmount = Math.round(totalAmount * 10000) / 10000;
    await this.repo.save(saved);

    return this.findOne(saved.id, dto.companyId);
  }

  async update(id: string, dto: any, userId?: string, companyId?: string): Promise<SalesReturn> {
    const salesReturn = await this.findOne(id, companyId);
    if (salesReturn.status !== 'DRAFT') {
      throw new BadRequestException('Can only update returns in DRAFT status');
    }

    if (dto.lines && dto.lines.length > 0) {
      await this.validateReturnQuantities(
        salesReturn.companyId,
        dto.salesInvoiceId || salesReturn.salesInvoiceId,
        dto.salesOrderId || salesReturn.salesOrderId,
        dto.lines,
        salesReturn.id,
      );

      await this.lineRepo.delete({ returnId: id });
      let subtotal = 0;
      let totalTax = 0;
      let totalAmount = 0;
      let lineNumber = 1;

      for (const lineDto of dto.lines) {
        const qty = Number(lineDto.quantity);
        const unitPrice = Number(lineDto.unitPrice);
        const discount = Number(lineDto.discountAmount || 0);
        const taxAmount = Number(lineDto.taxAmount || 0);
        const lineSubtotal = qty * unitPrice - discount;
        const lineTotal = lineDto.lineTotal !== undefined ? Number(lineDto.lineTotal) : (lineSubtotal + taxAmount);

        const line = this.lineRepo.create({
          returnId: id,
          lineNumber: lineNumber++,
          itemId: lineDto.itemId,
          description: lineDto.description || null,
          quantity: qty,
          uomId: lineDto.uomId,
          unitPrice,
          discountAmount: discount,
          taxAmount,
          lineTotal,
          condition: lineDto.condition || 'GOOD',
          salesDeliveryLineId: lineDto.salesDeliveryLineId || null,
          reason: lineDto.reason || null,
        });
        await this.lineRepo.save(line);

        subtotal += lineSubtotal;
        totalTax += taxAmount;
        totalAmount += lineTotal;
      }
      salesReturn.subtotal = Math.round(subtotal * 10000) / 10000;
      salesReturn.taxAmount = Math.round(totalTax * 10000) / 10000;
      salesReturn.totalAmount = Math.round(totalAmount * 10000) / 10000;
    }

    if (dto.returnDate) salesReturn.returnDate = dto.returnDate;
    if (dto.reason !== undefined) salesReturn.reason = dto.reason;
    if (dto.warehouseId !== undefined) salesReturn.warehouseId = dto.warehouseId;
    if (dto.notes !== undefined) salesReturn.notes = dto.notes;
    salesReturn.updatedBy = userId || null;

    await this.repo.save(salesReturn);
    return this.findOne(id, companyId);
  }

  async findAll(filter: any): Promise<{ data: SalesReturn[]; total: number }> {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 20;
    const { companyId, status, search, customerId, sortField = 'createdAt', sortOrder = 'DESC' } = filter;

    const qb = this.repo.createQueryBuilder('sr')
      .leftJoinAndSelect('sr.customer', 'customer')
      .leftJoinAndSelect('sr.salesOrder', 'salesOrder')
      .leftJoinAndSelect('sr.salesInvoice', 'salesInvoice')
      .leftJoinAndSelect('sr.salesDelivery', 'salesDelivery')
      .leftJoinAndSelect('sr.warehouse', 'warehouse')
      .leftJoinAndSelect('sr.lines', 'lines')
      .leftJoinAndSelect('lines.item', 'item')
      .leftJoinAndSelect('lines.uom', 'uom');

    let hasWhere = false;
    if (companyId) {
      qb.where('sr.companyId = :companyId', { companyId });
      hasWhere = true;
    }
    if (customerId) {
      qb[hasWhere ? 'andWhere' : 'where']('sr.customerId = :customerId', { customerId });
      hasWhere = true;
    }
    if (status && status !== 'All statuses') {
      qb[hasWhere ? 'andWhere' : 'where']('sr.status = :status', { status });
      hasWhere = true;
    }
    if (search) {
      qb[hasWhere ? 'andWhere' : 'where'](
        '(sr.returnNumber ILIKE :search OR customer.companyName ILIKE :search OR sr.creditNoteNumber ILIKE :search)',
        { search: `%${search}%` },
      );
      hasWhere = true;
    }

    const validSortFields = ['createdAt', 'returnNumber', 'returnDate', 'status', 'totalAmount'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    qb.orderBy(`sr.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string, companyId?: string): Promise<any> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const where: any = { id };
    if (companyId) where.companyId = companyId;

    const salesReturn = await this.repo.findOne({
      where,
      relations: [
        'customer',
        'salesOrder',
        'salesInvoice',
        'salesDelivery',
        'warehouse',
        'lines',
        'lines.item',
        'lines.uom',
      ],
    });
    if (!salesReturn) {
      throw new NotFoundException(`Sales return with ID '${id}' not found`);
    }

    // Traceability lookups: Stock Ledger & Customer Ledger
    let stockLedgerEntries: StockLedger[] = [];
    let customerLedgerEntry: CustomerLedgerEntry | null = null;
    let customerOutstanding: number = 0;

    try {
      stockLedgerEntries = await this.stockLedgerRepo.find({
        where: { referenceId: salesReturn.id, companyId: salesReturn.companyId },
        relations: ['warehouse'],
      });
    } catch {
      stockLedgerEntries = [];
    }

    try {
      if (salesReturn.creditNoteNumber) {
        customerLedgerEntry = await this.customerLedgerRepo.findOne({
          where: {
            documentNumber: salesReturn.creditNoteNumber,
            companyId: salesReturn.companyId,
          },
        });
      }
    } catch {
      customerLedgerEntry = null;
    }

    try {
      const masterCustId = await this.resolveMasterCustomerId(salesReturn.customerId, salesReturn.companyId);
      const summary = await this.customerLedgerService.getSummary(masterCustId, salesReturn.companyId);
      customerOutstanding = summary?.outstandingBalance || 0;
    } catch {
      customerOutstanding = 0;
    }

    // Enrich lines with reconciliation metrics (Req #3)
    let enrichedLines = salesReturn.lines || [];
    if (salesReturn.lines && salesReturn.lines.length > 0 && salesReturn.salesInvoiceId) {
      try {
        const returnableData = await this.getReturnableItems(salesReturn.salesInvoiceId, salesReturn.companyId);
        const returnableMap = new Map<string, any>(returnableData.items.map((it: any) => [it.itemId, it]));

        enrichedLines = salesReturn.lines.map((l: any) => {
          const rItem = returnableMap.get(l.itemId);
          const deliveredQuantity = rItem ? Number(rItem.deliveredQuantity) : Number(l.quantity);
          const totalPreviouslyReturned = rItem ? Number(rItem.previouslyReturnedQuantity) : 0;
          const currentReturnQuantity = Number(l.quantity);
          // Previously returned excluding this current return record
          const previouslyReturnedQuantity = Math.max(0, totalPreviouslyReturned - currentReturnQuantity);
          const remainingReturnableQuantity = Math.max(0, deliveredQuantity - previouslyReturnedQuantity);
          const netSoldQuantity = Math.max(0, deliveredQuantity - totalPreviouslyReturned);

          return Object.assign(l, {
            originalInvoiceQuantity: deliveredQuantity,
            deliveredQuantity,
            previouslyReturnedQuantity,
            currentReturnQuantity,
            remainingReturnableQuantity,
            netSoldQuantity,
          });
        });
      } catch (err: any) {
        this.logger.warn(`Could not enrich return lines with reconciliation quantities: ${err.message}`);
      }
    }

    return Object.assign(salesReturn, {
      lines: enrichedLines,
      stockLedgerEntries,
      customerLedgerEntry,
      customerOutstanding,
    });
  }

  async submit(id: string, userId?: string, companyId?: string): Promise<SalesReturn> {
    const salesReturn = await this.findOne(id, companyId);
    if (salesReturn.status === 'SUBMITTED') {
      return salesReturn;
    }
    if (salesReturn.status !== 'DRAFT') {
      throw new BadRequestException('Can only submit returns in DRAFT status');
    }

    salesReturn.status = 'SUBMITTED';
    salesReturn.updatedBy = userId || null;
    return this.repo.save(salesReturn);
  }

  async approve(id: string, userId?: string, companyId?: string): Promise<SalesReturn> {
    const salesReturn = await this.findOne(id, companyId);
    if (salesReturn.status === 'APPROVED') {
      return salesReturn;
    }
    if (salesReturn.status !== 'SUBMITTED') {
      throw new BadRequestException('Can only approve returns in SUBMITTED status (submit the return first)');
    }

    // In DRAFT/SUBMITTED state there is NO inventory movement (Req #5).
    // Approval moves status to APPROVED.
    salesReturn.status = 'APPROVED';
    salesReturn.approvedAt = new Date();
    salesReturn.approvedBy = userId || null;
    salesReturn.updatedBy = userId || null;
    return this.repo.save(salesReturn);
  }

  /**
   * 5. FINISHED GOODS STOCK RETURN
   * When APPROVED (or credit-first CREDITED) return is RECEIVED, atomic IN inventory posting to stock_ledger & inventory_balances.
   * Sellable Finished Goods Only (Req #4, #5).
   * GOOD -> eligible for Finished Goods sellable stock receipt.
   * DAMAGED, REJECTED, SCRAP, REWORK_REQUIRED -> must NOT silently enter sellable FG stock.
   * Idempotent: stock balance increases only once (Req #5, #16).
   * Runs inside a transaction with a pessimistic row lock so concurrent
   * receive/credit-note requests on the same return cannot double-post.
   */
  async receiveStock(id: string, warehouseId?: string, userId?: string, companyId?: string): Promise<SalesReturn> {
    const salesReturn = await this.findOne(id, companyId);

    // Fast-path idempotency guard (re-checked under row lock inside the transaction)
    if (salesReturn.stockPosted) {
      throw new BadRequestException('Finished goods stock has already been posted for this return');
    }

    if (!this.isReceiveAllowed(salesReturn.status)) {
      throw new BadRequestException('Can only receive stock for APPROVED or CREDITED returns');
    }

    // Determine target warehouse
    const targetWarehouseId = warehouseId || salesReturn.warehouseId || salesReturn.salesDelivery?.warehouseId;
    if (!targetWarehouseId) {
      // Fallback: pick first warehouse in company
      const defaultWh = await this.warehouseRepo.findOne({ where: { companyId: salesReturn.companyId } });
      if (!defaultWh) {
        throw new BadRequestException('A target warehouse must be selected for Finished Goods stock receipt');
      }
      salesReturn.warehouseId = defaultWh.id;
    } else {
      salesReturn.warehouseId = targetWarehouseId;
    }

    const lines = await this.lineRepo.find({
      where: { returnId: id },
      relations: ['item'],
    });

    if (lines.length === 0) {
      throw new BadRequestException('Sales return has no lines to receive');
    }

    const effectiveWarehouseId = salesReturn.warehouseId!;

    await this.repo.manager.transaction(async (manager) => {
      // Row lock: serialize concurrent receive/credit-note on this return
      const locked = await manager.getRepository(SalesReturn).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException(`Sales return with ID '${id}' not found`);
      }
      if (locked.stockPosted) {
        throw new BadRequestException('Finished goods stock has already been posted for this return');
      }
      if (!this.isReceiveAllowed(locked.status)) {
        throw new BadRequestException('Can only receive stock for APPROVED or CREDITED returns');
      }

      for (const line of lines) {
        if (!line.itemId) continue;
        const qty = Number(line.quantity);
        if (qty <= 0) continue;

        const condition = (line.condition || 'GOOD').toUpperCase();
        const isGood = condition === 'GOOD';

        // Authoritative Stock Ledger IN Transaction (Audit log for physical movement)
        await this.stockLedgerService.create({
          companyId: locked.companyId,
          transactionType: 'SALES_RETURN',
          transactionDate: new Date(),
          itemId: line.itemId,
          warehouseId: effectiveWarehouseId,
          quantity: qty,
          uomId: line.uomId!,
          direction: 'IN',
          referenceType: 'SALES_RETURN',
          referenceId: locked.id,
          referenceNumber: locked.returnNumber,
          notes: isGood
            ? `Sales return ${locked.returnNumber} received - Finished Goods Restocked from Customer (Condition: GOOD)`
            : `Sales return ${locked.returnNumber} received - Condition: ${condition} (QUARANTINE / NON-SELLABLE - NOT added to sellable stock)`,
          createdBy: userId,
        }, manager);

        // Authoritative Inventory Balance Update: ONLY for GOOD condition
        // DAMAGED, REJECTED, SCRAP, REWORK_REQUIRED must NOT enter normal sellable FG stock (Req #4)
        if (isGood) {
          await this.balanceService.updateBalance(
            locked.companyId,
            line.itemId,
            effectiveWarehouseId,
            null,
            null,
            line.uomId!,
            qty,
            'IN',
            manager,
          );
        }
      }

      locked.warehouseId = effectiveWarehouseId;
      locked.stockPosted = true;
      locked.status = locked.creditPosted ? 'COMPLETED' : 'RECEIVED';
      locked.updatedBy = userId || null;
      await manager.getRepository(SalesReturn).save(locked);
    });

    return this.findOne(id, companyId);
  }

  /** Receive is legal before credit (APPROVED), after credit (CREDITED), or re-runs on legacy RECEIVED rows. */
  private isReceiveAllowed(status?: string): boolean {
    return ['APPROVED', 'RECEIVED', 'CREDITED'].includes((status || '').toUpperCase());
  }

  /**
   * 7. CREDIT NOTE & 8. CUSTOMER LEDGER
   * Generates sequential Credit Note CN-YYYY-NNNNN and posts CREDIT to CustomerLedgerService.
   * Decreases Customer Outstanding balance and updates original Invoice balance
   * as max(0, total - paid - posted credit notes).
   * Idempotent: protects against duplicate credit note or ledger credit.
   * Runs inside a transaction with a pessimistic row lock (concurrent credit-note
   * or receive requests on the same return serialize) plus a per-company/year
   * advisory lock so CN-YYYY-NNNNN numbers are never duplicated.
   */
  async generateCreditNote(id: string, userId?: string, companyId?: string): Promise<SalesReturn> {
    const salesReturn = await this.findOne(id, companyId);

    // Fast-path idempotency guard (re-checked under row lock inside the transaction)
    if (salesReturn.creditPosted) {
      throw new BadRequestException('Credit Note has already been generated and posted for this return');
    }

    if (!this.isCreditAllowed(salesReturn.status)) {
      throw new BadRequestException('Can only generate Credit Note for APPROVED or RECEIVED returns');
    }

    const invoiceNo = salesReturn.salesInvoice?.invoiceNo || 'N/A';

    await this.repo.manager.transaction(async (manager) => {
      // Row lock: serialize concurrent credit-note/receive on this return
      const locked = await manager.getRepository(SalesReturn).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException(`Sales return with ID '${id}' not found`);
      }
      if (locked.creditPosted) {
        throw new BadRequestException('Credit Note has already been generated and posted for this return');
      }
      if (!this.isCreditAllowed(locked.status)) {
        throw new BadRequestException('Can only generate Credit Note for APPROVED or RECEIVED returns');
      }

      // Serialize Credit Note number generation per company/year (CN-YYYY-NNNNN uniqueness)
      const lockKey = `${locked.companyId}|SALES_CREDIT_NOTE|${new Date().getFullYear()}`;
      await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);

      const creditNoteNumber = locked.creditNoteNumber || (await this.generateCreditNoteNumber(locked.companyId, manager));
      const creditAmount = Number(locked.totalAmount);

      // Resolve Master Customer for CustomerLedger foreign key
      const masterCustomerId = await this.resolveMasterCustomerId(locked.customerId, locked.companyId);

      // Authoritative Customer Ledger Entry: CREDIT
      try {
        await this.customerLedgerService.recordEntry(
          locked.companyId,
          masterCustomerId,
          {
            transactionDate: new Date(),
            documentType: CustomerDocumentType.CREDIT_NOTE,
            documentNumber: creditNoteNumber,
            reference: `SR: ${locked.returnNumber} | INV: ${invoiceNo}`,
            debit: 0,
            credit: creditAmount,
            currency: locked.currency || 'PKR',
            notes: `Credit Note ${creditNoteNumber} for Sales Return ${locked.returnNumber} (Original Invoice: ${invoiceNo})`,
          },
          userId,
          manager,
        );
      } catch (e: any) {
        this.logger.error(`Failed to post Credit Note to Customer Ledger: ${e.message}`, e.stack);
        throw new BadRequestException(`Failed to post Credit Note to Customer Ledger: ${e.message}`);
      }

      locked.creditNoteNumber = creditNoteNumber;
      locked.creditNoteDate = new Date();
      locked.creditPosted = true;
      locked.status = locked.stockPosted ? 'COMPLETED' : 'CREDITED';
      locked.updatedBy = userId || null;
      await manager.getRepository(SalesReturn).save(locked);

      // Automatically adjust original Sales Invoice balance if linked.
      // Balance = max(0, total - paid - all posted credit notes), so credits and
      // payments can never overwrite each other.
      if (locked.salesInvoiceId) {
        try {
          const invoice = await manager.getRepository(SalesInvoice).findOne({ where: { id: locked.salesInvoiceId } });
          if (invoice) {
            const creditApplied = await this.sumPostedCreditNotes(locked.salesInvoiceId, manager);
            const total = Number(invoice.totalAmount) || 0;
            const paid = Number(invoice.paidAmount) || 0;
            invoice.balance = Math.max(0, total - paid - creditApplied);
            if (invoice.status !== 'Cancelled') {
              if (invoice.balance <= 0) {
                invoice.status = 'Paid';
              } else if (paid > 0) {
                invoice.status = 'Partial';
              }
            }
            await manager.getRepository(SalesInvoice).save(invoice);
          }
        } catch (err: any) {
          this.logger.warn(`Could not update original invoice balance for return ${id}: ${err.message}`);
        }
      }
    });

    return this.findOne(id, companyId);
  }

  /** Credit Note is legal before stock receipt (APPROVED), after receipt (RECEIVED), or on legacy CREDITED rows. */
  private isCreditAllowed(status?: string): boolean {
    return ['APPROVED', 'RECEIVED', 'CREDITED'].includes((status || '').toUpperCase());
  }

  /** Sum of all posted credit-note returns against an invoice (must include the current one). */
  private async sumPostedCreditNotes(salesInvoiceId: string, manager?: EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(SalesReturn) : this.repo;
    const returns = await repo.find({ where: { salesInvoiceId, creditPosted: true } });
    return returns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
  }

  async reject(id: string, reason: string, userId?: string, companyId?: string): Promise<SalesReturn> {
    const salesReturn = await this.findOne(id, companyId);
    if (salesReturn.stockPosted || salesReturn.creditPosted) {
      throw new BadRequestException('Cannot reject a return that has already posted stock or credit note');
    }
    if (!['DRAFT', 'SUBMITTED'].includes(salesReturn.status)) {
      throw new BadRequestException('Can only reject returns in DRAFT or SUBMITTED status');
    }

    salesReturn.status = 'REJECTED';
    salesReturn.reason = reason ? `${salesReturn.reason ? salesReturn.reason + ' | ' : ''}Rejected: ${reason}` : salesReturn.reason;
    salesReturn.updatedBy = userId || null;
    return this.repo.save(salesReturn);
  }

  async cancel(id: string, userId?: string, companyId?: string): Promise<SalesReturn> {
    const salesReturn = await this.findOne(id, companyId);
    if (salesReturn.stockPosted || salesReturn.creditPosted) {
      throw new BadRequestException('Cannot cancel a return that has already posted stock or credit note');
    }
    if (salesReturn.status === 'CANCELLED') {
      return salesReturn;
    }
    if (salesReturn.status === 'REJECTED') {
      throw new BadRequestException('Cannot cancel a return that has already been rejected');
    }

    salesReturn.status = 'CANCELLED';
    salesReturn.updatedBy = userId || null;
    return this.repo.save(salesReturn);
  }

  /**
   * Returnable items calculation for an Invoice (Req #3, #10, #11)
   * Calculates Delivered Qty, Previously Returned Qty, and Maximum Returnable Qty per item.
   */
  async getReturnableItems(invoiceId: string, companyId: string): Promise<any> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: invoiceId, companyId },
      relations: ['customer', 'salesOrder'],
    });
    if (!invoice) {
      throw new NotFoundException(`Sales invoice with ID '${invoiceId}' not found`);
    }

    // Find deliveries for this sales order
    let deliveries: SalesDelivery[] = [];
    if (invoice.salesOrderId) {
      deliveries = await this.deliveryRepo.find({
        where: { salesOrderId: invoice.salesOrderId, companyId },
        relations: ['lines', 'lines.item', 'lines.uom'],
      });
    }

    // Accumulate delivered quantities per item
    const deliveredMap = new Map<string, {
      itemId: string;
      itemCode: string;
      itemName: string;
      uomId: string;
      uomCode: string;
      deliveredQty: number;
      unitPrice: number;
      taxAmount: number;
      deliveryLineId?: string;
    }>();

    deliveries.forEach(del => {
      (del.lines || []).forEach(line => {
        if (!line.itemId) return;
        const existing = deliveredMap.get(line.itemId);
        const qty = Number(line.quantity) || 0;
        if (existing) {
          existing.deliveredQty += qty;
        } else {
          deliveredMap.set(line.itemId, {
            itemId: line.itemId,
            itemCode: line.item?.itemCode || 'ITEM',
            itemName: line.item?.name || 'Item',
            uomId: line.uomId || '',
            uomCode: line.uom?.code || line.uom?.name || 'PCS',
            deliveredQty: qty,
            unitPrice: Number(line.unitPrice) || 0,
            taxAmount: Number(line.taxAmount) || 0,
            deliveryLineId: line.id,
          });
        }
      });
    });

    // Fallback: If no deliveries recorded, query sales order items
    if (deliveredMap.size === 0 && invoice.salesOrderId) {
      const orderItems = await this.orderItemRepo.find({
        where: { salesOrderId: invoice.salesOrderId },
        relations: ['item', 'uom'],
      });
      orderItems.forEach(oi => {
        if (!oi.itemId) return;
        const qty = Number(oi.shippedQuantity) > 0 ? Number(oi.shippedQuantity) : Number(oi.quantity);
        deliveredMap.set(oi.itemId, {
          itemId: oi.itemId,
          itemCode: oi.item?.itemCode || 'ITEM',
          itemName: oi.item?.name || 'Item',
          uomId: oi.uomId || '',
          uomCode: oi.uom?.code || oi.uom?.name || 'PCS',
          deliveredQty: qty,
          unitPrice: Number(oi.unitPrice) || 0,
          taxAmount: 0,
        });
      });
    }

    // Find previously returned quantities across all active returns for this invoice
    const existingReturns = await this.repo.find({
      where: {
        salesInvoiceId: invoiceId,
        companyId,
        status: Not(In(['CANCELLED', 'REJECTED'])),
      },
      relations: ['lines'],
    });

    const previouslyReturnedMap = new Map<string, number>();
    existingReturns.forEach(ret => {
      (ret.lines || []).forEach(line => {
        if (!line.itemId) return;
        const cur = previouslyReturnedMap.get(line.itemId) || 0;
        previouslyReturnedMap.set(line.itemId, cur + Number(line.quantity));
      });
    });

    const items = Array.from(deliveredMap.values()).map(it => {
      const previouslyReturned = previouslyReturnedMap.get(it.itemId) || 0;
      const returnableQty = Math.max(0, it.deliveredQty - previouslyReturned);
      const netSoldQty = Math.max(0, it.deliveredQty - previouslyReturned);
      return {
        itemId: it.itemId,
        itemCode: it.itemCode,
        itemName: it.itemName,
        uomId: it.uomId,
        uomCode: it.uomCode,
        originalInvoiceQuantity: it.deliveredQty,
        deliveredQuantity: it.deliveredQty,
        previouslyReturnedQuantity: previouslyReturned,
        remainingReturnableQuantity: returnableQty,
        maximumReturnableQuantity: returnableQty,
        netSoldQuantity: netSoldQty,
        unitPrice: it.unitPrice,
        taxAmount: it.taxAmount,
        deliveryLineId: it.deliveryLineId,
      };
    });

    return {
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      salesOrderId: invoice.salesOrderId,
      customerId: invoice.customerId,
      customerName: invoice.customer?.companyName || 'Customer',
      totalAmount: invoice.totalAmount,
      balance: invoice.balance,
      items,
    };
  }

  /**
   * Return Quantity Validation (Req #3, #10, #11)
   * Prevents returning more than delivered, or more than remaining returnable.
   */
  private async validateReturnQuantities(
    companyId: string,
    salesInvoiceId?: string,
    salesOrderId?: string,
    lines?: any[],
    excludeReturnId?: string,
  ): Promise<void> {
    if (!lines || lines.length === 0) return;

    if (salesInvoiceId) {
      const returnableData = await this.getReturnableItems(salesInvoiceId, companyId);
      const returnableMap = new Map<string, any>(returnableData.items.map((it: any) => [it.itemId, it]));

      for (const line of lines) {
        if (!line.itemId) {
          throw new BadRequestException('Item ID is required for each return line');
        }
        const returnQty = Number(line.quantity);
        if (returnQty <= 0 || isNaN(returnQty)) {
          throw new BadRequestException('Return quantity must be greater than zero');
        }

        const validItem = returnableMap.get(line.itemId);
        if (!validItem) {
          throw new BadRequestException(`Item is not part of original delivered invoice ${returnableData.invoiceNo}`);
        }

        if (validItem.deliveredQuantity <= 0) {
          throw new BadRequestException(`Cannot return item '${validItem.itemName}' against zero delivered quantity`);
        }

        // Adjust for current return if editing
        let allowedMax = validItem.maximumReturnableQuantity;
        if (excludeReturnId) {
          const oldLine = await this.lineRepo.findOne({
            where: { returnId: excludeReturnId, itemId: line.itemId },
          });
          if (oldLine) {
            allowedMax += Number(oldLine.quantity);
          }
        }

        if (returnQty > allowedMax) {
          throw new BadRequestException(
            `Return quantity (${returnQty}) exceeds maximum returnable quantity (${allowedMax}) for item '${validItem.itemName}' (Delivered: ${validItem.deliveredQuantity}, Previously returned: ${validItem.previouslyReturnedQuantity})`,
          );
        }
      }
    }
  }

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

    // Normalized-name fallback for abbreviation drift
    // (e.g. "Frontier Construction Co" vs "Frontier Construction Company")
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

  private async generateReturnNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SR-${year}-`;
    const result = await this.repo
      .createQueryBuilder('sr')
      .select("MAX(CAST(SUBSTRING(sr.returnNumber FROM 'SR-[0-9]{4}-([0-9]+)') AS INT))", 'maxNum')
      .where('sr.companyId = :companyId', { companyId })
      .andWhere('sr.returnNumber LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne();
    const maxNum = result?.maxNum || 0;
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  }

  private async generateCreditNoteNumber(companyId: string, manager?: EntityManager): Promise<string> {
    const repo = manager ? manager.getRepository(SalesReturn) : this.repo;
    const year = new Date().getFullYear();
    const prefix = `CN-${year}-`;
    const result = await repo
      .createQueryBuilder('sr')
      .select("MAX(CAST(SUBSTRING(sr.creditNoteNumber FROM 'CN-[0-9]{4}-([0-9]+)') AS INT))", 'maxNum')
      .where('sr.companyId = :companyId', { companyId })
      .andWhere('sr.creditNoteNumber LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne();
    const maxNum = result?.maxNum || 0;
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  }
}
