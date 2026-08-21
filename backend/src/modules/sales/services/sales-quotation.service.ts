import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesQuotation, SalesQuotationItem, SalesCustomer } from '../entities';

@Injectable()
export class SalesQuotationService {
  private readonly logger = new Logger(SalesQuotationService.name);

  constructor(
    @InjectRepository(SalesQuotation)
    private readonly repo: Repository<SalesQuotation>,
    @InjectRepository(SalesQuotationItem)
    private readonly itemRepo: Repository<SalesQuotationItem>,
    @InjectRepository(SalesCustomer)
    private readonly customerRepo: Repository<SalesCustomer>,
  ) {}

  async create(dto: any, userId?: string): Promise<SalesQuotation> {
    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId, companyId: dto.companyId },
    });
    if (!customer) {
      throw new BadRequestException('Customer not found for this company');
    }

    const quotationNumber = await this.generateQuotationNumber(dto.companyId);

    const quotation = this.repo.create({
      companyId: dto.companyId,
      customerId: dto.customerId,
      quotationNumber,
      quotationDate: dto.quotationDate || new Date().toISOString().split('T')[0],
      validUntil: dto.validUntil || null,
      currency: dto.currency || 'USD',
      subtotal: dto.subtotal || 0,
      discountAmount: dto.discountAmount || 0,
      taxAmount: dto.taxAmount || 0,
      totalAmount: dto.totalAmount || 0,
      notes: dto.notes || null,
      salesRepId: dto.salesRepId || null,
      status: 'Draft',
      createdBy: userId || null,
    });
    const saved = await this.repo.save(quotation);

    if (dto.items && dto.items.length > 0) {
      let subtotal = 0;
      let lineNumber = 1;
      for (const itemDto of dto.items) {
        const lineTotal = itemDto.lineTotal || itemDto.quantity * itemDto.unitPrice * (1 - (itemDto.discountPercent || 0) / 100);
        const item = this.itemRepo.create({
          quotationId: saved.id,
          lineNumber: lineNumber++,
          itemId: itemDto.itemId,
          description: itemDto.description || null,
          quantity: itemDto.quantity,
          uomId: itemDto.uomId,
          unitPrice: itemDto.unitPrice,
          discountPercent: itemDto.discountPercent || 0,
          taxAmount: itemDto.taxAmount || 0,
          lineTotal,
          deliveryDate: itemDto.deliveryDate || null,
        });
        await this.itemRepo.save(item);
        subtotal += lineTotal;
      }
      saved.subtotal = Number(subtotal);
      saved.totalAmount = Number(subtotal) - Number(saved.discountAmount || 0) + Number(saved.taxAmount || 0);
      await this.repo.save(saved);
    }

    return this.findOne(saved.id);
  }

  async findAll(filter: any): Promise<{ data: SalesQuotation[]; total: number }> {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 20;
    const { companyId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('sq')
      .leftJoinAndSelect('sq.customer', 'customer');
    let hasWhere = false;
    if (companyId) { qb.where('sq.companyId = :companyId', { companyId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('sq.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('sq.quotationNumber ILIKE :search', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'quotationNumber', 'quotationDate', 'status', 'totalAmount'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`sq.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string, companyId?: string): Promise<SalesQuotation> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const quotation = await this.repo.findOne({
      where,
      relations: ['customer', 'items', 'items.item', 'items.uom'],
    });
    if (!quotation) throw new NotFoundException(`Sales quotation with ID '${id}' not found`);
    return quotation;
  }

  async update(id: string, dto: any, userId?: string, companyId?: string): Promise<SalesQuotation> {
    const quotation = await this.findOne(id, companyId);
    if (quotation.status !== 'Draft') {
      throw new BadRequestException('Can only update quotations in Draft status');
    }

    Object.assign(quotation, {
      customerId: dto.customerId ?? quotation.customerId,
      quotationDate: dto.quotationDate ?? quotation.quotationDate,
      validUntil: dto.validUntil ?? quotation.validUntil,
      currency: dto.currency ?? quotation.currency,
      discountAmount: dto.discountAmount ?? quotation.discountAmount,
      taxAmount: dto.taxAmount ?? quotation.taxAmount,
      salesRepId: dto.salesRepId ?? quotation.salesRepId,
      notes: dto.notes ?? quotation.notes,
    });

    return this.repo.save(quotation);
  }

  async submit(id: string, userId?: string, companyId?: string): Promise<SalesQuotation> {
    const quotation = await this.findOne(id, companyId);
    if (quotation.status !== 'Draft') {
      throw new BadRequestException('Can only submit quotations in Draft status');
    }
    quotation.status = 'Sent';
    return this.repo.save(quotation);
  }

  async accept(id: string, userId?: string, companyId?: string): Promise<SalesQuotation> {
    const quotation = await this.findOne(id, companyId);
    if (quotation.status !== 'Sent') {
      throw new BadRequestException('Can only accept quotations in Sent status');
    }
    quotation.status = 'Accepted';
    return this.repo.save(quotation);
  }

  async reject(id: string, userId?: string, companyId?: string): Promise<SalesQuotation> {
    const quotation = await this.findOne(id, companyId);
    if (quotation.status !== 'Sent') {
      throw new BadRequestException('Can only reject quotations in Sent status');
    }
    quotation.status = 'Rejected';
    return this.repo.save(quotation);
  }

  async cancel(id: string, userId?: string, companyId?: string): Promise<SalesQuotation> {
    const quotation = await this.findOne(id, companyId);
    if (quotation.status === 'Cancelled' || quotation.status === 'Accepted') {
      throw new BadRequestException('Cannot cancel a quotation that is already cancelled or accepted');
    }
    quotation.status = 'Cancelled';
    return this.repo.save(quotation);
  }

  async remove(id: string, companyId?: string): Promise<void> {
    const quotation = await this.findOne(id, companyId);
    if (quotation.status !== 'Draft') {
      throw new BadRequestException('Can only delete quotations in Draft status');
    }
    await this.repo.remove(quotation);
  }

  private async generateQuotationNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `QT-${year}-`;
    const result = await this.repo
      .createQueryBuilder('sq')
      .select("MAX(CAST(SUBSTRING(sq.quotationNumber FROM 'QT-[0-9]{4}-([0-9]+)') AS INT))", 'maxNum')
      .where('sq.companyId = :companyId', { companyId })
      .andWhere('sq.quotationNumber LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne();
    const maxNum = result?.maxNum || 0;
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  }
}
