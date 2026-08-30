import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseInvoice, PurchaseInvoiceLine } from '../entities';
import { CreatePurchaseInvoiceDto, PurchaseInvoiceFilterDto } from '../dto';
import { FinanceAutoPostingService } from '../../finance/services/finance-auto-posting.service';

@Injectable()
export class PurchaseInvoiceService {
  private readonly logger = new Logger(PurchaseInvoiceService.name);

  constructor(
    @InjectRepository(PurchaseInvoice)
    private readonly repo: Repository<PurchaseInvoice>,
    @InjectRepository(PurchaseInvoiceLine)
    private readonly lineRepo: Repository<PurchaseInvoiceLine>,
    private readonly autoPosting: FinanceAutoPostingService,
  ) {}

  async create(dto: CreatePurchaseInvoiceDto, userId?: string): Promise<PurchaseInvoice> {
    const existing = await this.repo.findOne({
      where: { invoiceCode: dto.invoiceCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(`Invoice code '${dto.invoiceCode}' already exists`);
    }

    const invoice = this.repo.create({
      ...dto,
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

    return this.findOne(saved.id);
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
    return { data, total };
  }

  async findOne(id: string): Promise<PurchaseInvoice> {
    const invoice = await this.repo.findOne({
      where: { id },
      relations: ['supplier', 'po', 'lines', 'lines.item', 'lines.uom', 'lines.poLine'],
    });
    if (!invoice) throw new NotFoundException(`Purchase invoice with ID '${id}' not found`);
    return invoice;
  }

  async approve(id: string, userId?: string): Promise<PurchaseInvoice> {
    const invoice = await this.findOne(id);
    if (invoice.status !== 'DRAFT') throw new BadRequestException('Can only approve invoices in DRAFT status');
    invoice.status = 'APPROVED';
    invoice.approvedBy = userId || null;
    invoice.approvedAt = new Date();
    invoice.updatedBy = userId || null;
    return this.repo.save(invoice);
  }

  async post(id: string, userId?: string): Promise<PurchaseInvoice> {
    const invoice = await this.findOne(id);
    if (invoice.status !== 'APPROVED') throw new BadRequestException('Can only post invoices in APPROVED status');
    invoice.status = 'POSTED';
    invoice.postedBy = userId || null;
    invoice.postedAt = new Date();
    invoice.updatedBy = userId || null;
    const saved = await this.repo.save(invoice);
    // Auto-post AP journal
    try {
      await this.autoPosting.postPurchaseInvoice(invoice.companyId, invoice.invoiceCode, id, Number(invoice.totalAmount), userId);
    } catch (e: any) {
      this.logger.warn(`Auto-posting for purchase invoice ${id} failed: ${e.message}`);
    }
    return saved;
  }

  async cancel(id: string, userId?: string): Promise<PurchaseInvoice> {
    const invoice = await this.findOne(id);
    if (invoice.status === 'POSTED') throw new BadRequestException('Cannot cancel a posted invoice');
    invoice.status = 'CANCELLED';
    invoice.updatedBy = userId || null;
    return this.repo.save(invoice);
  }

  async recordPayment(id: string, amount: number, userId?: string): Promise<PurchaseInvoice> {
    const invoice = await this.findOne(id);
    if (invoice.status === 'CANCELLED') throw new BadRequestException('Cannot record payment for a cancelled invoice');
    if (amount <= 0) throw new BadRequestException('Payment amount must be greater than zero');
    const balance = Number(invoice.totalAmount) - Number(invoice.paidAmount || 0);
    if (amount > balance) throw new BadRequestException('Payment amount exceeds the outstanding balance');

    invoice.paidAmount = Number(invoice.paidAmount || 0) + amount;
    invoice.updatedBy = userId || null;
    if (Number(invoice.paidAmount) >= Number(invoice.totalAmount)) {
      invoice.paymentStatus = 'PAID';
    } else if (Number(invoice.paidAmount) > 0) {
      invoice.paymentStatus = 'PARTIAL';
    }
    const saved = await this.repo.save(invoice);
    // Auto-post supplier payment: DR AP, CR Cash
    try {
      await this.autoPosting.postSupplierPayment(invoice.companyId, invoice.invoiceCode, id, amount, userId);
    } catch (e: any) {
      this.logger.warn(`Auto-posting for supplier payment on invoice ${id} failed: ${e.message}`);
    }
    return saved;
  }
}
