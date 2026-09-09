import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, In } from 'typeorm';
import {
  StockAdjustment,
  StockAdjustmentLine,
  StockAdjustmentHistory,
  InventoryPolicy,
} from '../entities';
import {
  CreateStockAdjustmentDto,
  CreateStockAdjustmentLineDto,
  UpdateStockAdjustmentDto,
  StockAdjustmentFilterDto,
  SubmitStockAdjustmentDto,
  ApproveStockAdjustmentDto,
  ReturnStockAdjustmentDto,
  RejectStockAdjustmentDto,
  PostStockAdjustmentDto,
} from '../dto';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryBalanceService } from './inventory-balance.service';
import { BatchService } from './batch.service';
import { Item } from '../../item/entities/item.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';

@Injectable()
export class StockAdjustmentService {
  private readonly logger = new Logger(StockAdjustmentService.name);

  constructor(
    @InjectRepository(StockAdjustment)
    private readonly repo: Repository<StockAdjustment>,
    @InjectRepository(StockAdjustmentLine)
    private readonly lineRepo: Repository<StockAdjustmentLine>,
    @InjectRepository(StockAdjustmentHistory)
    private readonly historyRepo: Repository<StockAdjustmentHistory>,
    @InjectRepository(InventoryPolicy)
    private readonly policyRepo: Repository<InventoryPolicy>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    private readonly ledgerService: StockLedgerService,
    private readonly balanceService: InventoryBalanceService,
    private readonly batchService: BatchService,
    @Optional()
    @InjectRepository(Warehouse)
    private readonly warehouseRepo?: Repository<Warehouse>,
  ) {}

  /**
   * Record an immutable entry in the Stock Adjustment History audit trail.
   */
  private async recordHistory(
    adjustmentId: string,
    action: string,
    fromStatus: string | null,
    toStatus: string,
    performedBy?: string | null,
    reason?: string | null,
    remarks?: string | null,
    manager?: EntityManager,
  ): Promise<StockAdjustmentHistory> {
    const historyRepository = manager ? manager.getRepository(StockAdjustmentHistory) : this.historyRepo;
    const entry = historyRepository.create({
      adjustmentId,
      action,
      fromStatus,
      toStatus,
      performedBy: performedBy || null,
      performedAt: new Date(),
      reason: reason || null,
      remarks: remarks || null,
    });
    return historyRepository.save(entry);
  }

