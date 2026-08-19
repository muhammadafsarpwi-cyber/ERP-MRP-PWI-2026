import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryReservation } from '../entities';
import { CreateInventoryReservationDto, InventoryReservationFilterDto } from '../dto';
import { InventoryBalanceService } from './inventory-balance.service';

@Injectable()
export class InventoryReservationService {
  private readonly logger = new Logger(InventoryReservationService.name);

  constructor(
    @InjectRepository(InventoryReservation)
    private readonly repo: Repository<InventoryReservation>,
    private readonly balanceService: InventoryBalanceService,
  ) {}

  async create(dto: CreateInventoryReservationDto, userId?: string): Promise<InventoryReservation> {
    const availableStock = await this.balanceService.getAvailableStock(
      dto.companyId,
      dto.itemId,
      dto.warehouseId,
      dto.locationId,
      dto.batchId,
    );

    if (availableStock < dto.quantity) {
      throw new BadRequestException(
        `Insufficient available stock. Available: ${availableStock}, requested: ${dto.quantity}`,
      );
    }

    const reservation = this.repo.create({
      companyId: dto.companyId,
      itemId: dto.itemId,
      warehouseId: dto.warehouseId,
      locationId: dto.locationId || null,
      batchId: dto.batchId || null,
      uomId: dto.uomId,
      quantity: dto.quantity,
      reservedBy: userId || null,
      reservationType: dto.reservationType || 'MANUAL',
      referenceType: dto.referenceType || null,
      referenceId: dto.referenceId || null,
      status: 'ACTIVE',
      expiresAt: dto.expiresAt || null,
      createdBy: userId || null,
      updatedBy: userId || null,
    });

    const saved = await this.repo.save(reservation);

    await this.balanceService.reserveStock(
      dto.companyId,
      dto.itemId,
      dto.warehouseId,
      dto.locationId || null,
      dto.batchId || null,
      dto.uomId,
      dto.quantity,
    );

    return saved;
  }

  async findAll(filter: InventoryReservationFilterDto): Promise<{ data: InventoryReservation[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      companyId,
      itemId,
      warehouseId,
      status,
      reservationType,
      sortField = 'createdAt',
      sortOrder = 'DESC',
    } = filter;

    const qb = this.repo
      .createQueryBuilder('res')
      .leftJoinAndSelect('res.item', 'item')
      .leftJoinAndSelect('res.warehouse', 'warehouse')
      .leftJoinAndSelect('res.uom', 'uom');

    if (companyId) qb.where('res.companyId = :companyId', { companyId });
    if (itemId) qb[companyId ? 'andWhere' : 'where']('res.itemId = :itemId', { itemId });
    if (warehouseId) qb[companyId || itemId ? 'andWhere' : 'where']('res.warehouseId = :warehouseId', { warehouseId });
    if (status) qb.andWhere('res.status = :status', { status });
    if (reservationType) qb.andWhere('res.reservationType = :reservationType', { reservationType });

    const validSortFields = ['createdAt', 'quantity', 'status', 'reservationType'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`res.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<InventoryReservation> {
    const reservation = await this.repo.findOne({
      where: { id },
      relations: ['item', 'warehouse', 'uom', 'location', 'batch', 'company'],
    });
    if (!reservation) throw new NotFoundException(`Inventory reservation with ID '${id}' not found`);
    return reservation;
  }

  async release(id: string, userId?: string): Promise<InventoryReservation> {
    const reservation = await this.findOne(id);
    if (reservation.status !== 'ACTIVE') {
      throw new BadRequestException(`Can only release reservations in ACTIVE status`);
    }

    reservation.status = 'CANCELLED';
    reservation.updatedBy = userId || null;
    await this.repo.save(reservation);

    await this.balanceService.releaseReservation(
      reservation.companyId,
      reservation.itemId,
      reservation.warehouseId,
      reservation.locationId,
      reservation.batchId,
      reservation.uomId,
      reservation.quantity,
    );

    return reservation;
  }

  async cancel(id: string, userId?: string): Promise<InventoryReservation> {
    const reservation = await this.findOne(id);
    if (reservation.status !== 'ACTIVE') {
      throw new BadRequestException(`Can only cancel reservations in ACTIVE status`);
    }

    reservation.status = 'CANCELLED';
    reservation.updatedBy = userId || null;
    await this.repo.save(reservation);

    await this.balanceService.releaseReservation(
      reservation.companyId,
      reservation.itemId,
      reservation.warehouseId,
      reservation.locationId,
      reservation.batchId,
      reservation.uomId,
      reservation.quantity,
    );

    return reservation;
  }
}
