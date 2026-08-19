import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Batch } from '../entities';
import { CreateBatchDto, UpdateBatchDto, BatchFilterDto } from '../dto';

@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  constructor(
    @InjectRepository(Batch)
    private readonly repo: Repository<Batch>,
  ) {}

  async create(dto: CreateBatchDto, userId?: string): Promise<Batch> {
    const existing = await this.repo.findOne({
      where: {
        batchNumber: dto.batchNumber,
        itemId: dto.itemId,
        companyId: dto.companyId,
      },
    });
    if (existing) {
      throw new ConflictException(
        `Batch '${dto.batchNumber}' already exists for this item in this company`,
      );
    }

    const batch = this.repo.create({
      ...dto,
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.repo.save(batch);
  }

  async findAll(filter: BatchFilterDto): Promise<{ data: Batch[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      search,
      companyId,
      itemId,
      warehouseId,
      status,
      sortField = 'createdAt',
      sortOrder = 'DESC',
    } = filter;

    const qb = this.repo
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.item', 'item')
      .leftJoinAndSelect('batch.warehouse', 'warehouse')
      .leftJoinAndSelect('batch.location', 'location');

    if (search) {
      qb.where(
        '(batch.batchNumber ILIKE :search OR batch.supplierReference ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (companyId) {
      qb[search ? 'andWhere' : 'where']('batch.companyId = :companyId', { companyId });
    }
    if (itemId) qb.andWhere('batch.itemId = :itemId', { itemId });
    if (warehouseId) qb.andWhere('batch.warehouseId = :warehouseId', { warehouseId });
    if (status) qb.andWhere('batch.status = :status', { status });

    const validSortFields = ['createdAt', 'batchNumber', 'quantity', 'expiryDate'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`batch.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<Batch> {
    const batch = await this.repo.findOne({
      where: { id },
      relations: ['item', 'warehouse', 'location', 'company'],
    });
    if (!batch) throw new NotFoundException(`Batch with ID '${id}' not found`);
    return batch;
  }

  async update(id: string, dto: UpdateBatchDto, userId?: string): Promise<Batch> {
    const batch = await this.findOne(id);

    if (dto.batchNumber && dto.batchNumber !== batch.batchNumber) {
      const existing = await this.repo.findOne({
        where: {
          batchNumber: dto.batchNumber,
          itemId: batch.itemId,
          companyId: batch.companyId,
          id: Not(id),
        },
      });
      if (existing) {
        throw new ConflictException(
          `Batch '${dto.batchNumber}' already exists for this item in this company`,
        );
      }
    }

    Object.assign(batch, dto, { updatedBy: userId || null });
    return this.repo.save(batch);
  }

  async findByItemAndWarehouse(
    companyId: string,
    itemId: string,
    warehouseId: string,
  ): Promise<Batch[]> {
    return this.repo.find({
      where: { companyId, itemId, warehouseId, status: 'ACTIVE' },
      order: { createdAt: 'DESC' },
    });
  }

  async activate(id: string, userId?: string): Promise<Batch> {
    const batch = await this.findOne(id);
    if (batch.status === 'ACTIVE') {
      throw new BadRequestException('Batch is already active');
    }
    batch.status = 'ACTIVE';
    batch.updatedBy = userId || null;
    return this.repo.save(batch);
  }

  async deactivate(id: string, userId?: string): Promise<Batch> {
    const batch = await this.findOne(id);
    if (batch.status === 'CLOSED') {
      throw new BadRequestException('Batch is already closed');
    }
    batch.status = 'CLOSED';
    batch.updatedBy = userId || null;
    return this.repo.save(batch);
  }
}
