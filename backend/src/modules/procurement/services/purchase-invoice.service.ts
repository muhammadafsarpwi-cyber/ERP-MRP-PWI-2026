import {
  Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import {
  PurchaseInvoice, PurchaseInvoiceLine,
  PurchaseOrder, PurchaseOrderLine, GoodsReceipt, GoodsReceiptLine,
} from '../entities';
import { CreatePurchaseInvoiceDto, PurchaseInvoiceFilterDto } from '../dto';
import { FinanceAutoPostingService } from '../../finance/services/finance-auto-posting.service';

/** Exact three-way matching uses no arbitrary tolerance. */
const MATCH_EPSILON = 0.01;

export interface ThreeWayMatch {
  status: 'MATCHED' | 'PARTIALLY_MATCHED' | 'OVER_INVOICED' | 'OVER_RECEIVED' | 'UNRECEIVED' | 'PENDING';
  variance: number;
  notes: string;
}

/**
 * Exact three-way reconciliation of an invoice against its Purchase Order
 * (value + how much remains to invoice) and the goods actually received.
 *
 *  - OVER_INVOICED: the cumulative invoiced value would exceed the PO value —
 *    posting is refused (an invoice must never silently push a PO over-invoiced).
 *  - OVER_RECEIVED: this invoice exceeds what has physically been received yet
 *    (within the PO value) — flagged for review but posting is permitted.
 *  - UNRECEIVED: no goods receipt has been recorded for the PO yet.
 *  - MATCHED: invoice fully settles the remaining PO value.
 *  - PARTIALLY_MATCHED: invoice settles part of the remaining PO value.
 */
export function computeThreeWayMatch(
  invoiceTotal: number,
  currentInvoicedAmount: number,
  poTotal: number,
  receivedAmount: number,
): ThreeWayMatch {
  const proposedInvoiced = currentInvoicedAmount + invoiceTotal;
  const overPo = proposedInvoiced > poTotal + MATCH_EPSILON;

  if (overPo) {
    return {
      status: 'OVER_INVOICED',
      variance: Math.round((proposedInvoiced - poTotal) * 100) / 100,
      notes: `Invoiced total (${proposedInvoiced.toFixed(2)}) exceeds Purchase Order value (${poTotal.toFixed(2)}).`,
    };
  }
  if (receivedAmount <= MATCH_EPSILON) {
    return {
      status: 'UNRECEIVED',
      variance: Math.round((poTotal - invoiceTotal) * 100) / 100,
      notes: 'No goods have been received against this Purchase Order yet.',
    };
  }
  if (invoiceTotal > receivedAmount + MATCH_EPSILON) {
    return {
      status: 'OVER_RECEIVED',
      variance: Math.round((invoiceTotal - receivedAmount) * 100) / 100,
      notes: `Invoice (${invoiceTotal.toFixed(2)}) exceeds goods received value (${receivedAmount.toFixed(2)}).`,
    };
  }
  if (Math.abs(proposedInvoiced - poTotal) <= MATCH_EPSILON) {
    return {
      status: 'MATCHED',
      variance: 0,
      notes: 'Invoice fully settles the Purchase Order value.',
    };
  }
  return {
    status: 'PARTIALLY_MATCHED',
    variance: Math.round((poTotal - proposedInvoiced) * 100) / 100,
    notes: `Invoice covers ${proposedInvoiced.toFixed(2)} of ${poTotal.toFixed(2)} Purchase Order value.`,
  };
}

@Injectable()
export class PurchaseInvoiceService {
  private readonly logger = new Logger(PurchaseInvoiceService.name);

  constructor(
    @InjectRepository(PurchaseInvoice)
    private readonly repo: Repository<PurchaseInvoice>,
    @InjectRepository(PurchaseInvoiceLine)
    private readonly lineRepo: Repository<PurchaseInvoiceLine>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLine)
    private readonly poLineRepo: Repository<PurchaseOrderLine>,
    @InjectRepository(GoodsReceipt)
    private readonly grRepo: Repository<GoodsReceipt>,
    @InjectRepository(GoodsReceiptLine)
    private readonly grLineRepo: Repository<GoodsReceiptLine>,
    private readonly autoPosting: FinanceAutoPostingService,
  ) {}

  /**
   * Money value of the goods physically received (accepted) against the PO =
   * accepted quantity × the PO line's unit price.
   */
  private async receivedValue(poId: string): Promise<number> {
    const receipts = await this.grRepo.find({ where: { poId, status: 'POSTED' } });
    if (!receipts.length) return 0;
    const receiptIds = receipts.map((r) => r.id);
    const lines = await this.grLineRepo.createQueryBuilder('g')
      .addSelect('COALESCE(g.quantity_accepted,0) * COALESCE(g.unit_price,0)', 'value')
      .where('g.receipt_id IN (:...ids)', { ids: receiptIds })
      .getRawMany();
    return Math.round(lines.reduce((s, l) => s + Number(l.value || 0), 0) * 100) / 100;
  }

  async create(dto: CreatePurchaseInvoiceDto, companyId: string, userId?: string): Promise<PurchaseInvoice> {
    if (dto.companyId !== companyId) {
      throw new ForbiddenException('Company ID is outside your organization scope');
    }
    const existing = await this.repo.findOne({
      where: { invoiceCode: dto.invoiceCode, companyId },
    });
    if (existing) {
      throw new ConflictException(`Invoice code '${dto.invoiceCode}' already exists`);
    }

    const po = await this.poRepo.findOne({ where: { id: dto.poId, companyId } });
    if (!po) throw new NotFoundException(`Purchase order with ID '${dto.poId}' not found in this company`);

    const invoice = this.repo.create({
      ...dto,
      companyId,
      lines: undefined,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(invoice);

    if (dto.lines && dto.lines.length > 0) {
      let subtotal = 0;
      for (const lineDto of dto.lines) {
        const totalPrice = lineDto.quantity * lineDto.unitPrice;
        const line = this.lineRepo.create({
          invoiceId: saved.id,
          ...lineDto,
          totalPrice,
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await this.lineRepo.save(line);
        subtotal += totalPrice;
      }
      saved.subtotal = subtotal;
      saved.taxAmount = subtotal * (dto.taxPercent || 0) / 100;
      saved.totalAmount = subtotal + saved.taxAmount - (dto.discountAmount || 0);
      await this.repo.save(saved);
    }

    const totalAmount = Number(saved.totalAmount || dto.totalAmount || 0);
    const poTotal = Number(po.totalAmount || 0);
    const currentInvoiced = Number(po.invoicedAmount || 0);
    const receivedAmount = await this.receivedValue(po.id);
    const match = computeThreeWayMatch(totalAmount, currentInvoiced, poTotal, receivedAmount);
    saved.matchingStatus = match.status;
    saved.varianceAmount = match.variance;
    saved.varianceNotes = match.notes;
    await this.repo.save(saved);

    return this.findOne(saved.id, companyId);
  }

  async findAll(filter: PurchaseInvoiceFilterDto): Promise<{ data: PurchaseInvoice[]; total: number }> {
    const { page = 1, limit = 20, companyId, poId, supplierId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('pi')
      .leftJoinAndSelect('pi.supplier', 'supplier')
      .leftJoinAndSelect('pi.po', 'po');
    let hasWhere = false;
    if (companyId) { qb.where('pi.companyId = :companyId', { companyId }); hasWhere = true; }
    if (poId) { qb[hasWhere ? 'andWhere' : 'where']('pi.poId = :poId', { poId }); hasWhere = true; }
    if (supplierId) { qb[hasWhere ? 'andWhere' : 'where']('pi.supplierId = :supplierId', { supplierId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('pi.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(pi.invoiceCode ILIKE :search OR pi.supplierInvoiceNumber ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'invoiceCode', 'invoiceDate', 'status', 'totalAmount'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`pi.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    const dataWithPo = await this.enrichPoValues(data);
    return { data: dataWithPo, total };
  }

  private async enrichPoValues(invoices: PurchaseInvoice[]): Promise<PurchaseInvoice[]> {
    const poIds = Array.from(new Set(invoices.map((i) => i.poId).filter(Boolean)));
    const poAmounts = new Map<string, { totalAmount: number; receivedAmount: number; invoicedAmount: number }>();
    if (poIds.length) {
      const pos = await this.poRepo.findByIds(poIds);
      for (const p of pos) {
        poAmounts.set(p.id, {
          totalAmount: Number(p.totalAmount || 0),
          receivedAmount: Number(p.receivedAmount || 0),
          invoicedAmount: Number(p.invoicedAmount || 0),
        });
      }
    }
    for (const inv of invoices) {
      const a = poAmounts.get(inv.poId) || { totalAmount: 0, receivedAmount: 0, invoicedAmount: 0 };
      (inv as any).poTotalAmount = a.totalAmount;
      (inv as any).poReceivedAmount = a.receivedAmount;
      (inv as any).poInvoicedAmount = a.invoicedAmount;
      (inv as any).remainingAmount = Math.max(0, Math.round((a.totalAmount - a.invoicedAmount - Number(inv.totalAmount || 0)) * 100) / 100);
    }
    return invoices;
  }

  async findOne(id: string, companyId: string): Promise<PurchaseInvoice> {
    const invoice = await this.repo.findOne({
      where: { id },
      relations: ['supplier', 'po', 'lines', 'lines.item', 'lines.uom', 'lines.poLine'],
    });
    if (!invoice) throw new NotFoundException(`Purchase invoice with ID '${id}' not found`);
    if (companyId && invoice.companyId !== companyId) {
      throw new ForbiddenException('Purchase invoice is outside your organization scope');
    }
    const po = invoice.po || await this.poRepo.findOne({ where: { id: invoice.poId } });
    (invoice as any).poTotalAmount = Number(po?.totalAmount || 0);
    (invoice as any).poReceivedAmount = Number(po?.receivedAmount || 0);
    (invoice as any).poInvoicedAmount = Number(po?.invoicedAmount || 0);
    (invoice as any).remainingAmount = Math.max(0, Number(po?.totalAmount || 0) - Number(po?.invoicedAmount || 0));
    return invoice;
  }

  async approve(id: string, companyId: string, userId?: string): Promise<PurchaseInvoice> {
    const invoice = await this.findOne(id, companyId);
    if (invoice.status !== 'DRAFT') throw new BadRequestException('Can only approve invoices in DRAFT status');
    invoice.status = 'APPROVED';
    invoice.approvedBy = userId || null;
    invoice.approvedAt = new Date();
    invoice.updatedBy = userId || null;
    return this.repo.save(invoice);
  }

  /**
   * ATOMIC posting: the Purchase Order invoiced money/status update, the invoice
   * status/matching transition AND the AP automatic journal are committed (or
   * rolled back) together. Either the invoice is POSTED with its accounting
   * impact and PO value updated, or nothing changes — never a partial result.
   */
  async post(id: string, companyId: string, userId?: string): Promise<PurchaseInvoice> {
    const invoice = await this.findOne(id, companyId);
    if (invoice.status !== 'APPROVED') throw new BadRequestException('Can only post invoices in APPROVED status');

    const po = await this.poRepo.findOne({ where: { id: invoice.poId, companyId } });
    if (!po) throw new NotFoundException(`Purchase order with ID '${invoice.poId}' not found in this company`);

    const totalAmount = Number(invoice.totalAmount || 0);
    const poTotal = Number(po.totalAmount || 0);
    const currentInvoiced = Number(po.invoicedAmount || 0);
    const receivedAmount = await this.receivedValue(po.id);
    const match = computeThreeWayMatch(totalAmount, currentInvoiced, poTotal, receivedAmount);

    if (match.status === 'OVER_INVOICED') {
      throw new BadRequestException(`Cannot post an over-invoiced amount: ${match.notes}`);
    }

    const proposedInvoiced = Math.round((currentInvoiced + totalAmount) * 100) / 100;
    const nextPoStatus = proposedInvoiced >= poTotal - MATCH_EPSILON ? 'FULLY_INVOICED' : po.status as string;

    await this.poRepo.manager.transaction(async (manager: EntityManager) => {
      await manager.getRepository(PurchaseOrder).update(po.id, {
        invoicedAmount: proposedInvoiced,
        status: nextPoStatus,
      });

      await manager.getRepository(PurchaseInvoice).update(invoice.id, {
        status: 'POSTED',
        postedBy: userId || null,
        postedAt: new Date(),
        matchingStatus: match.status,
        varianceAmount: match.variance,
        varianceNotes: match.notes,
        updatedBy: userId || null,
      });

      // AP journal lives in the SAME transaction as the invoice + PO update.
      await this.autoPosting.postPurchaseInvoice(companyId, invoice.invoiceCode, invoice.id, totalAmount, userId, manager);
    });

    return this.findOne(id, companyId);
  }

  async cancel(id: string, companyId: string, userId?: string): Promise<PurchaseInvoice> {
    const invoice = await this.findOne(id, companyId);
    if (invoice.status === 'POSTED') throw new BadRequestException('Cannot cancel a posted invoice');
    invoice.status = 'CANCELLED';
    invoice.updatedBy = userId || null;
    return this.repo.save(invoice);
  }

  async recordPayment(id: string, amount: number, companyId: string, userId?: string): Promise<PurchaseInvoice> {
    const invoice = await this.findOne(id, companyId);
    if (invoice.status === 'CANCELLED') throw new BadRequestException('Cannot record payment for a cancelled invoice');
    if (amount <= 0) throw new BadRequestException('Payment amount must be greater than zero');
    const balance = Number(invoice.totalAmount) - Number(invoice.paidAmount || 0);
    if (amount > balance) throw new BadRequestException('Payment amount exceeds the outstanding balance');

    const newPaid = Number(invoice.paidAmount || 0) + amount;
    const paymentStatus = newPaid >= Number(invoice.totalAmount) ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

    // Atomic: paid amount + AP/cash journal together (or nothing).
    await this.repo.manager.transaction(async (manager: EntityManager) => {
      await manager.getRepository(PurchaseInvoice).update(invoice.id, {
        paidAmount: newPaid,
        paymentStatus,
        updatedBy: userId || null,
      });
      await this.autoPosting.postSupplierPayment(companyId, invoice.invoiceCode, invoice.id, amount, userId, manager);
    });

    return this.findOne(id, companyId);
  }
}
