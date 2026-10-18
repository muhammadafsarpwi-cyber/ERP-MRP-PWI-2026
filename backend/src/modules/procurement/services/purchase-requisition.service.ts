import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseRequisition, PurchaseRequisitionLine } from '../entities';
import { CreatePurchaseRequisitionDto, PurchaseRequisitionFilterDto } from '../dto';

@Injectable()
export class PurchaseRequisitionService {
  private readonly logger = new Logger(PurchaseRequisitionService.name);

  constructor(
    @InjectRepository(PurchaseRequisition)
    private readonly repo: Repository<PurchaseRequisition>,
    @InjectRepository(PurchaseRequisitionLine)
    private readonly lineRepo: Repository<PurchaseRequisitionLine>,
  ) {}

  async create(dto: CreatePurchaseRequisitionDto, userId?: string): Promise<PurchaseRequisition> {
    const existing = await this.repo.findOne({
      where: { requisitionCode: dto.requisitionCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(`Requisition code '${dto.requisitionCode}' already exists`);
    }

    const { divisionId, warehouseId, purchaseType, lines } = dto;
    const requisition = this.repo.create({
      companyId: dto.companyId,
      requisitionCode: dto.requisitionCode,
      title: dto.title || null,
      description: dto.description || null,
      requestType: dto.requestType || 'STANDARD',
      requestedDeliveryDate: dto.requestedDeliveryDate || null,
      department: dto.department || null,
      projectCode: dto.projectCode || null,
      notes: dto.notes || null,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(requisition);

    if (lines && lines.length > 0) {
      for (let idx = 0; idx < lines.length; idx++) {
        const lineDto = lines[idx];
        const unitPrice = lineDto.estimatedUnitPrice ?? lineDto.unitPrice ?? 0;
        const lineWhId = lineDto.warehouseId || warehouseId || null;
        const line = this.lineRepo.create({
          requisitionId: saved.id,
          lineNumber: lineDto.lineNumber ?? (idx + 1),
          itemId: lineDto.itemId,
          uomId: lineDto.uomId,
          quantity: lineDto.quantity,
          estimatedUnitPrice: unitPrice,
          estimatedTotalPrice: (unitPrice || 0) * (lineDto.quantity || 1),
          requiredDate: lineDto.requiredDate || dto.requestedDeliveryDate || null,
          warehouseId: lineWhId,
          supplierId: lineDto.supplierId || null,
          justification: lineDto.justification || lineDto.description || lineDto.itemName || null,
          notes: lineDto.notes || null,
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await this.lineRepo.save(line);
      }
    }

    return this.findOne(saved.id);
  }

  async update(id: string, dto: CreatePurchaseRequisitionDto, userId?: string): Promise<PurchaseRequisition> {
    const requisition = await this.findOne(id);
    if (requisition.status !== 'DRAFT' && requisition.status !== 'SUBMITTED') {
      throw new BadRequestException('Can only update requisitions in DRAFT or SUBMITTED status');
    }

    const { divisionId, warehouseId, purchaseType, lines } = dto;

    if (dto.title !== undefined) requisition.title = dto.title || null;
    if (dto.description !== undefined) requisition.description = dto.description || null;
    if (dto.requestType !== undefined) requisition.requestType = dto.requestType || 'STANDARD';
    if (dto.requestedDeliveryDate !== undefined) requisition.requestedDeliveryDate = dto.requestedDeliveryDate || null;
    if (dto.department !== undefined) requisition.department = dto.department || null;
    if (dto.projectCode !== undefined) requisition.projectCode = dto.projectCode || null;
    if (dto.notes !== undefined) requisition.notes = dto.notes || null;
    requisition.updatedBy = userId || null;

    await this.repo.save(requisition);

    if (lines && lines.length > 0) {
      await this.lineRepo.delete({ requisitionId: id });
      for (let idx = 0; idx < lines.length; idx++) {
        const lineDto = lines[idx];
        const unitPrice = lineDto.estimatedUnitPrice ?? lineDto.unitPrice ?? 0;
        const lineWhId = lineDto.warehouseId || warehouseId || null;
        const line = this.lineRepo.create({
          requisitionId: id,
          lineNumber: lineDto.lineNumber ?? (idx + 1),
          itemId: lineDto.itemId,
          uomId: lineDto.uomId,
          quantity: lineDto.quantity,
          estimatedUnitPrice: unitPrice,
          estimatedTotalPrice: (unitPrice || 0) * (lineDto.quantity || 1),
          requiredDate: lineDto.requiredDate || dto.requestedDeliveryDate || null,
          warehouseId: lineWhId,
          supplierId: lineDto.supplierId || null,
          justification: lineDto.justification || lineDto.description || lineDto.itemName || null,
          notes: lineDto.notes || null,
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await this.lineRepo.save(line);
      }
    }

    return this.findOne(id);
  }

  async findAll(filter: PurchaseRequisitionFilterDto): Promise<{ data: PurchaseRequisition[]; total: number }> {
    const { page = 1, limit = 20, companyId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('pr');
    let hasWhere = false;
    if (companyId) { qb.where('pr.companyId = :companyId', { companyId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('pr.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(pr.title ILIKE :search OR pr.requisitionCode ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'requisitionCode', 'title', 'status'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`pr.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<PurchaseRequisition> {
    const requisition = await this.repo.findOne({
      where: { id },
      relations: ['lines', 'lines.item', 'lines.uom', 'lines.warehouse', 'lines.supplier'],
    });
    if (!requisition) throw new NotFoundException(`Purchase requisition with ID '${id}' not found`);
    return requisition;
  }

  async submit(id: string, userId?: string): Promise<PurchaseRequisition> {
    const requisition = await this.findOne(id);
    if (requisition.status !== 'DRAFT') {
      throw new BadRequestException('Can only submit requisitions in DRAFT status');
    }
    requisition.status = 'SUBMITTED';
    requisition.updatedBy = userId || null;
    return this.repo.save(requisition);
  }

  async approve(id: string, userId?: string): Promise<PurchaseRequisition> {
    const requisition = await this.findOne(id);
    if (requisition.status !== 'SUBMITTED') {
      throw new BadRequestException('Can only approve requisitions in SUBMITTED status');
    }
    requisition.status = 'APPROVED';
    requisition.approvedBy = userId || null;
    requisition.approvedAt = new Date();
    requisition.updatedBy = userId || null;
    return this.repo.save(requisition);
  }

  async cancel(id: string, userId?: string): Promise<PurchaseRequisition> {
    const requisition = await this.findOne(id);
    if (requisition.status !== 'DRAFT' && requisition.status !== 'SUBMITTED') {
      throw new BadRequestException('Can only cancel requisitions in DRAFT or SUBMITTED status');
    }
    requisition.status = 'CANCELLED';
    requisition.updatedBy = userId || null;
    return this.repo.save(requisition);
  }

  async addLine(requisitionId: string, dto: any): Promise<PurchaseRequisitionLine> {
    const requisition = await this.findOne(requisitionId);
    if (requisition.status !== 'DRAFT') {
      throw new BadRequestException('Can only add lines to requisitions in DRAFT status');
    }
    const line = this.lineRepo.create({
      requisitionId,
      ...dto,
      estimatedTotalPrice: (dto.estimatedUnitPrice || 0) * dto.quantity,
    });
    return this.lineRepo.save(line) as unknown as Promise<PurchaseRequisitionLine>;
  }

  async removeLine(requisitionId: string, lineId: string): Promise<void> {
    const requisition = await this.findOne(requisitionId);
    if (requisition.status !== 'DRAFT') {
      throw new BadRequestException('Can only remove lines from requisitions in DRAFT status');
    }
    const line = await this.lineRepo.findOne({ where: { id: lineId, requisitionId } });
    if (!line) throw new NotFoundException(`Line with ID '${lineId}' not found`);
    await this.lineRepo.remove(line);
  }

  async remove(id: string): Promise<void> {
    const requisition = await this.findOne(id);
    try {
      await this.repo.manager.query(`UPDATE store_replenishments SET pr_id = NULL WHERE pr_id = $1`, [id]);
    } catch { /* ignore if table or column doesn't exist */ }
    await this.lineRepo.delete({ requisitionId: id });
    await this.repo.remove(requisition);
  }
}