  async create(dto: CreateStockAdjustmentDto, userId?: string): Promise<StockAdjustment> {
    let code = dto.adjustmentCode?.trim();
    if (!code) {
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randPart = Math.floor(1000 + Math.random() * 9000);
      code = `SA-${datePart}-${randPart}`;
    }

    const existing = await this.repo.findOne({
      where: { adjustmentCode: code, companyId: dto.companyId },
    });
    if (existing) {
      code = `SA-${Date.now()}`;
    }

    let adjType = dto.adjustmentType;
    if (adjType === 'ADJUSTMENT_IN') adjType = 'INCREASE';
    if (adjType === 'ADJUSTMENT_OUT') adjType = 'DECREASE';

    let qty = dto.quantity !== undefined ? Number(dto.quantity) : undefined;
    if (dto.countedQuantity !== undefined && dto.currentStock !== undefined) {
      const variance = Number(dto.countedQuantity) - Number(dto.currentStock);
      adjType = variance >= 0 ? 'INCREASE' : 'DECREASE';
      qty = Math.abs(variance);
    } else if (qty !== undefined && qty < 0) {
      adjType = 'DECREASE';
      qty = Math.abs(qty);
    }

    // Validate warehouse belongs to the specified company
    if (dto.warehouseId && this.warehouseRepo) {
      const warehouse = await this.warehouseRepo.findOne({ where: { id: dto.warehouseId } });
      if (!warehouse) {
        throw new BadRequestException(`Warehouse with ID '${dto.warehouseId}' not found.`);
      }
      if (warehouse.companyId && warehouse.companyId !== dto.companyId) {
        throw new BadRequestException('Selected warehouse does not belong to the authorized company.');
      }
    }

    // Validate item belongs to the specified company
    if (dto.itemId) {
      const item = await this.itemRepo.findOne({ where: { id: dto.itemId } });
      if (!item) {
        throw new BadRequestException(`Item with ID '${dto.itemId}' not found.`);
      }
      if (item.companyId && item.companyId !== dto.companyId) {
        throw new BadRequestException('Selected item does not belong to the authorized company.');
      }
    }

    const adjustment = this.repo.create({
      companyId: dto.companyId,
      warehouseId: dto.warehouseId,
      adjustmentCode: code,
      adjustmentType: adjType,
      reason: dto.reason || '',
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(adjustment);

    if (dto.itemId && qty !== undefined && qty > 0) {
      let uomId = dto.uomId;
      if (!uomId) {
        const item = await this.itemRepo.findOne({ where: { id: dto.itemId } });
        if (item) uomId = item.baseUomId;
      }
      if (uomId) {
        const line = this.lineRepo.create({
          adjustmentId: saved.id,
          itemId: dto.itemId,
          locationId: dto.locationId || null,
          batchId: dto.batchId || null,
          uomId,
          quantity: qty,
          unitCost: dto.unitCost || null,
          notes: dto.reason || 'Initial adjustment line',
        });
        await this.lineRepo.save(line);
      }
    }

    // Record creation in history
    await this.recordHistory(
      saved.id,
      'CREATED',
      null,
      'DRAFT',
      userId,
      dto.reason || 'Created as Draft',
      'Stock adjustment record created',
    );

    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateStockAdjustmentDto, userId?: string, companyId?: string): Promise<StockAdjustment> {
    const adjustment = await this.findOne(id, companyId);
    if (adjustment.status !== 'DRAFT' && adjustment.status !== 'RETURNED') {
      throw new BadRequestException(
        `Cannot edit stock adjustment in '${adjustment.status}' status. Only DRAFT or RETURNED adjustments can be modified.`,
      );
    }

    // Validate warehouse belongs to the adjustment's company
    if (dto.warehouseId && this.warehouseRepo) {
      const warehouse = await this.warehouseRepo.findOne({ where: { id: dto.warehouseId } });
      if (!warehouse) {
        throw new BadRequestException(`Warehouse with ID '${dto.warehouseId}' not found.`);
      }
      if (warehouse.companyId && warehouse.companyId !== adjustment.companyId) {
        throw new BadRequestException('Selected warehouse does not belong to the authorized company.');
      }
    }

    // Validate item belongs to the adjustment's company
    if (dto.itemId) {
      const item = await this.itemRepo.findOne({ where: { id: dto.itemId } });
      if (!item) {
        throw new BadRequestException(`Item with ID '${dto.itemId}' not found.`);
      }
      if (item.companyId && item.companyId !== adjustment.companyId) {
        throw new BadRequestException('Selected item does not belong to the authorized company.');
      }
    }

    const prevStatus = adjustment.status;

    if (dto.warehouseId) adjustment.warehouseId = dto.warehouseId;
    if (dto.adjustmentType) {
      let adjType = dto.adjustmentType;
      if (adjType === 'ADJUSTMENT_IN') adjType = 'INCREASE';
      if (adjType === 'ADJUSTMENT_OUT') adjType = 'DECREASE';
      adjustment.adjustmentType = adjType;
    }
    if (dto.reason !== undefined) adjustment.reason = dto.reason;
    adjustment.updatedBy = userId || null;

    // If an adjustment was in RETURNED status, editing it resets it back to DRAFT so it can be re-submitted cleanly
    if (adjustment.status === 'RETURNED') {
      adjustment.status = 'DRAFT';
      adjustment.returnReason = null;
      adjustment.returnRemarks = null;
      adjustment.returnedBy = null;
      adjustment.returnedAt = null;
    }

    await this.repo.save(adjustment);

    if (dto.itemId || dto.quantity !== undefined || dto.countedQuantity !== undefined) {
      const line = adjustment.lines?.[0];
      let qty = dto.quantity !== undefined ? Number(dto.quantity) : (line ? Number(line.quantity) : 0);
      if (dto.countedQuantity !== undefined && dto.currentStock !== undefined) {
        const variance = Number(dto.countedQuantity) - Number(dto.currentStock);
        adjustment.adjustmentType = variance >= 0 ? 'INCREASE' : 'DECREASE';
        qty = Math.abs(variance);
        await this.repo.save(adjustment);
      } else if (qty < 0) {
        adjustment.adjustmentType = 'DECREASE';
        qty = Math.abs(qty);
        await this.repo.save(adjustment);
      }

      if (line) {
        if (dto.itemId) line.itemId = dto.itemId;
        line.quantity = qty;
        if (dto.reason !== undefined) line.notes = dto.reason;
        await this.lineRepo.save(line);
      } else if (dto.itemId && qty > 0) {
        let uomId = dto.uomId;
        if (!uomId) {
          const item = await this.itemRepo.findOne({ where: { id: dto.itemId } });
          if (item) uomId = item.baseUomId;
        }
        if (uomId) {
          const newLine = this.lineRepo.create({
            adjustmentId: id,
            itemId: dto.itemId,
            locationId: dto.locationId || null,
            batchId: dto.batchId || null,
            uomId,
            quantity: qty,
            notes: dto.reason || 'Adjustment line',
          });
          await this.lineRepo.save(newLine);
        }
      }
    }

    // Record edit action in history
    await this.recordHistory(
      id,
      'UPDATED',
      prevStatus,
      adjustment.status,
      userId,
      dto.reason,
      prevStatus === 'RETURNED' ? 'Corrected returned adjustment; status reset to DRAFT' : 'Adjustment details updated',
    );

    return this.findOne(id);
  }

  async findAll(filter: StockAdjustmentFilterDto): Promise<{ data: any[]; total: number }> {
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
      .leftJoinAndSelect('adj.warehouse', 'warehouse')
      .leftJoinAndSelect('adj.lines', 'lines')
      .leftJoinAndSelect('lines.item', 'item')
      .leftJoinAndSelect('lines.uom', 'uom')
      .leftJoinAndSelect('adj.createdByUser', 'createdByUser')
      .leftJoinAndSelect('adj.submittedByUser', 'submittedByUser')
      .leftJoinAndSelect('adj.approvedByUser', 'approvedByUser')
      .leftJoinAndSelect('adj.returnedByUser', 'returnedByUser')
      .leftJoinAndSelect('adj.rejectedByUser', 'rejectedByUser')
      .leftJoinAndSelect('adj.postedByUser', 'postedByUser');

    if (companyId) qb.where('adj.companyId = :companyId', { companyId });
    if (warehouseId) qb[companyId ? 'andWhere' : 'where']('adj.warehouseId = :warehouseId', { warehouseId });
    if (adjustmentType) {
      const normType = adjustmentType === 'ADJUSTMENT_IN' ? 'INCREASE' : adjustmentType === 'ADJUSTMENT_OUT' ? 'DECREASE' : adjustmentType;
      qb.andWhere('adj.adjustmentType = :adjustmentType', { adjustmentType: normType });
    }
    if (status) {
      if (status === 'PENDING_APPROVAL') {
        qb.andWhere('(adj.status = :status OR adj.status = :submittedStatus)', {
          status: 'PENDING_APPROVAL',
          submittedStatus: 'SUBMITTED',
        });
      } else {
        qb.andWhere('adj.status = :status', { status });
      }
    }

    const validSortFields = ['createdAt', 'adjustmentCode', 'status', 'adjustmentType'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`adj.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const [rawList, total] = await qb.getManyAndCount();

    const data = rawList.map((adj) => {
      const firstLine = adj.lines?.[0];
      const normStatus = adj.status === 'SUBMITTED' ? 'PENDING_APPROVAL' : adj.status;
      return {
        ...adj,
        status: normStatus,
        adjustmentNumber: adj.adjustmentCode,
        itemId: firstLine?.itemId || null,
        itemName: firstLine?.item ? (firstLine.item.itemCode ? `${firstLine.item.itemCode} — ${firstLine.item.name}` : firstLine.item.name) : undefined,
        itemCode: firstLine?.item?.itemCode,
        quantity: firstLine?.quantity !== undefined ? Number(firstLine.quantity) : 0,
        uomCode: firstLine?.uom?.code || firstLine?.uom?.symbol,
        warehouseName: adj.warehouse?.name || adj.warehouse?.warehouseCode,
        createdByName: adj.createdByUser?.displayName || null,
        submittedByName: adj.submittedByUser?.displayName || null,
        approvedByName: adj.approvedByUser?.displayName || null,
        returnedByName: adj.returnedByUser?.displayName || null,
        rejectedByName: adj.rejectedByUser?.displayName || null,
        postedByName: adj.postedByUser?.displayName || null,
      };
    });

    return { data, total };
  }

  async findOne(id: string, companyId?: string): Promise<StockAdjustment> {
    const where: any = { id };
    if (companyId) {
      where.companyId = companyId;
    }

    const adjustment = await this.repo.findOne({
      where,
      relations: [
        'warehouse',
        'lines',
        'lines.item',
        'lines.uom',
        'lines.location',
        'lines.batch',
        'createdByUser',
        'submittedByUser',
        'approvedByUser',
        'returnedByUser',
        'rejectedByUser',
        'postedByUser',
      ],
    });
    if (!adjustment) throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);

    if (adjustment.status === 'SUBMITTED') {
      adjustment.status = 'PENDING_APPROVAL';
    }

    return adjustment;
  }

  /**
   * Get workflow history for a stock adjustment.
   */
  async getHistory(id: string, companyId?: string): Promise<StockAdjustmentHistory[]> {
    await this.findOne(id, companyId); // verify existence and company scope
    return this.historyRepo.find({
      where: { adjustmentId: id },
      relations: ['performedByUser'],
      order: { performedAt: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * Live summary counts of adjustments by status for tabs and badge indicators.
   */
  async getCounts(companyId?: string): Promise<{
    all: number;
    draft: number;
    pendingApproval: number;
    approved: number;
    returned: number;
    rejected: number;
    posted: number;
  }> {
    const qb = this.repo.createQueryBuilder('adj').select('adj.status', 'status').addSelect('COUNT(adj.id)', 'count');
    if (companyId) {
      qb.where('adj.companyId = :companyId', { companyId });
    }
    qb.groupBy('adj.status');
    const rows = await qb.getRawMany();

    const counts = {
      all: 0,
      total: 0,
      draft: 0,
      pendingApproval: 0,
      approved: 0,
      returned: 0,
      rejected: 0,
      posted: 0,
    };

    for (const r of rows) {
      const cnt = parseInt(r.count, 10) || 0;
      counts.all += cnt;
      if (r.status === 'DRAFT') counts.draft += cnt;
      else if (r.status === 'PENDING_APPROVAL' || r.status === 'SUBMITTED') counts.pendingApproval += cnt;
      else if (r.status === 'APPROVED') counts.approved += cnt;
      else if (r.status === 'RETURNED') counts.returned += cnt;
      else if (r.status === 'REJECTED') counts.rejected += cnt;
      else if (r.status === 'POSTED') counts.posted += cnt;
    }
    counts.total = counts.all;

    return counts;
  }

  /**
   * Get live stock impact (Current On-Hand, Available, Reserved, Adjustment Delta, Projected Balance)
   * calculated directly from actual inventory balances in the database.
   */
  async getLiveStockImpact(id: string, companyId?: string): Promise<any> {
    const adjustment = await this.findOne(id, companyId);
    const line = adjustment.lines?.[0];
    if (!line) {
      return {
        hasLine: false,
        onHand: 0,
        reserved: 0,
        available: 0,
        adjustmentQuantity: 0,
        projectedBalance: 0,
        allowNegativeStock: false,
      };
    }

    const balance = await this.balanceService.findByItemWarehouse(
      adjustment.companyId,
      line.itemId,
      adjustment.warehouseId,
      line.locationId || undefined,
      line.batchId || undefined,
    );

    const onHand = balance ? Number(balance.onHand) : 0;
    const reserved = balance ? Number(balance.reserved) : 0;
    const available = balance ? Number(balance.available) : 0;

    const isIn = adjustment.adjustmentType === 'INCREASE' || adjustment.adjustmentType === 'ADJUSTMENT_IN';
    const delta = isIn ? Number(line.quantity) : -Number(line.quantity);
    const projectedBalance = onHand + delta;

    const policy = await this.policyRepo.findOne({
      where: {
        companyId: adjustment.companyId,
        itemId: line.itemId,
        warehouseId: adjustment.warehouseId,
      },
    });
    const allowNegativeStock = Boolean(policy?.allowNegativeStock);

    return {
      hasLine: true,
      itemId: line.itemId,
      itemCode: line.item?.itemCode,
      itemName: line.item?.name,
      warehouseId: adjustment.warehouseId,
      warehouseName: adjustment.warehouse?.name,
      uomCode: line.uom?.code || line.uom?.symbol,
      adjustmentType: adjustment.adjustmentType,
      isIncrease: isIn,
      adjustmentQuantity: Number(line.quantity),
      onHand,
      reserved,
      available,
      projectedBalance,
      allowNegativeStock,
      isNegativeWarning: projectedBalance < 0 && !allowNegativeStock,
    };
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

  /**
   * Submit adjustment for review and approval.
   * Transition: DRAFT | RETURNED -> PENDING_APPROVAL
   */
  async submit(id: string, dto?: SubmitStockAdjustmentDto, userId?: string, companyId?: string): Promise<StockAdjustment> {
    const adjustment = await this.findOne(id, companyId);
    if (adjustment.status !== 'DRAFT' && adjustment.status !== 'RETURNED') {
      throw new BadRequestException(
        `Can only submit adjustments in DRAFT or RETURNED status. Current status: '${adjustment.status}'`,
      );
    }

    // Validation before submission
    if (!adjustment.lines || adjustment.lines.length === 0) {
      throw new BadRequestException('Cannot submit adjustment without any item lines. Please enter an item and quantity.');
    }

    const line = adjustment.lines[0];
    if (!line.itemId) {
      throw new BadRequestException('Cannot submit adjustment: Item is required.');
    }
    if (!line.quantity || Number(line.quantity) <= 0) {
      throw new BadRequestException('Cannot submit adjustment: Quantity must be greater than zero.');
    }
    if (!adjustment.warehouseId) {
      throw new BadRequestException('Cannot submit adjustment: Warehouse is required.');
    }

    const fromStatus = adjustment.status;
    adjustment.status = 'PENDING_APPROVAL';
    adjustment.submittedBy = userId || null;
    adjustment.submittedAt = new Date();
    adjustment.updatedBy = userId || null;
    const saved = await this.repo.save(adjustment);

    // Record submission in history
    await this.recordHistory(
      id,
      'SUBMITTED',
      fromStatus,
      'PENDING_APPROVAL',
      userId,
      null,
      dto?.remarks || 'Submitted for approval',
    );

    return this.findOne(saved.id);
  }

  /**
   * Approve stock adjustment.
   * Transition: PENDING_APPROVAL -> APPROVED
   * Enforces Segregation of Duties: Creator or Submitter cannot approve their own adjustment.
   */
  async approve(id: string, dto?: ApproveStockAdjustmentDto, userId?: string, companyId?: string): Promise<StockAdjustment> {
    const adjustment = await this.findOne(id, companyId);
    if (adjustment.status !== 'PENDING_APPROVAL' && adjustment.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Can only approve adjustments in PENDING_APPROVAL status. Current status: '${adjustment.status}'`,
      );
    }

    // Segregation of Duties: User who created or submitted the adjustment cannot approve it
    if (
      userId &&
      ((adjustment.createdBy && adjustment.createdBy === userId) ||
       (adjustment.submittedBy && adjustment.submittedBy === userId))
    ) {
      throw new BadRequestException(
        'You cannot approve your own stock adjustment. Approval must be completed by another authorized user.',
      );
    }

    const fromStatus = adjustment.status;
    adjustment.status = 'APPROVED';
    adjustment.approvedBy = userId || null;
    adjustment.approvedAt = new Date();
    adjustment.approvalRemarks = dto?.remarks || null;
    adjustment.updatedBy = userId || null;
    const saved = await this.repo.save(adjustment);

    // Record approval in history
    await this.recordHistory(
      id,
      'APPROVED',
      fromStatus,
      'APPROVED',
      userId,
      null,
      dto?.remarks || 'Stock adjustment approved',
    );

    return this.findOne(saved.id);
  }

  /**
   * Return adjustment to creator for correction.
   * Transition: PENDING_APPROVAL -> RETURNED
   * Requires mandatory return reason.
   */
  async return(id: string, dto: ReturnStockAdjustmentDto, userId?: string, companyId?: string): Promise<StockAdjustment> {
    const adjustment = await this.findOne(id, companyId);
    if (adjustment.status !== 'PENDING_APPROVAL' && adjustment.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Can only return adjustments in PENDING_APPROVAL status. Current status: '${adjustment.status}'`,
      );
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('Return reason is required.');
    }

    const fromStatus = adjustment.status;
    adjustment.status = 'RETURNED';
    adjustment.returnedBy = userId || null;
    adjustment.returnedAt = new Date();
    adjustment.returnReason = dto.reason.trim();
    adjustment.returnRemarks = dto.remarks || null;
    adjustment.updatedBy = userId || null;
    const saved = await this.repo.save(adjustment);

    // Record return in history
    await this.recordHistory(
      id,
      'RETURNED',
      fromStatus,
      'RETURNED',
      userId,
      dto.reason.trim(),
      dto.remarks || 'Returned to creator for correction',
    );

    return this.findOne(saved.id, companyId);
  }

  /**
   * Reject adjustment permanently.
   * Transition: PENDING_APPROVAL -> REJECTED
   * Requires mandatory rejection reason. Terminal state.
   */
  async reject(id: string, dto: RejectStockAdjustmentDto, userId?: string, companyId?: string): Promise<StockAdjustment> {
    const adjustment = await this.findOne(id, companyId);
    if (adjustment.status !== 'PENDING_APPROVAL' && adjustment.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Can only reject adjustments in PENDING_APPROVAL status. Current status: '${adjustment.status}'`,
      );
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('Rejection reason is required.');
    }

    const fromStatus = adjustment.status;
    adjustment.status = 'REJECTED';
    adjustment.rejectedBy = userId || null;
    adjustment.rejectedAt = new Date();
    adjustment.rejectionReason = dto.reason.trim();
    adjustment.rejectionRemarks = dto.remarks || null;
    adjustment.updatedBy = userId || null;
    const saved = await this.repo.save(adjustment);

    // Record rejection in history
    await this.recordHistory(
      id,
      'REJECTED',
      fromStatus,
      'REJECTED',
      userId,
      dto.reason.trim(),
      dto.remarks || 'Stock adjustment rejected',
    );

    return this.findOne(saved.id);
  }

