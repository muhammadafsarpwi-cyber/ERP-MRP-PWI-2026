import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockLedger } from '../entities';

@Injectable()
export class StockLedgerService {
  private readonly logger = new Logger(StockLedgerService.name);

  constructor(
    @InjectRepository(StockLedger)
    private readonly repo: Repository<StockLedger>,
  ) {}

  async create(data: {
    companyId: string;
    transactionType: string;
    transactionDate?: Date;
    itemId: string;
    warehouseId: string;
    locationId?: string;
    quantity: number;
    uomId: string;
    direction: string;
    referenceType?: string;
    referenceId?: string;
    referenceNumber?: string;
    batchId?: string;
    serialNumber?: string;
    notes?: string;
    createdBy?: string;
  }): Promise<StockLedger> {
    const entry = this.repo.create({
      companyId: data.companyId,
      transactionType: data.transactionType,
      transactionDate: data.transactionDate || new Date(),
      itemId: data.itemId,
      warehouseId: data.warehouseId,
      locationId: data.locationId || null,
      quantity: data.quantity,
      uomId: data.uomId,
      direction: data.direction,
      referenceType: data.referenceType || null,
      referenceId: data.referenceId || null,
      referenceNumber: data.referenceNumber || null,
      batchId: data.batchId || null,
      serialNumber: data.serialNumber || null,
      notes: data.notes || null,
      createdBy: data.createdBy || null,
    });
    return this.repo.save(entry);
  }

  async findAll(filter: {
    page?: number;
    limit?: number;
    companyId?: string;
    itemId?: string;
    warehouseId?: string;
    transactionType?: string;
    direction?: string;
    transactionDateFrom?: Date;
    transactionDateTo?: Date;
    batchId?: string;
  }): Promise<{ data: StockLedger[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      companyId,
      itemId,
      warehouseId,
      transactionType,
      direction,
      transactionDateFrom,
      transactionDateTo,
      batchId,
    } = filter;

    const qb = this.repo
      .createQueryBuilder('ledger')
      .leftJoinAndSelect('ledger.item', 'item')
      .leftJoinAndSelect('ledger.warehouse', 'warehouse')
      .leftJoinAndSelect('ledger.location', 'location')
      .leftJoinAndSelect('ledger.uom', 'uom')
      .leftJoinAndSelect('ledger.batch', 'batch');

    const conditions: string[] = [];
    const params: Record<string, any> = {};

    if (companyId) {
      conditions.push('ledger.companyId = :companyId');
      params.companyId = companyId;
    }
    if (itemId) {
      conditions.push('ledger.itemId = :itemId');
      params.itemId = itemId;
    }
    if (warehouseId) {
      conditions.push('ledger.warehouseId = :warehouseId');
      params.warehouseId = warehouseId;
    }
    if (transactionType) {
      conditions.push('ledger.transactionType = :transactionType');
      params.transactionType = transactionType;
    }
    if (direction) {
      conditions.push('ledger.direction = :direction');
      params.direction = direction;
    }
    if (transactionDateFrom) {
      conditions.push('ledger.transactionDate >= :transactionDateFrom');
      params.transactionDateFrom = transactionDateFrom;
    }
    if (transactionDateTo) {
      conditions.push('ledger.transactionDate <= :transactionDateTo');
      params.transactionDateTo = transactionDateTo;
    }
    if (batchId) {
      conditions.push('ledger.batchId = :batchId');
      params.batchId = batchId;
    }

    if (conditions.length > 0) {
      qb.where(conditions.join(' AND '), params);
    }

    qb.orderBy('ledger.transactionDate', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<StockLedger> {
    const entry = await this.repo.findOne({
      where: { id },
      relations: ['item', 'warehouse', 'location', 'uom', 'batch'],
    });
    if (!entry) throw new NotFoundException(`Stock ledger entry with ID '${id}' not found`);
    return entry;
  }

  async getBalance(
    companyId: string,
    itemId: string,
    warehouseId: string,
    locationId?: string,
    batchId?: string,
  ): Promise<number> {
    const qb = this.repo.createQueryBuilder('ledger');

    qb.select('COALESCE(SUM(CASE WHEN ledger.direction = \'IN\' THEN ledger.quantity ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN ledger.direction = \'OUT\' THEN ledger.quantity ELSE 0 END), 0)', 'balance');

    qb.where('ledger.companyId = :companyId', { companyId });
    qb.andWhere('ledger.itemId = :itemId', { itemId });
    qb.andWhere('ledger.warehouseId = :warehouseId', { warehouseId });
    if (locationId) qb.andWhere('ledger.locationId = :locationId', { locationId });
    if (batchId) qb.andWhere('ledger.batchId = :batchId', { batchId });

    const result = await qb.getRawOne();
    return Number(result?.balance || 0);
  }

  async getStockSummary(
    companyId?: string,
    warehouseId?: string,
  ): Promise<any[]> {
    if (!companyId) return [];
    const qb = this.repo
      .createQueryBuilder('ledger')
      .leftJoin('ledger.item', 'item')
      .select([
        'ledger.itemId AS "itemId"',
        'item.itemCode AS "itemCode"',
        'itemName.itemName AS "itemName"',
        'COALESCE(SUM(CASE WHEN ledger.direction = \'IN\' THEN ledger.quantity ELSE 0 END), 0) AS "totalIn"',
        'COALESCE(SUM(CASE WHEN ledger.direction = \'OUT\' THEN ledger.quantity ELSE 0 END), 0) AS "totalOut"',
      ])
      .groupBy('ledger.itemId')
      .addGroupBy('item.itemCode');

    qb.where('ledger.companyId = :companyId', { companyId });
    if (warehouseId) {
      qb.andWhere('ledger.warehouseId = :warehouseId', { warehouseId });
    }

    return qb.getRawMany();
  }

  async getByTransactionType(
    companyId: string,
    transactionType: string,
    filter: { page?: number; limit?: number } = {},
  ): Promise<{ data: StockLedger[]; total: number }> {
    const { page = 1, limit = 20 } = filter;

    const qb = this.repo
      .createQueryBuilder('ledger')
      .leftJoinAndSelect('ledger.item', 'item')
      .leftJoinAndSelect('ledger.warehouse', 'warehouse')
      .leftJoinAndSelect('ledger.location', 'location')
      .leftJoinAndSelect('ledger.uom', 'uom')
      .leftJoinAndSelect('ledger.batch', 'batch')
      .where('ledger.companyId = :companyId', { companyId })
      .andWhere('ledger.transactionType = :transactionType', { transactionType })
      .orderBy('ledger.transactionDate', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
