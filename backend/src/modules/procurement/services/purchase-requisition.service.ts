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

    const requisition = this.repo.create({
      ...dto,
      lines: undefined,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(requisition);

    if (dto.lines && dto.lines.length > 0) {
      for (const lineDto of dto.lines) {
        const line = this.lineRepo.create({
          requisitionId: saved.id,
          ...lineDto,
          estimatedTotalPrice: (lineDto.estimatedUnitPrice || 0) * lineDto.quantity,
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await this.lineRepo.save(line);
      }
    }

    return this.findOne(saved.id);
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
}
