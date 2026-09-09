import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import {
  StockTransfer,
  StockTransferLine,
  StockTransferHistory,
  InventoryPolicy,
} from '../entities';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { Item } from '../../item/entities/item.entity';
import {
  CreateStockTransferDto,
  CreateStockTransferLineDto,
  StockTransferFilterDto,
  UpdateStockTransferDto,
  SubmitStockTransferDto,
  ApproveStockTransferDto,
  ReturnStockTransferDto,
  RejectStockTransferDto,
  PostStockTransferDto,
} from '../dto';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryBalanceService } from './inventory-balance.service';
import { BatchService } from './batch.service';

@Injectable()
export class StockTransferService {
  private readonly logger = new Logger(StockTransferService.name);

  constructor(
    @InjectRepository(StockTransfer)
    private readonly repo: Repository<StockTransfer>,
    @InjectRepository(StockTransferLine)
    private readonly lineRepo: Repository<StockTransferLine>,
    @InjectRepository(StockTransferHistory)
    private readonly historyRepo: Repository<StockTransferHistory>,
    @InjectRepository(InventoryPolicy)
    private readonly policyRepo: Repository<InventoryPolicy>,
    private readonly ledgerService: StockLedgerService,
    private readonly balanceService: InventoryBalanceService,
    private readonly batchService: BatchService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Helper to append an immutable audit record to stock_transfer_history.
   */
  private async recordHistory(
    transferId: string,
    action: string,
    fromStatus: string | null,
    toStatus: string,
    userId?: string | null,
    reason?: string | null,
    remarks?: string | null,
    manager?: EntityManager,
  ): Promise<StockTransferHistory> {
    const historyRepo = manager
      ? manager.getRepository(StockTransferHistory)
      : this.historyRepo;

    const entry = historyRepo.create({
      transferId,
      action,
      fromStatus,
      toStatus,
      performedBy: userId || null,
      performedAt: new Date(),
      reason: reason || null,
      remarks: remarks || null,
    });
    return historyRepo.save(entry);
  }

  /**
   * Create a new stock transfer in DRAFT status.
   */
  async create(dto: CreateStockTransferDto, userId?: string, companyId?: string): Promise<StockTransfer> {
    const resolvedCompanyId = dto.companyId || companyId;
    if (!resolvedCompanyId) {
      throw new BadRequestException('Company context is required to create a stock transfer');
    }

    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Source and destination warehouses must be different');
    }

    if (!dto.transferCode) {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const rand = Math.floor(1000 + Math.random() * 9000);
      dto.transferCode = `TRF-${dateStr}-${rand}`;
    }

    const existing = await this.repo.findOne({
      where: { transferCode: dto.transferCode, companyId: resolvedCompanyId },
    });
    if (existing) {
      throw new ConflictException(
        `Transfer code '${dto.transferCode}' already exists in this company`,
      );
    }

    const hasSingleStepLine = Boolean(dto.itemId && dto.quantity && Number(dto.quantity) > 0);
    if (!hasSingleStepLine) {
      throw new BadRequestException('Stock transfer requires an item and a positive quantity');
    }

    let uomId = dto.uomId;
    if (!uomId) {
      const item = await this.repo.manager.getRepository(Item).findOne({ where: { id: dto.itemId } });
      uomId = item?.baseUomId;
      if (!uomId) {
        throw new BadRequestException('UOM could not be resolved for the transfer item');
      }
    }

    const transfer = this.repo.create({
      companyId: resolvedCompanyId,
      transferCode: dto.transferCode,
      fromWarehouseId: dto.fromWarehouseId,
      toWarehouseId: dto.toWarehouseId,
      fromLocationId: dto.fromLocationId || null,
      toLocationId: dto.toLocationId || null,
      notes: dto.notes || null,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(transfer);

    const line = this.lineRepo.create({
      transferId: saved.id,
      itemId: dto.itemId!,
      uomId: uomId!,
      quantity: Number(dto.quantity),
      fromLocationId: dto.fromLocationId || null,
      toLocationId: dto.toLocationId || null,
      notes: dto.notes || null,
    });
    await this.lineRepo.save(line);

    // Record CREATED audit event
    await this.recordHistory(
      saved.id,
      'CREATED',
      null,
      'DRAFT',
      userId,
      null,
      dto.notes || 'Draft stock transfer created',
    );

    return this.findOne(saved.id, resolvedCompanyId);
  }

  /**
   * List transfers with filters, search, pagination, and full user audit relations.
   */
  async findAll(filter: StockTransferFilterDto): Promise<{ data: StockTransfer[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      search,
      companyId,
      fromWarehouseId,
      toWarehouseId,
      status,
      sortField = 'createdAt',
      sortOrder = 'DESC',
    } = filter;

    const qb = this.repo
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.fromWarehouse', 'fromWarehouse')
      .leftJoinAndSelect('transfer.toWarehouse', 'toWarehouse')
      .leftJoinAndSelect('transfer.lines', 'lines')
      .leftJoinAndSelect('lines.item', 'item')
      .leftJoinAndSelect('lines.uom', 'uom')
      .leftJoinAndSelect('lines.batch', 'batch')
      .leftJoinAndSelect('transfer.createdByUser', 'createdByUser')
      .leftJoinAndSelect('transfer.submittedByUser', 'submittedByUser')
      .leftJoinAndSelect('transfer.approvedByUser', 'approvedByUser')
      .leftJoinAndSelect('transfer.postedByUser', 'postedByUser')
      .leftJoinAndSelect('transfer.returnedByUser', 'returnedByUser')
      .leftJoinAndSelect('transfer.rejectedByUser', 'rejectedByUser');

    if (companyId) {
      qb.where('transfer.companyId = :companyId', { companyId });
    }
    if (fromWarehouseId) {
      qb[companyId ? 'andWhere' : 'where']('transfer.fromWarehouseId = :fromWarehouseId', { fromWarehouseId });
    }
    if (toWarehouseId) {
      qb[companyId || fromWarehouseId ? 'andWhere' : 'where']('transfer.toWarehouseId = :toWarehouseId', { toWarehouseId });
    }
    if (status) {
      if (status === 'PENDING_APPROVAL' || status === 'SUBMITTED') {
        qb.andWhere('transfer.status IN (:...statuses)', { statuses: ['PENDING_APPROVAL', 'SUBMITTED'] });
      } else {
        qb.andWhere('transfer.status = :status', { status });
      }
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(transfer.transferCode ILIKE :term OR item.name ILIKE :term OR item.itemCode ILIKE :term OR fromWarehouse.name ILIKE :term OR toWarehouse.name ILIKE :term OR transfer.notes ILIKE :term)',
        { term },
      );
    }

    const validSortFields = ['createdAt', 'transferCode', 'status'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`transfer.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    // Map legacy SUBMITTED status to PENDING_APPROVAL for uniform UI rendering
    for (const item of data) {
      if (item.status === 'SUBMITTED') {
        item.status = 'PENDING_APPROVAL';
      }
    }

    return { data, total };
  }

  /**
   * Get single transfer with full lines, warehouses, user details, and history.
   */
  async findOne(id: string, companyId?: string): Promise<StockTransfer> {
    const qb = this.repo
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.fromWarehouse', 'fromWarehouse')
      .leftJoinAndSelect('transfer.toWarehouse', 'toWarehouse')
      .leftJoinAndSelect('transfer.fromLocation', 'fromLocation')
      .leftJoinAndSelect('transfer.toLocation', 'toLocation')
      .leftJoinAndSelect('transfer.lines', 'lines')
      .leftJoinAndSelect('lines.item', 'item')
      .leftJoinAndSelect('lines.uom', 'uom')
      .leftJoinAndSelect('lines.batch', 'batch')
      .leftJoinAndSelect('lines.fromLocation', 'lineFromLocation')
      .leftJoinAndSelect('lines.toLocation', 'lineToLocation')
      .leftJoinAndSelect('transfer.createdByUser', 'createdByUser')
      .leftJoinAndSelect('transfer.submittedByUser', 'submittedByUser')
      .leftJoinAndSelect('transfer.approvedByUser', 'approvedByUser')
      .leftJoinAndSelect('transfer.postedByUser', 'postedByUser')
      .leftJoinAndSelect('transfer.returnedByUser', 'returnedByUser')
      .leftJoinAndSelect('transfer.rejectedByUser', 'rejectedByUser')
      .leftJoinAndSelect('transfer.history', 'history')
      .leftJoinAndSelect('history.performedByUser', 'historyUser')
      .where('transfer.id = :id', { id });

    if (companyId) {
      qb.andWhere('transfer.companyId = :companyId', { companyId });
    }

    qb.orderBy('history.performedAt', 'ASC');

    const transfer = await qb.getOne();
    if (!transfer) {
      throw new NotFoundException(`Stock transfer with ID '${id}' not found`);
    }

    if (transfer.status === 'SUBMITTED') {
      transfer.status = 'PENDING_APPROVAL';
    }

    return transfer;
  }

  /**
   * Update transfer details (only permitted in DRAFT or RETURNED status, except notes).
   */
  async update(id: string, dto: UpdateStockTransferDto, userId?: string, companyId?: string): Promise<StockTransfer> {
    const transfer = await this.findOne(id, companyId);

    const isDraftOrReturned = transfer.status === 'DRAFT' || transfer.status === 'RETURNED';

    if (!isDraftOrReturned && (dto.fromWarehouseId || dto.toWarehouseId || dto.itemId || dto.quantity != null)) {
      throw new BadRequestException(
        `Cannot modify transfer items or warehouses in status '${transfer.status}'. Only DRAFT or RETURNED transfers can be edited.`,
      );
    }

    if (dto.notes !== undefined) {
      transfer.notes = dto.notes;
    }

    if (isDraftOrReturned) {
      if (dto.fromWarehouseId) transfer.fromWarehouseId = dto.fromWarehouseId;
      if (dto.toWarehouseId) transfer.toWarehouseId = dto.toWarehouseId;

      if (transfer.fromWarehouseId === transfer.toWarehouseId) {
        throw new BadRequestException('Source and destination warehouses must be different');
      }

      if (dto.itemId || dto.quantity != null) {
        if (transfer.lines && transfer.lines.length > 0) {
          const line = transfer.lines[0];
          if (dto.itemId) line.itemId = dto.itemId;
          if (dto.quantity != null) {
            if (Number(dto.quantity) <= 0) {
              throw new BadRequestException('Quantity must be greater than zero');
            }
            line.quantity = Number(dto.quantity);
          }
          if (dto.uomId) line.uomId = dto.uomId;
          await this.lineRepo.save(line);
        } else if (dto.itemId && dto.quantity != null) {
          let uomId = dto.uomId;
          if (!uomId) {
            const item = await this.repo.manager.getRepository(Item).findOne({ where: { id: dto.itemId } });
            uomId = item?.baseUomId;
          }
          if (uomId) {
            await this.addLine(transfer.id, {
              itemId: dto.itemId,
              quantity: Number(dto.quantity),
              uomId,
            });
          }
        }
      }
    }

    transfer.updatedBy = userId || null;
    await this.repo.save(transfer);
    return this.findOne(id, companyId);
  }

  /**
   * Submit draft or returned transfer for approval.
   * Transition: DRAFT | RETURNED -> PENDING_APPROVAL
   */
  async submit(id: string, dto?: SubmitStockTransferDto, userId?: string, companyId?: string): Promise<StockTransfer> {
    const transfer = await this.findOne(id, companyId);

    if (transfer.status !== 'DRAFT' && transfer.status !== 'RETURNED') {
      throw new BadRequestException(
        `Can only submit transfers in DRAFT or RETURNED status. Current status: '${transfer.status}'`,
      );
    }

    if (!transfer.lines || transfer.lines.length === 0) {
      throw new BadRequestException('Cannot submit transfer without items. Please specify an item and quantity.');
    }

    const line = transfer.lines[0];
    if (!line.itemId) {
      throw new BadRequestException('Cannot submit transfer: Item is required.');
    }
    if (!line.quantity || Number(line.quantity) <= 0) {
      throw new BadRequestException('Cannot submit transfer: Quantity must be greater than zero.');
    }
    if (transfer.fromWarehouseId === transfer.toWarehouseId) {
      throw new BadRequestException('Cannot submit transfer: Source and destination warehouses must be different.');
    }

    const fromStatus = transfer.status;
    transfer.status = 'PENDING_APPROVAL';
    transfer.submittedBy = userId || transfer.submittedBy || transfer.createdBy || null;
    transfer.submittedAt = new Date();
    transfer.updatedBy = userId || null;

    const saved = await this.repo.save(transfer);

    await this.recordHistory(
      saved.id,
      'SUBMITTED',
      fromStatus,
      'PENDING_APPROVAL',
      userId,
      null,
      dto?.remarks || 'Submitted for review and approval',
    );

    return this.findOne(saved.id, companyId);
  }

  /**
   * Approve stock transfer.
   * Transition: PENDING_APPROVAL -> APPROVED
   * Strictly enforces Segregation of Duties (creator or submitter cannot approve).
   */
  async approve(id: string, dto?: ApproveStockTransferDto, userId?: string, companyId?: string): Promise<StockTransfer> {
    const transfer = await this.findOne(id, companyId);

    if (transfer.status !== 'PENDING_APPROVAL' && (transfer as any).status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Can only approve transfers in PENDING_APPROVAL status. Current status: '${transfer.status}'`,
      );
    }

    // Segregation of Duties enforcement
    if (userId) {
      const isCreator = transfer.createdBy === userId;
      const isSubmitter = transfer.submittedBy === userId;
      if (isCreator || isSubmitter) {
        throw new BadRequestException(
          'You cannot approve your own stock transfer. Approval must be completed by another authorized user.',
        );
      }
    }

    if (transfer.fromWarehouseId === transfer.toWarehouseId) {
      throw new BadRequestException('Source and destination warehouses cannot be the same');
    }

    transfer.status = 'APPROVED';
    transfer.approvedBy = userId || null;
    transfer.approvedAt = new Date();
    transfer.approvalRemarks = dto?.remarks || null;
    transfer.updatedBy = userId || null;

    const saved = await this.repo.save(transfer);

    await this.recordHistory(
      saved.id,
      'APPROVED',
      'PENDING_APPROVAL',
      'APPROVED',
      userId,
      null,
      dto?.remarks || 'Stock transfer approved',
    );

    return this.findOne(saved.id, companyId);
  }