  /**
   * Post approved adjustment to inventory ledger and balance.
   * Transition: APPROVED -> POSTED
   * Fully atomic, idempotent, concurrency-safe database transaction with pessimistic locking.
   */
  async post(id: string, dto?: PostStockAdjustmentDto, userId?: string, companyId?: string): Promise<StockAdjustment> {
    return this.repo.manager.transaction(async (manager: EntityManager) => {
      // 1. Pessimistic write lock to prevent simultaneous/duplicate posting
      const where: any = { id };
      if (companyId) {
        where.companyId = companyId;
      }

      const adjustment = await manager.getRepository(StockAdjustment).findOne({
        where,
        lock: { mode: 'pessimistic_write' },
      });

      if (!adjustment) {
        throw new NotFoundException(`Stock adjustment with ID '${id}' not found`);
      }

      // Idempotency: Protect against duplicate posting
      if (adjustment.status === 'POSTED') {
        throw new BadRequestException(`Stock adjustment '${adjustment.adjustmentCode}' has already been posted to inventory.`);
      }

      if (adjustment.status !== 'APPROVED') {
        throw new BadRequestException(
          `Can only post adjustments in APPROVED status. Current status: '${adjustment.status}'`,
        );
      }

      // Load lines and warehouse for posting if not already present
      if (!adjustment.warehouse && adjustment.warehouseId) {
        const wh = await manager.getRepository(Warehouse).findOne({ where: { id: adjustment.warehouseId } });
        if (wh) adjustment.warehouse = wh;
      }
      if (!adjustment.lines || adjustment.lines.length === 0) {
        adjustment.lines = await manager.getRepository(StockAdjustmentLine).find({
          where: { adjustmentId: id },
          relations: ['item', 'uom', 'location', 'batch'],
        });
      }

      if (!adjustment.lines || adjustment.lines.length === 0) {
        throw new BadRequestException(`Cannot post adjustment with no lines.`);
      }

      // 2. Validate negative stock rule for outgoing movements
      const isIn = adjustment.adjustmentType === 'INCREASE' || adjustment.adjustmentType === 'ADJUSTMENT_IN';
      const direction: 'IN' | 'OUT' = isIn ? 'IN' : 'OUT';

      for (const line of adjustment.lines) {
        if (direction === 'OUT') {
          const balance = await this.balanceService.findByItemWarehouse(
            adjustment.companyId,
            line.itemId,
            adjustment.warehouseId,
            line.locationId || undefined,
            line.batchId || undefined,
            manager,
          );

          const currentOnHand = balance ? Number(balance.onHand) : 0;
          if (currentOnHand < Number(line.quantity)) {
            const policy = await manager.getRepository(InventoryPolicy).findOne({
              where: {
                companyId: adjustment.companyId,
                itemId: line.itemId,
                warehouseId: adjustment.warehouseId,
              },
            });

            if (!policy || !policy.allowNegativeStock) {
              const itemCode = line.item?.itemCode || line.itemId;
              throw new BadRequestException(
                `Insufficient available stock for item '${itemCode}'. Current balance: ${currentOnHand}, Adjustment Out: ${line.quantity}. Negative stock is not permitted by company policy.`,
              );
            }
          }
        }
      }

      // 3. Create stock ledger entries and update inventory balances
      for (const line of adjustment.lines) {
        await this.ledgerService.create(
          {
            companyId: adjustment.companyId,
            transactionType: direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
            itemId: line.itemId,
            warehouseId: adjustment.warehouseId,
            locationId: line.locationId || undefined,
            quantity: Number(line.quantity),
            uomId: line.uomId,
            direction,
            referenceType: 'ADJUSTMENT',
            referenceId: adjustment.id,
            referenceNumber: adjustment.adjustmentCode,
            batchId: line.batchId || undefined,
            createdBy: userId,
            notes: line.notes || adjustment.reason || 'Stock Adjustment Posting',
          },
          manager,
        );

        await this.balanceService.updateBalance(
          adjustment.companyId,
          line.itemId,
          adjustment.warehouseId,
          line.locationId,
          line.batchId,
          line.uomId,
          Number(line.quantity),
          direction,
          manager,
        );

        if (line.batchId) {
          const batch = await this.batchService.findOne(line.batchId);
          if (batch) {
            batch.quantity = Number(batch.quantity) + (direction === 'IN' ? Number(line.quantity) : -Number(line.quantity));
            await this.batchService.update(line.batchId, { quantity: batch.quantity }, userId);
          }
        }
      }

      // 4. Update adjustment status to POSTED
      adjustment.status = 'POSTED';
      adjustment.postedBy = userId || null;
      adjustment.postedAt = new Date();
      adjustment.updatedBy = userId || null;
      const saved = await manager.getRepository(StockAdjustment).save(adjustment);

      // 5. Record POSTED in history
      await this.recordHistory(
        adjustment.id,
        'POSTED',
        'APPROVED',
        'POSTED',
        userId,
        null,
        dto?.remarks || 'Stock adjustment posted to inventory ledger and balances updated',
        manager,
      );

      return saved;
    });
  }

