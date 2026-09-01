import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { InventoryBalance, InventoryPolicy } from '../entities';

@Injectable()
export class InventoryBalanceService {
  private readonly logger = new Logger(InventoryBalanceService.name);

  constructor(
    @InjectRepository(InventoryBalance)
    private readonly repo: Repository<InventoryBalance>,
    @InjectRepository(InventoryPolicy)
    private readonly policyRepo: Repository<InventoryPolicy>,
  ) {}

  async findByItemWarehouse(
    companyId: string,
    itemId: string,
    warehouseId: string,
    locationId?: string,
    batchId?: string,
    manager?: EntityManager,
  ): Promise<InventoryBalance | null> {
    const repo = manager ? manager.getRepository(InventoryBalance) : this.repo;
    const where: Record<string, any> = { companyId, itemId, warehouseId };
    if (locationId) where.locationId = locationId;
    if (batchId) where.batchId = batchId;
    return repo.findOne({ where, relations: ['item', 'warehouse', 'location', 'batch', 'uom'] });
  }

  async findAll(filter: {
    page?: number;
    limit?: number;
    companyId?: string;
    itemId?: string;
    warehouseId?: string;
  }): Promise<{ data: InventoryBalance[]; total: number }> {
    const { page = 1, limit = 20, companyId, itemId, warehouseId } = filter;

    const qb = this.repo
      .createQueryBuilder('balance')
      .leftJoinAndSelect('balance.item', 'item')
      .leftJoinAndSelect('balance.warehouse', 'warehouse')
      .leftJoinAndSelect('balance.location', 'location')
      .leftJoinAndSelect('balance.batch', 'batch')
      .leftJoinAndSelect('balance.uom', 'uom');

    if (companyId) qb.where('balance.companyId = :companyId', { companyId });
    if (itemId) qb[companyId ? 'andWhere' : 'where']('balance.itemId = :itemId', { itemId });
    if (warehouseId) {
      qb[companyId || itemId ? 'andWhere' : 'where']('balance.warehouseId = :warehouseId', { warehouseId });
    }

    qb.orderBy('balance.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<InventoryBalance> {
    const balance = await this.repo.findOne({
      where: { id },
      relations: ['item', 'warehouse', 'location', 'batch', 'uom', 'company'],
    });
    if (!balance) throw new NotFoundException(`Inventory balance with ID '${id}' not found`);
    return balance;
  }

  async getAvailableStock(
    companyId?: string,
    itemId?: string,
    warehouseId?: string,
    locationId?: string,
    batchId?: string,
    manager?: EntityManager,
  ): Promise<number> {
    if (!companyId || !itemId || !warehouseId) return 0;
    const balance = await this.findByItemWarehouse(companyId, itemId, warehouseId, locationId, batchId, manager);
    if (!balance) return 0;
    return Number(balance.onHand) - Number(balance.reserved);
  }

  async updateBalance(
    companyId: string,
    itemId: string,
    warehouseId: string,
    locationId: string | null,
    batchId: string | null,
    uomId: string,
    quantityChange: number,
    direction: 'IN' | 'OUT',
    manager?: EntityManager,
  ): Promise<InventoryBalance> {
    const repo = manager ? manager.getRepository(InventoryBalance) : this.repo;
    const policyRepo = manager ? manager.getRepository(InventoryPolicy) : this.policyRepo;
    let balance = await this.findByItemWarehouse(companyId, itemId, warehouseId, locationId || undefined, batchId || undefined, manager);

    if (!balance) {
      balance = repo.create({
        companyId,
        itemId,
        warehouseId,
        locationId: locationId || null,
        batchId: batchId || null,
        uomId,
        onHand: 0,
        reserved: 0,
        available: 0,
        status: 'ACTIVE',
      });
    }

    if (direction === 'IN') {
      balance.onHand = Number(balance.onHand) + quantityChange;
      balance.available = Number(balance.available) + quantityChange;
    } else {
      const newOnHand = Number(balance.onHand) - quantityChange;
      const newAvailable = Number(balance.available) - quantityChange;

      if (newOnHand < 0) {
        const policy = await policyRepo.findOne({
          where: { companyId, itemId, warehouseId },
        });
        if (!policy || !policy.allowNegativeStock) {
          throw new BadRequestException(
            `Insufficient stock. Available: ${balance.onHand}, requested: ${quantityChange}`,
          );
        }
      }

      balance.onHand = newOnHand;
      balance.available = newAvailable;
    }

    return repo.save(balance);
  }

  async reserveStock(
    companyId: string,
    itemId: string,
    warehouseId: string,
    locationId: string | null,
    batchId: string | null,
    uomId: string,
    quantity: number,
  ): Promise<InventoryBalance> {
    const balance = await this.findByItemWarehouse(companyId, itemId, warehouseId, locationId || undefined, batchId || undefined);
    if (!balance) {
      throw new BadRequestException(`No inventory balance found for this item in this warehouse`);
    }

    if (Number(balance.available) < quantity) {
      throw new BadRequestException(
        `Insufficient available stock. Available: ${balance.available}, requested: ${quantity}`,
      );
    }

    balance.reserved = Number(balance.reserved) + quantity;
    balance.available = Number(balance.available) - quantity;
    return this.repo.save(balance);
  }

  async releaseReservation(
    companyId: string,
    itemId: string,
    warehouseId: string,
    locationId: string | null,
    batchId: string | null,
    uomId: string,
    quantity: number,
  ): Promise<InventoryBalance> {
    const balance = await this.findByItemWarehouse(companyId, itemId, warehouseId, locationId || undefined, batchId || undefined);
    if (!balance) {
      throw new BadRequestException(`No inventory balance found for this item in this warehouse`);
    }

    balance.reserved = Number(balance.reserved) - quantity;
    balance.available = Number(balance.available) + quantity;
    return this.repo.save(balance);
  }
}