  /**
   * Return stock transfer to requester for corrections.
   * Transition: PENDING_APPROVAL -> RETURNED
   * Requires mandatory return reason.
   */
  async return(id: string, dto: ReturnStockTransferDto, userId?: string, companyId?: string): Promise<StockTransfer> {
    const transfer = await this.findOne(id, companyId);

    if (transfer.status !== 'PENDING_APPROVAL' && (transfer as any).status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Can only return transfers in PENDING_APPROVAL status. Current status: '${transfer.status}'`,
      );
    }

    if (!dto?.reason || !dto.reason.trim()) {
      throw new BadRequestException('Return reason is required.');
    }

    transfer.status = 'RETURNED';
    transfer.returnedBy = userId || null;
    transfer.returnedAt = new Date();
    transfer.returnReason = dto.reason.trim();
    transfer.returnRemarks = dto.remarks?.trim() || null;
    transfer.updatedBy = userId || null;

    const saved = await this.repo.save(transfer);

    await this.recordHistory(
      saved.id,
      'RETURNED',
      'PENDING_APPROVAL',
      'RETURNED',
      userId,
      dto.reason.trim(),
      dto.remarks?.trim() || 'Returned to requester for corrections',
    );

    return this.findOne(saved.id, companyId);
  }

  /**
   * Reject stock transfer permanently.
   * Transition: PENDING_APPROVAL -> REJECTED
   * Requires mandatory rejection reason.
   */
  async reject(id: string, dto: RejectStockTransferDto, userId?: string, companyId?: string): Promise<StockTransfer> {
    const transfer = await this.findOne(id, companyId);

    if (transfer.status !== 'PENDING_APPROVAL' && (transfer as any).status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Can only reject transfers in PENDING_APPROVAL status. Current status: '${transfer.status}'`,
      );
    }