  async cancel(id: string, userId?: string): Promise<StockAdjustment> {
    const adjustment = await this.findOne(id);
    if (adjustment.status !== 'DRAFT' && adjustment.status !== 'PENDING_APPROVAL' && adjustment.status !== 'SUBMITTED') {
      throw new BadRequestException(`Can only cancel adjustments in DRAFT or PENDING_APPROVAL status.`);
    }

    const fromStatus = adjustment.status;
    adjustment.status = 'CANCELLED';
    adjustment.updatedBy = userId || null;
    const saved = await this.repo.save(adjustment);

    await this.recordHistory(
      id,
      'CANCELLED',
      fromStatus,
      'CANCELLED',
      userId,
      null,
      'Stock adjustment cancelled',
    );

    return saved;
  }

  async delete(id: string, userId?: string, companyId?: string): Promise<void> {
    const adjustment = await this.findOne(id, companyId);
    if (adjustment.status !== 'DRAFT' && adjustment.status !== 'RETURNED') {
      throw new BadRequestException(`Cannot delete adjustment in '${adjustment.status}' status. Only DRAFT or RETURNED adjustments can be deleted.`);
    }

    // Delete lines first
    if (adjustment.lines && adjustment.lines.length > 0) {
      await this.lineRepo.remove(adjustment.lines);
    }
    await this.repo.remove(adjustment);
  }
}
