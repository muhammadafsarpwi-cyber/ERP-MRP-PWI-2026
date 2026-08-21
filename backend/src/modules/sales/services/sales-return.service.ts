import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesReturn, SalesReturnLine, SalesCustomer, SalesOrder, SalesInvoice } from '../entities';

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
    @InjectRepository(SalesOrder)
    private readonly orderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesInvoice)
    private readonly invoiceRepo: Repository<SalesInvoice>,
  ) {}

  async create(dto: any, userId?: string): Promise<SalesReturn> {
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

    if (dto.salesInvoiceId) {
      const invoice = await this.invoiceRepo.findOne({
        where: { id: dto.salesInvoiceId, companyId: dto.companyId },
      });
      if (!invoice) {
        throw new BadRequestException('Sales invoice not found for this company');
      }
    }

    const returnNumber = await this.generateReturnNumber(dto.companyId);

    const salesReturn = this.repo.create({
      companyId: dto.companyId,
      salesOrderId: dto.salesOrderId || null,
      salesInvoiceId: dto.salesInvoiceId || null,
      customerId: dto.customerId,
      returnNumber,
      returnDate: dto.returnDate || new Date().toISOString().split('T')[0],
      reason: dto.reason || null,
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      notes: dto.notes || null,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(salesReturn);

    if (dto.lines && dto.lines.length > 0) {
      let totalAmount = 0;
      let lineNumber = 1;
      for (const lineDto of dto.lines) {
        const lineTotal = lineDto.lineTotal || lineDto.quantity * lineDto.unitPrice;
        const line = this.lineRepo.create({
          returnId: saved.id,
          lineNumber: lineNumber++,
          itemId: lineDto.itemId,
          description: lineDto.description || null,
          quantity: lineDto.quantity,
          uomId: lineDto.uomId,
          unitPrice: lineDto.unitPrice,
          taxAmount: lineDto.taxAmount || 0,
          lineTotal,
          reason: lineDto.reason || null,
        });
        await this.lineRepo.save(line);
        totalAmount += lineTotal;
      }
      saved.totalAmount = Number(totalAmount);
      saved.subtotal = Number(totalAmount);
      await this.repo.save(saved);
    }

    return this.findOne(saved.id);
  }

  async findAll(filter: any): Promise<{ data: SalesReturn[]; total: number }> {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 20;
    const { companyId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('sr')
      .leftJoinAndSelect('sr.customer', 'customer')
      .leftJoinAndSelect('sr.salesOrder', 'salesOrder');
    let hasWhere = false;
    if (companyId) { qb.where('sr.companyId = :companyId', { companyId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('sr.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('sr.returnNumber ILIKE :search', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'returnNumber', 'returnDate', 'status', 'totalAmount'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`sr.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string, companyId?: string): Promise<SalesReturn> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const salesReturn = await this.repo.findOne({
      where,
      relations: ['customer', 'salesOrder', 'salesInvoice', 'lines', 'lines.item', 'lines.uom'],
    });
    if (!salesReturn) throw new NotFoundException(`Sales return with ID '${id}' not found`);
    return salesReturn;
  }

  async approve(id: string, userId?: string, companyId?: string): Promise<SalesReturn> {
    const salesReturn = await this.findOne(id, companyId);
    if (salesReturn.status !== 'DRAFT') {
      throw new BadRequestException('Can only approve returns in DRAFT status');
    }
    salesReturn.status = 'APPROVED';
    salesReturn.approvedAt = new Date();
    salesReturn.approvedBy = userId || null;
    salesReturn.updatedBy = userId || null;
    return this.repo.save(salesReturn);
  }

  async receive(id: string, userId?: string, companyId?: string): Promise<SalesReturn> {
    const salesReturn = await this.findOne(id, companyId);
    if (salesReturn.status !== 'APPROVED') {
      throw new BadRequestException('Can only receive returns in APPROVED status');
    }
    salesReturn.status = 'RECEIVED';
    salesReturn.updatedBy = userId || null;
    return this.repo.save(salesReturn);
  }

  async refund(id: string, userId?: string, companyId?: string): Promise<SalesReturn> {
    const salesReturn = await this.findOne(id, companyId);
    if (salesReturn.status !== 'RECEIVED') {
      throw new BadRequestException('Can only refund returns in RECEIVED status');
    }
    salesReturn.status = 'REFUNDED';
    salesReturn.updatedBy = userId || null;
    return this.repo.save(salesReturn);
  }

  async cancel(id: string, userId?: string, companyId?: string): Promise<SalesReturn> {
    const salesReturn = await this.findOne(id, companyId);
    if (salesReturn.status === 'CANCELLED' || salesReturn.status === 'REFUNDED') {
      throw new BadRequestException('Cannot cancel a return that is already cancelled or refunded');
    }
    salesReturn.status = 'CANCELLED';
    salesReturn.updatedBy = userId || null;
    return this.repo.save(salesReturn);
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
}
