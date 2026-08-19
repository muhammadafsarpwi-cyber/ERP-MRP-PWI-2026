import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { InventoryPolicy } from '../entities';
import { CreateInventoryPolicyDto, UpdateInventoryPolicyDto, InventoryPolicyFilterDto } from '../dto';

@Injectable()
export class InventoryPolicyService {
  private readonly logger = new Logger(InventoryPolicyService.name);

  constructor(
    @InjectRepository(InventoryPolicy)
    private readonly repo: Repository<InventoryPolicy>,
  ) {}

  async create(dto: CreateInventoryPolicyDto, userId?: string): Promise<InventoryPolicy> {
    const existing = await this.repo.findOne({
      where: { itemId: dto.itemId, warehouseId: dto.warehouseId, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(
        `Inventory policy already exists for this item in this warehouse`,
      );
    }

    const policy = this.repo.create({
      ...dto,
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.repo.save(policy);
  }

  async findAll(filter: InventoryPolicyFilterDto): Promise<{ data: InventoryPolicy[]; total: number }> {
    const {
      page = 1,
      limit = 20,
      search,
      companyId,
      warehouseId,
      itemId,
      status,
      trackingType,
      sortField = 'createdAt',
      sortOrder = 'DESC',
    } = filter;

    const qb = this.repo
      .createQueryBuilder('policy')
      .leftJoinAndSelect('policy.item', 'item')
      .leftJoinAndSelect('policy.warehouse', 'warehouse')
      .leftJoinAndSelect('policy.preferredLocation', 'preferredLocation');

    if (search) {
      qb.where(
        '(item.itemCode ILIKE :search OR item.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (companyId) {
      qb[search ? 'andWhere' : 'where']('policy.companyId = :companyId', { companyId });
    }
    if (warehouseId) qb.andWhere('policy.warehouseId = :warehouseId', { warehouseId });
    if (itemId) qb.andWhere('policy.itemId = :itemId', { itemId });
    if (status) qb.andWhere('policy.status = :status', { status });
    if (trackingType) qb.andWhere('policy.trackingType = :trackingType', { trackingType });

    const validSortFields = ['createdAt', 'trackingType', 'status'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`policy.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<InventoryPolicy> {
    const policy = await this.repo.findOne({
      where: { id },
      relations: ['item', 'warehouse', 'preferredLocation', 'company'],
    });
    if (!policy) throw new NotFoundException(`Inventory policy with ID '${id}' not found`);
    return policy;
  }

  async update(id: string, dto: UpdateInventoryPolicyDto, userId?: string): Promise<InventoryPolicy> {
    const policy = await this.findOne(id);

    if (dto.itemId && dto.warehouseId) {
      const existing = await this.repo.findOne({
        where: {
          itemId: dto.itemId,
          warehouseId: dto.warehouseId,
          companyId: policy.companyId,
          id: Not(id),
        },
      });
      if (existing) {
        throw new ConflictException(
          `Inventory policy already exists for this item in this warehouse`,
        );
      }
    } else if (dto.itemId && dto.itemId !== policy.itemId) {
      const existing = await this.repo.findOne({
        where: {
          itemId: dto.itemId,
          warehouseId: policy.warehouseId,
          companyId: policy.companyId,
          id: Not(id),
        },
      });
      if (existing) {
        throw new ConflictException(
          `Inventory policy already exists for this item in this warehouse`,
        );
      }
    } else if (dto.warehouseId && dto.warehouseId !== policy.warehouseId) {
      const existing = await this.repo.findOne({
        where: {
          itemId: policy.itemId,
          warehouseId: dto.warehouseId,
          companyId: policy.companyId,
          id: Not(id),
        },
      });
      if (existing) {
        throw new ConflictException(
          `Inventory policy already exists for this item in this warehouse`,
        );
      }
    }

    Object.assign(policy, dto, { updatedBy: userId || null });
    return this.repo.save(policy);
  }

  async activate(id: string, userId?: string): Promise<InventoryPolicy> {
    const policy = await this.findOne(id);
    if (policy.status === 'ACTIVE') {
      throw new BadRequestException('Inventory policy is already active');
    }
    policy.status = 'ACTIVE';
    policy.updatedBy = userId || null;
    return this.repo.save(policy);
  }

  async deactivate(id: string, userId?: string): Promise<InventoryPolicy> {
    const policy = await this.findOne(id);
    if (policy.status === 'INACTIVE') {
      throw new BadRequestException('Inventory policy is already inactive');
    }
    policy.status = 'INACTIVE';
    policy.updatedBy = userId || null;
    return this.repo.save(policy);
  }
}
