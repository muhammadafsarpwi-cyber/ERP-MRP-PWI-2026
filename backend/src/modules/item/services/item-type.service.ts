import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemTypeMaster, ItemTypeStatus } from '../entities/item-type.entity';
import { CreateItemTypeDto, UpdateItemTypeDto } from '../dto/item-type.dto';

@Injectable()
export class ItemTypeService {
  constructor(
    @InjectRepository(ItemTypeMaster)
    private readonly repo: Repository<ItemTypeMaster>,
  ) {}

  async create(dto: CreateItemTypeDto, userId?: string): Promise<ItemTypeMaster> {
    const existing = await this.repo.findOne({
      where: { code: dto.code, companyId: dto.companyId },
    });
    if (existing) throw new ConflictException(`Item type '${dto.code}' already exists in this company`);
    const itemType = this.repo.create({ ...dto, createdBy: userId || null, updatedBy: userId || null });
    return this.repo.save(itemType);
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    companyId?: string;
    status?: ItemTypeStatus;
  }): Promise<{ data: ItemTypeMaster[]; total: number }> {
    const { page = 1, limit = 20, search, companyId, status } = options || {};
    const qb = this.repo.createQueryBuilder('it');
    if (search) qb.where('(it.name ILIKE :search OR it.code ILIKE :search)', { search: `%${search}%` });
    if (companyId) qb.andWhere('it.companyId = :companyId', { companyId });
    if (status) qb.andWhere('it.status = :status', { status });
    qb.loadRelationCountAndMap('it.usageCount', 'it.items');
    qb.orderBy('it.sortOrder', 'ASC').addOrderBy('it.code', 'ASC');
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<ItemTypeMaster> {
    const qb = this.repo.createQueryBuilder('it')
      .leftJoinAndSelect('it.company', 'company')
      .loadRelationCountAndMap('it.usageCount', 'it.items')
      .where('it.id = :id', { id });
    const itemType = await qb.getOne();
    if (!itemType) throw new NotFoundException(`Item type with ID '${id}' not found`);
    return itemType;
  }

  async update(id: string, dto: UpdateItemTypeDto, userId?: string): Promise<ItemTypeMaster> {
    const itemType = await this.findOne(id);
    if (dto.code && dto.code !== itemType.code) {
      throw new BadRequestException(`Item type code '${itemType.code}' is immutable and cannot be changed`);
    }
    Object.assign(itemType, dto, { updatedBy: userId || null });
    return this.repo.save(itemType);
  }

  async activate(id: string, userId?: string): Promise<ItemTypeMaster> {
    const itemType = await this.findOne(id);
    if (itemType.status === ItemTypeStatus.ACTIVE) throw new BadRequestException('Already active');
    itemType.status = ItemTypeStatus.ACTIVE;
    itemType.updatedBy = userId || null;
    return this.repo.save(itemType);
  }

  async deactivate(id: string, userId?: string): Promise<ItemTypeMaster> {
    const itemType = await this.findOne(id);
    if (itemType.status === ItemTypeStatus.INACTIVE) throw new BadRequestException('Already inactive');
    itemType.status = ItemTypeStatus.INACTIVE;
    itemType.updatedBy = userId || null;
    return this.repo.save(itemType);
  }
}