import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SerialNumber } from '../entities';
import { CreateSerialNumberDto, SerialNumberFilterDto } from '../dto';

@Injectable()
export class SerialNumberService {
  private readonly logger = new Logger(SerialNumberService.name);

  constructor(
    @InjectRepository(SerialNumber)
    private readonly repo: Repository<SerialNumber>,
  ) {}

  async create(dto: CreateSerialNumberDto, userId?: string): Promise<SerialNumber> {
    const existing = await this.repo.findOne({
      where: { companyId: dto.companyId, itemId: dto.itemId, serialNumber: dto.serialNumber },
    });
    if (existing) {
      throw new ConflictException(
        `Serial number '${dto.serialNumber}' already exists for this item in this company`,
      );
    }

    const serial = this.repo.create({
      companyId: dto.companyId,
      itemId: dto.itemId,
      warehouseId: dto.warehouseId,
      locationId: dto.locationId || null,
      serialNumber: dto.serialNumber,
      batchId: dto.batchId || null,
      status: dto.status || 'IN_STOCK',
      referenceType: dto.referenceType || null,
      referenceId: dto.referenceId || null,
      notes: dto.notes || null,
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.repo.save(serial);
  }

  async findAll(filter: SerialNumberFilterDto): Promise<{ data: SerialNumber[]; total: number }> {
    const { page = 1, limit = 20, companyId, itemId, warehouseId, status, search } = filter;

    const qb = this.repo
      .createQueryBuilder('sn')
      .leftJoinAndSelect('sn.item', 'item')
      .leftJoinAndSelect('sn.warehouse', 'warehouse')
      .leftJoinAndSelect('sn.location', 'location')
      .leftJoinAndSelect('sn.batch', 'batch');

    if (companyId) qb.where('sn.companyId = :companyId', { companyId });
    if (itemId) qb[companyId ? 'andWhere' : 'where']('sn.itemId = :itemId', { itemId });
    if (warehouseId) qb[companyId || itemId ? 'andWhere' : 'where']('sn.warehouseId = :warehouseId', { warehouseId });
    if (status) qb.andWhere('sn.status = :status', { status });
    if (search) qb.andWhere('sn.serialNumber ILIKE :search', { search: `%${search}%` });

    qb.orderBy('sn.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<SerialNumber> {
    const serial = await this.repo.findOne({
      where: { id },
      relations: ['item', 'warehouse', 'location', 'batch', 'company'],
    });
    if (!serial) throw new NotFoundException(`Serial number with ID '${id}' not found`);
    return serial;
  }

  async updateStatus(id: string, status: string, userId?: string): Promise<SerialNumber> {
    const serial = await this.findOne(id);
    const validStatuses = ['IN_STOCK', 'ALLOCATED', 'SOLD', 'SCRAPPED'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    serial.status = status;
    serial.updatedBy = userId || null;
    return this.repo.save(serial);
  }

  async deactivate(id: string): Promise<SerialNumber> {
    const serial = await this.findOne(id);
    serial.isActive = false;
    return this.repo.save(serial);
  }
}
