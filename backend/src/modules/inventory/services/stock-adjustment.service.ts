import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  StockAdjustment,
  StockAdjustmentLine,
} from '../entities';
import { CreateStockAdjustmentDto, CreateStockAdjustmentLineDto, StockAdjustmentFilterDto } from '../dto';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryBalanceService } from './inventory-balance.service';
import { BatchService } from './batch.service';

@Injectable()
export class StockAdjustmentService {
  private readonly logger = new Logger(StockAdjustmentService.name);

  constructor(
    @InjectRepository(StockAdjustment)
    private readonly repo: Repository<StockAdjustment>,
    @InjectRepository(StockAdjustmentLine)
    private readonly lineRepo: Repository<StockAdjustmentLine>,
    private readonly ledgerService: StockLedgerService,
    private readonly balanceService: InventoryBalanceService,
    private readonly batchService: BatchService,
  ) {}

  async create(dto: CreateStockAdjustmentDto, userId?: string): Promise<StockAdjustment> {
    const existing = await this.repo.findOne({
      where: { adjustmentCode: dto.adjustmentCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(
        `Adjustment code '${dto.adjustmentCode}' already exists in this company`,
      );
    }

    const adjustment = this.repo.create({
      ...dto,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.repo.save(adjustment);
  }

  async findAll(filter: StockAdjustmentFilterDto): Promise<{ data: StockAdjustment[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      companyId,
      warehouseId,
      adjustmentType,
      status,
      sortField = 'createdAt',
      sortOrder = 'DESC',
    } = filter;

    const qb = this.repo
      .createQueryBuilder('adj')
      .leftJoinAndSelect('adj.warehouse', 'warehouse');

    if (companyId) qb.where('adj.companyId = :companyId', { companyId });
    if (warehouseId) qb[companyId ? 'andWhere' : 'where']('adj.warehouseId = :warehouseId', { warehouseId });
    if (adjustmentType) qb.andWhere('adj.adjustmentType = :adjustmentType', { adjustmentType });
    if (status) qb.andWhere('adj.status = :status', { status });

    const validSortFields = ['createdAt', 'adjustmentCode', 'status', 'adjustmentType'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`adj.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<StockAdjustment> {
    const adjustment = await this.repo.findOne({
      where: { id },
      relations: ['warehouse', 'lines', 'lines.item', 'lines.uom', 'lines.location', 'lines.batch'],
    });
    if (!adjustment) throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
    return adjustment;
  }

  async addLine(adjustmentId: string, dto: CreateStockAdjustmentLineDto): Promise<StockAdjustmentLine> {
    const adjustment = await this.findOne(adjustmentId);
    if (adjustment.status !== 'DRAFT') {
      throw new BadRequestException(`Can only add lines to adjustments in DRAFT status`);
    }

    const line = this.lineRepo.create({
      adjustmentId,
      itemId: dto.itemId,
      locationId: dto.locationId || null,
      batchId: dto.batchId || null,
      uomId: dto.uomId,
      quantity: dto.quantity,
      unitCost: dto.unitCost || null,
      notes: dto.notes || null,
    });
    return this.lineRepo.save(line);
  }

  async removeLine(adjustmentId: string, lineId: string): Promise<void> {
    const adjustment = await this.findOne(adjustmentId);
    if (adjustment.status !== 'DRAFT') {
      throw new BadRequestException(`Can only remove lines from adjustments in DRAFT status`);
    }

    const line = await this.lineRepo.findOne({ where: { id: lineId, adjustmentId } });
    if (!line) throw new NotFoundException(`Line with ID '${lineId}' not found in this adjustment`);

    await this.lineRepo.remove(line);
  }

  async submit(id: string, userId?: string): Promise<StockAdjustment> {
    const adjustment = await this.findOne(id);
    if (adjustment.status !== 'DRAFT') {
      throw new BadRequestException(`Can only submit adjustments in DRAFT status`);
    }

    adjustment.status = 'SUBMITTED';
    adjustment.updatedBy = userId || null;
    return this.repo.save(adjustment);
  }

  async approve(id: string, userId?: string): Promise<StockAdjustment> {
    const adjustment = await this.findOne(id);
    if (adjustment.status !== 'SUBMITTED') {
      throw new BadRequestException(`Can only approve adjustments in SUBMITTED status`);
    }

    adjustment.status = 'APPROVED';
    adjustment.approvedBy = userId || null;
    adjustment.approvedAt = new Date();
    adjustment.updatedBy = userId || null;
    return this.repo.save(adjustment);
  }

  async cancel(id: string, userId?: string): Promise<StockAdjustment> {
    const adjustment = await this.findOne(id);
    if (adjustment.status !== 'DRAFT' && adjustment.status !== 'SUBMITTED') {
      throw new BadRequestException(`Can only cancel adjustments in DRAFT or SUBMITTED status`);
    }

    adjustment.status = 'CANCELLED';
    adjustment.updatedBy = userId || null;
    return this.repo.save(adjustment);
  }

  async post(id: string, userId?: string): Promise<StockAdjustment> {
    const adjustment = await this.findOne(id);
    if (adjustment.status !== 'APPROVED') {
      throw new BadRequestException(`Can only post adjustments in APPROVED status`);
    }

    if (!adjustment.lines || adjustment.lines.length === 0) {
      throw new BadRequestException(`Cannot post adjustment with no lines`);
    }

    for (const line of adjustment.lines) {
      const direction = adjustment.adjustmentType === 'DECREASE' ? 'OUT' : 'IN';

      await this.ledgerService.create({
        companyId: adjustment.companyId,
        transactionType: adjustment.adjustmentType === 'INCREASE' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
        itemId: line.itemId,
        warehouseId: adjustment.warehouseId,
        locationId: line.locationId || undefined,
        quantity: line.quantity,
        uomId: line.uomId,
        direction,
        referenceType: 'ADJUSTMENT',
        referenceId: adjustment.id,
        referenceNumber: adjustment.adjustmentCode,
        batchId: line.batchId || undefined,
        createdBy: userId,
      });

      await this.balanceService.updateBalance(
        adjustment.companyId,
        line.itemId,
        adjustment.warehouseId,
        line.locationId,
        line.batchId,
        line.uomId,
        line.quantity,
        direction as 'IN' | 'OUT',
      );

      if (line.batchId) {
        const batch = await this.batchService.findOne(line.batchId);
        if (batch) {
          batch.quantity = Number(batch.quantity) + (direction === 'IN' ? line.quantity : -line.quantity);
          await this.batchService.update(line.batchId, { quantity: batch.quantity }, userId);
        }
      }
    }

    adjustment.status = 'POSTED';
    adjustment.postedBy = userId || null;
    adjustment.postedAt = new Date();
    adjustment.updatedBy = userId || null;
    return this.repo.save(adjustment);
  }

  async reject(id: string, userId?: string): Promise<StockAdjustment> {
    const adjustment = await this.findOne(id);
    if (adjustment.status !== 'APPROVED') {
      throw new BadRequestException(`Can only reject adjustments in APPROVED status`);
    }

    adjustment.status = 'DRAFT';
    adjustment.approvedBy = null;
    adjustment.approvedAt = null;
    adjustment.updatedBy = userId || null;
    return this.repo.save(adjustment);
  }
}
