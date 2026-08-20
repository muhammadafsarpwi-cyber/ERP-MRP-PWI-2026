import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder, PurchaseOrderLine } from '../entities';
import { CreatePurchaseOrderDto, PurchaseOrderFilterDto } from '../dto';

@Injectable()
export class PurchaseOrderService {
  private readonly logger = new Logger(PurchaseOrderService.name);

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly repo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLine)
    private readonly lineRepo: Repository<PurchaseOrderLine>,
  ) {}

  async create(dto: CreatePurchaseOrderDto, userId?: string): Promise<PurchaseOrder> {
    const existing = await this.repo.findOne({
      where: { poCode: dto.poCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(`PO code '${dto.poCode}' already exists`);
    }

    const po = this.repo.create({
      ...dto,
      lines: undefined,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(po);

    if (dto.lines && dto.lines.length > 0) {
      let subtotal = 0;
      for (const lineDto of dto.lines) {
        const totalPrice = lineDto.quantity * lineDto.unitPrice * (1 - (lineDto.discountPercent || 0) / 100);
        const line = this.lineRepo.create({
          poId: saved.id,
          ...lineDto,
          totalPrice,
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await this.lineRepo.save(line);
        subtotal += totalPrice;
      }
      const taxAmount = subtotal * (dto.taxPercent || 0) / 100;
      const discountAmount = subtotal * (dto.discountPercent || 0) / 100;
      saved.subtotal = subtotal;
      saved.taxAmount = taxAmount;
      saved.discountAmount = discountAmount;
      saved.totalAmount = subtotal + taxAmount - discountAmount + (dto.shippingCost || 0);
      await this.repo.save(saved);
    }

    return this.findOne(saved.id);
  }

  async findAll(filter: PurchaseOrderFilterDto): Promise<{ data: PurchaseOrder[]; total: number }> {
    const { page = 1, limit = 20, companyId, supplierId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier');
    let hasWhere = false;
    if (companyId) { qb.where('po.companyId = :companyId', { companyId }); hasWhere = true; }
    if (supplierId) { qb[hasWhere ? 'andWhere' : 'where']('po.supplierId = :supplierId', { supplierId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('po.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(po.poCode ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'poCode', 'orderDate', 'status', 'totalAmount'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`po.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<PurchaseOrder> {
    const po = await this.repo.findOne({
      where: { id },
      relations: ['supplier', 'quotation', 'requisition', 'lines', 'lines.item', 'lines.uom', 'lines.warehouse'],
    });
    if (!po) throw new NotFoundException(`Purchase order with ID '${id}' not found`);
    return po;
  }

  async submit(id: string, userId?: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    if (po.status !== 'DRAFT') throw new BadRequestException('Can only submit POs in DRAFT status');
    po.status = 'SUBMITTED';
    po.updatedBy = userId || null;
    return this.repo.save(po);
  }

  async approve(id: string, userId?: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    if (po.status !== 'SUBMITTED') throw new BadRequestException('Can only approve POs in SUBMITTED status');
    po.status = 'APPROVED';
    po.approvedBy = userId || null;
    po.approvedAt = new Date();
    po.updatedBy = userId || null;
    return this.repo.save(po);
  }

  async cancel(id: string, reason: string, userId?: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    if (po.status === 'CANCELLED' || po.status === 'CLOSED') {
      throw new BadRequestException('Cannot cancel a PO that is already cancelled or closed');
    }
    po.status = 'CANCELLED';
    po.cancelledBy = userId || null;
    po.cancelledAt = new Date();
    po.cancellationReason = reason;
    po.updatedBy = userId || null;
    return this.repo.save(po);
  }

  async close(id: string, userId?: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    if (po.status !== 'FULLY_RECEIVED' && po.status !== 'FULLY_INVOICED') {
      throw new BadRequestException('Can only close POs that are fully received or invoiced');
    }
    po.status = 'CLOSED';
    po.updatedBy = userId || null;
    return this.repo.save(po);
  }

  async addLine(poId: string, dto: any): Promise<PurchaseOrderLine> {
    const po = await this.findOne(poId);
    if (po.status !== 'DRAFT') throw new BadRequestException('Can only add lines to POs in DRAFT status');
    const line = this.lineRepo.create({
      poId,
      ...dto,
      totalPrice: dto.quantity * dto.unitPrice * (1 - (dto.discountPercent || 0) / 100),
    });
    return this.lineRepo.save(line) as unknown as Promise<PurchaseOrderLine>;
  }

  async removeLine(poId: string, lineId: string): Promise<void> {
    const po = await this.findOne(poId);
    if (po.status !== 'DRAFT') throw new BadRequestException('Can only remove lines from POs in DRAFT status');
    const line = await this.lineRepo.findOne({ where: { id: lineId, poId } });
    if (!line) throw new NotFoundException(`Line with ID '${lineId}' not found`);
    await this.lineRepo.remove(line);
  }
}
