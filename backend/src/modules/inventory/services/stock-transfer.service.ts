import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  StockTransfer,
  StockTransferLine,
} from '../entities';
import { CreateStockTransferDto, CreateStockTransferLineDto, StockTransferFilterDto } from '../dto';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryBalanceService } from './inventory-balance.service';

@Injectable()
export class StockTransferService {
  private readonly logger = new Logger(StockTransferService.name);

  constructor(
    @InjectRepository(StockTransfer)
    private readonly repo: Repository<StockTransfer>,
    @InjectRepository(StockTransferLine)
    private readonly lineRepo: Repository<StockTransferLine>,
    private readonly ledgerService: StockLedgerService,
    private readonly balanceService: InventoryBalanceService,
  ) {}

  async create(dto: CreateStockTransferDto, userId?: string): Promise<StockTransfer> {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException(`Source and destination warehouses must be different`);
    }

    const existing = await this.repo.findOne({
      where: { transferCode: dto.transferCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(
        `Transfer code '${dto.transferCode}' already exists in this company`,
      );
    }

    const transfer = this.repo.create({
      ...dto,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.repo.save(transfer);
  }

  async findAll(filter: StockTransferFilterDto): Promise<{ data: StockTransfer[]; total: number }> {
    const {
      page = 1,
      limit = 20,
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
      .leftJoinAndSelect('transfer.toWarehouse', 'toWarehouse');

    if (companyId) qb.where('transfer.companyId = :companyId', { companyId });
    if (fromWarehouseId) qb[companyId ? 'andWhere' : 'where']('transfer.fromWarehouseId = :fromWarehouseId', { fromWarehouseId });
    if (toWarehouseId) qb[companyId || fromWarehouseId ? 'andWhere' : 'where']('transfer.toWarehouseId = :toWarehouseId', { toWarehouseId });
    if (status) qb.andWhere('transfer.status = :status', { status });

    const validSortFields = ['createdAt', 'transferCode', 'status'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`transfer.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<StockTransfer> {
    const transfer = await this.repo.findOne({
      where: { id },
      relations: [
        'fromWarehouse',
        'toWarehouse',
        'fromLocation',
        'toLocation',
        'lines',
        'lines.item',
        'lines.uom',
        'lines.fromLocation',
        'lines.toLocation',
        'lines.batch',
      ],
    });
    if (!transfer) throw new NotFoundException(`Stock transfer with ID '${id}' not found`);
    return transfer;
  }

  async addLine(transferId: string, dto: CreateStockTransferLineDto): Promise<StockTransferLine> {
    const transfer = await this.findOne(transferId);
    if (transfer.status !== 'DRAFT') {
      throw new BadRequestException(`Can only add lines to transfers in DRAFT status`);
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
    if (transfer.status !== 'DRAFT') {
      throw new BadRequestException(`Can only remove lines from transfers in DRAFT status`);
    }

    const line = await this.lineRepo.findOne({ where: { id: lineId, transferId } });
    if (!line) throw new NotFoundException(`Line with ID '${lineId}' not found in this transfer`);

    await this.lineRepo.remove(line);
  }

  async submit(id: string, userId?: string): Promise<StockTransfer> {
    const transfer = await this.findOne(id);
    if (transfer.status !== 'DRAFT') {
      throw new BadRequestException(`Can only submit transfers in DRAFT status`);
    }

    transfer.status = 'SUBMITTED';
    transfer.updatedBy = userId || null;
    return this.repo.save(transfer);
  }

  async approve(id: string, userId?: string): Promise<StockTransfer> {
    const transfer = await this.findOne(id);
    if (transfer.status !== 'SUBMITTED') {
      throw new BadRequestException(`Can only approve transfers in SUBMITTED status`);
    }

    transfer.status = 'APPROVED';
    transfer.approvedBy = userId || null;
    transfer.approvedAt = new Date();
    transfer.updatedBy = userId || null;
    return this.repo.save(transfer);
  }

  async cancel(id: string, userId?: string): Promise<StockTransfer> {
    const transfer = await this.findOne(id);
    if (transfer.status !== 'DRAFT' && transfer.status !== 'SUBMITTED') {
      throw new BadRequestException(`Can only cancel transfers in DRAFT or SUBMITTED status`);
    }

    transfer.status = 'CANCELLED';
    transfer.updatedBy = userId || null;
    return this.repo.save(transfer);
  }

  async post(id: string, userId?: string): Promise<StockTransfer> {
    const transfer = await this.findOne(id);
    if (transfer.status !== 'APPROVED') {
      throw new BadRequestException(`Can only post transfers in APPROVED status`);
    }

    if (!transfer.lines || transfer.lines.length === 0) {
      throw new BadRequestException(`Cannot post transfer with no lines`);
    }

    for (const line of transfer.lines) {
      await this.ledgerService.create({
        companyId: transfer.companyId,
        transactionType: 'TRANSFER_OUT',
        itemId: line.itemId,
        warehouseId: transfer.fromWarehouseId,
        locationId: line.fromLocationId || transfer.fromLocationId || undefined,
        quantity: line.quantity,
        uomId: line.uomId,
        direction: 'OUT',
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
        referenceNumber: transfer.transferCode,
        batchId: line.batchId || undefined,
        createdBy: userId,
      });

      await this.ledgerService.create({
        companyId: transfer.companyId,
        transactionType: 'TRANSFER_IN',
        itemId: line.itemId,
        warehouseId: transfer.toWarehouseId,
        locationId: line.toLocationId || transfer.toLocationId || undefined,
        quantity: line.quantity,
        uomId: line.uomId,
        direction: 'IN',
        referenceType: 'TRANSFER',
        referenceId: transfer.id,
        referenceNumber: transfer.transferCode,
        batchId: line.batchId || undefined,
        createdBy: userId,
      });

      await this.balanceService.updateBalance(
        transfer.companyId,
        line.itemId,
        transfer.fromWarehouseId,
        line.fromLocationId || transfer.fromLocationId,
        line.batchId,
        line.uomId,
        line.quantity,
        'OUT',
      );

      await this.balanceService.updateBalance(
        transfer.companyId,
        line.itemId,
        transfer.toWarehouseId,
        line.toLocationId || transfer.toLocationId,
        line.batchId,
        line.uomId,
        line.quantity,
        'IN',
      );
    }

    transfer.status = 'POSTED';
    transfer.postedBy = userId || null;
    transfer.postedAt = new Date();
    transfer.updatedBy = userId || null;
    return this.repo.save(transfer);
  }
}