    if (!dto?.reason || !dto.reason.trim()) {
      throw new BadRequestException('Rejection reason is required.');
    }

    transfer.status = 'REJECTED';
    transfer.rejectedBy = userId || null;
    transfer.rejectedAt = new Date();
    transfer.rejectionReason = dto.reason.trim();
    transfer.rejectionRemarks = dto.remarks?.trim() || null;
    transfer.updatedBy = userId || null;

    const saved = await this.repo.save(transfer);

    await this.recordHistory(
      saved.id,
      'REJECTED',
      'PENDING_APPROVAL',
      'REJECTED',
      userId,
      dto.reason.trim(),
      dto.remarks?.trim() || 'Stock transfer rejected',
    );

    return this.findOne(saved.id, companyId);
  }

  /**
   * Atomically post approved stock transfer to inventory ledger and balances.
   * Transition: APPROVED -> POSTED
   * Uses pessimistic write lock inside a database transaction to prevent double posting or concurrent execution.
   */
  async post(id: string, dto?: PostStockTransferDto, userId?: string, companyId?: string): Promise<StockTransfer> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      // 1. Fetch transfer with pessimistic write lock
      const transfer = await manager.getRepository(StockTransfer).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!transfer) {
        throw new NotFoundException(`Stock transfer with ID '${id}' not found`);
      }

      if (companyId && transfer.companyId !== companyId) {
        throw new BadRequestException('Transfer does not belong to the active company');
      }

      if (transfer.status === 'POSTED') {
        throw new BadRequestException(`Stock transfer '${transfer.transferCode}' has already been posted to inventory.`);
      }

      if (transfer.status !== 'APPROVED') {
        throw new BadRequestException(
          `Can only post transfers in APPROVED status. Current status: '${transfer.status}'`,
        );
      }

      if (transfer.fromWarehouseId === transfer.toWarehouseId) {
        throw new BadRequestException('Source and destination warehouses must be different');
      }

      // Load lines with relations
      const lines = await manager.getRepository(StockTransferLine).find({
        where: { transferId: id },
        relations: ['item', 'uom', 'batch'],
      });

      if (!lines || lines.length === 0) {
        throw new BadRequestException('Cannot post transfer with no lines');
      }

      // 2. Validate negative stock rule for source warehouse
      for (const line of lines) {
        const balance = await this.balanceService.findByItemWarehouse(
          transfer.companyId,
          line.itemId,
          transfer.fromWarehouseId,
          line.fromLocationId || undefined,
          line.batchId || undefined,
          manager,
        );

        const currentOnHand = balance ? Number(balance.onHand) : 0;
        if (currentOnHand < Number(line.quantity)) {
          const policy = await manager.getRepository(InventoryPolicy).findOne({
            where: {
              companyId: transfer.companyId,
              itemId: line.itemId,
              warehouseId: transfer.fromWarehouseId,
            },
          });

          if (!policy || !policy.allowNegativeStock) {
            const itemCode = line.item?.itemCode || line.itemId;
            throw new BadRequestException(
              `Insufficient stock in source warehouse for item '${itemCode}'. Current balance: ${currentOnHand}, requested: ${line.quantity}. Negative stock is not permitted by company policy.`,
            );
          }
        }
      }

      // 3. Create ledger movements and update balances for both warehouses
      for (const line of lines) {
        // Source Warehouse: TRANSFER_OUT
        await this.ledgerService.create(
          {
            companyId: transfer.companyId,
            transactionType: 'TRANSFER_OUT',
            itemId: line.itemId,
            warehouseId: transfer.fromWarehouseId,
            locationId: line.fromLocationId || transfer.fromLocationId || undefined,
            quantity: Number(line.quantity),
            uomId: line.uomId,
            direction: 'OUT',
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            referenceNumber: transfer.transferCode,
            batchId: line.batchId || undefined,
            createdBy: userId,
            notes: line.notes || transfer.notes || 'Stock Transfer OUT',
          },
          manager,
        );

        // Destination Warehouse: TRANSFER_IN
        await this.ledgerService.create(
          {
            companyId: transfer.companyId,
            transactionType: 'TRANSFER_IN',
            itemId: line.itemId,
            warehouseId: transfer.toWarehouseId,
            locationId: line.toLocationId || transfer.toLocationId || undefined,
            quantity: Number(line.quantity),
            uomId: line.uomId,
            direction: 'IN',
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            referenceNumber: transfer.transferCode,
            batchId: line.batchId || undefined,
            createdBy: userId,
            notes: line.notes || transfer.notes || 'Stock Transfer IN',
          },
          manager,
        );

        // Update balances: decrease source warehouse
        await this.balanceService.updateBalance(
          transfer.companyId,
          line.itemId,
          transfer.fromWarehouseId,
          line.fromLocationId || transfer.fromLocationId,
          line.batchId,
          line.uomId,
          Number(line.quantity),
          'OUT',
          manager,
        );

        // Update balances: increase destination warehouse
        await this.balanceService.updateBalance(
          transfer.companyId,
          line.itemId,
          transfer.toWarehouseId,
          line.toLocationId || transfer.toLocationId,
          line.batchId,
          line.uomId,
          Number(line.quantity),
          'IN',
          manager,
        );

        // Update batch quantities if applicable
        if (line.batchId) {
          const batch = await this.batchService.findOne(line.batchId);
          if (batch) {
            batch.quantity = Math.max(0, Number(batch.quantity) - Number(line.quantity));
            await this.batchService.update(line.batchId, { quantity: batch.quantity }, userId);
          }
        }
      }

      // 4. Update transfer status to POSTED
      transfer.status = 'POSTED';
      transfer.postedBy = userId || null;
      transfer.postedAt = new Date();
      transfer.updatedBy = userId || null;
      const saved = await manager.getRepository(StockTransfer).save(transfer);

      // 5. Record POSTED in history
      await this.recordHistory(
        saved.id,
        'POSTED',
        'APPROVED',
        'POSTED',
        userId,
        null,
        dto?.remarks || 'Stock transfer posted to inventory ledger and warehouse balances updated',
        manager,
      );

      return saved;
    });
  }

  /**
   * Delete transfer (only allowed in DRAFT or RETURNED status).
   */
  async delete(id: string, userId?: string, companyId?: string): Promise<{ success: boolean; message: string }> {
    const transfer = await this.findOne(id, companyId);

    if (transfer.status !== 'DRAFT' && transfer.status !== 'RETURNED') {
      throw new BadRequestException(
        `Cannot delete stock transfer in status '${transfer.status}'. Only DRAFT or RETURNED transfers can be deleted.`,
      );
    }

    await this.repo.remove(transfer);
    return { success: true, message: `Stock transfer '${transfer.transferCode}' deleted successfully.` };
  }

  /**
   * Live summary counts of transfers by status for tabs and badge indicators.
   */
  async getCounts(companyId?: string): Promise<{
    all: number;
    total: number;
    draft: number;
    pendingApproval: number;
    approved: number;
    returned: number;
    rejected: number;
    posted: number;
  }> {
    const qb = this.repo.createQueryBuilder('trf').select('trf.status', 'status').addSelect('COUNT(trf.id)', 'count');
    if (companyId) {
      qb.where('trf.companyId = :companyId', { companyId });
    }
    qb.groupBy('trf.status');
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
   * Get workflow history for a stock transfer.
   */
  async getHistory(id: string, companyId?: string): Promise<StockTransferHistory[]> {
    await this.findOne(id, companyId);
    return this.historyRepo.find({
      where: { transferId: id },
      relations: ['performedByUser'],
      order: { performedAt: 'ASC', createdAt: 'ASC' },
    });
  }

  /**
   * Get live stock impact for both source and destination warehouses.
   */
  async getLiveStockImpact(id: string, companyId?: string): Promise<any> {
    const transfer = await this.findOne(id, companyId);
    const line = transfer.lines?.[0];
    if (!line) {
      return {
        hasLine: false,
        source: { onHand: 0, available: 0, reserved: 0, projectedBalance: 0 },
        destination: { onHand: 0, available: 0, reserved: 0, projectedBalance: 0 },
        transferQuantity: 0,
      };
    }

    const [sourceBalance, destBalance] = await Promise.all([
      this.balanceService.findByItemWarehouse(
        transfer.companyId,
        line.itemId,
        transfer.fromWarehouseId,
        line.fromLocationId || undefined,
        line.batchId || undefined,
      ),
      this.balanceService.findByItemWarehouse(
        transfer.companyId,
        line.itemId,
        transfer.toWarehouseId,
        line.toLocationId || undefined,
        line.batchId || undefined,
      ),
    ]);

    const sourceOnHand = sourceBalance ? Number(sourceBalance.onHand) : 0;
    const sourceAvailable = sourceBalance ? Number(sourceBalance.available) : 0;
    const sourceReserved = sourceBalance ? Number(sourceBalance.reserved) : 0;

    const destOnHand = destBalance ? Number(destBalance.onHand) : 0;
    const destAvailable = destBalance ? Number(destBalance.available) : 0;
    const destReserved = destBalance ? Number(destBalance.reserved) : 0;

    const qty = Number(line.quantity);
    const sourceProjected = sourceOnHand - qty;
    const destProjected = destOnHand + qty;

    const policy = await this.policyRepo.findOne({
      where: {
        companyId: transfer.companyId,
        itemId: line.itemId,
        warehouseId: transfer.fromWarehouseId,
      },
    });
    const allowNegativeStock = Boolean(policy?.allowNegativeStock);

    return {
      hasLine: true,
      itemId: line.itemId,
      itemCode: line.item?.itemCode,
      itemName: line.item?.name,
      uomCode: line.uom?.code || line.uom?.symbol,
      transferQuantity: qty,
      source: {
        warehouseId: transfer.fromWarehouseId,
        warehouseName: transfer.fromWarehouse?.name,
        warehouseCode: transfer.fromWarehouse?.warehouseCode,
        onHand: sourceOnHand,
        available: sourceAvailable,
        reserved: sourceReserved,
        projectedBalance: sourceProjected,
        allowNegativeStock,
        isNegativeWarning: sourceProjected < 0 && !allowNegativeStock,
      },
      destination: {
        warehouseId: transfer.toWarehouseId,
        warehouseName: transfer.toWarehouse?.name,
        warehouseCode: transfer.toWarehouse?.warehouseCode,
        onHand: destOnHand,
        available: destAvailable,
        reserved: destReserved,
        projectedBalance: destProjected,
      },
    };
  }

  async addLine(transferId: string, dto: CreateStockTransferLineDto): Promise<StockTransferLine> {
    const transfer = await this.findOne(transferId);
    if (transfer.status !== 'DRAFT' && transfer.status !== 'RETURNED') {
      throw new BadRequestException('Can only add lines to transfers in DRAFT or RETURNED status');
    }

    const line = this.lineRepo.create({
      transferId,
      itemId: dto.itemId,
      fromLocationId: dto.fromLocationId || null,
      toLocationId: dto.toLocationId || null,
      batchId: dto.batchId || null,
      uomId: dto.uomId,
      quantity: dto.quantity,
      notes: dto.notes || null,
    });
    return this.lineRepo.save(line);
  }

  async removeLine(transferId: string, lineId: string): Promise<void> {
    const transfer = await this.findOne(transferId);
    if (transfer.status !== 'DRAFT' && transfer.status !== 'RETURNED') {
      throw new BadRequestException('Can only remove lines from transfers in DRAFT or RETURNED status');
    }

    const line = await this.lineRepo.findOne({ where: { id: lineId, transferId } });
    if (!line) throw new NotFoundException(`Line with ID '${lineId}' not found in this transfer`);

    await this.lineRepo.remove(line);
  }

  async cancel(id: string, userId?: string, companyId?: string): Promise<StockTransfer> {
    const transfer = await this.findOne(id, companyId);
    if (transfer.status !== 'DRAFT' && transfer.status !== 'PENDING_APPROVAL' && (transfer as any).status !== 'SUBMITTED') {
      throw new BadRequestException('Can only cancel transfers in DRAFT or PENDING_APPROVAL status');
    }

    const fromStatus = transfer.status;
    transfer.status = 'CANCELLED';
    transfer.updatedBy = userId || null;
    const saved = await this.repo.save(transfer);

    await this.recordHistory(
      saved.id,
      'CANCELLED',
      fromStatus,
      'CANCELLED',
      userId,
      null,
      'Stock transfer cancelled',
    );

    return saved;
  }
}
