import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { ItemRouteType, RouteTypeStatus } from '../entities/route-type.entity';
import { CreateRouteTypeDto, UpdateRouteTypeDto } from '../dto/item-route-type.dto';

@Injectable()
export class ItemRouteTypeService {
  constructor(
    @InjectRepository(ItemRouteType)
    private readonly repo: Repository<ItemRouteType>,
  ) {}

  async create(dto: CreateRouteTypeDto, userId?: string): Promise<ItemRouteType> {
    const existing = await this.repo.findOne({
      where: { routeCode: dto.routeCode, companyId: dto.companyId },
    });
    if (existing) throw new ConflictException(`Route type '${dto.routeCode}' already exists in this company`);
    const rt = this.repo.create({ ...dto, createdBy: userId || null, updatedBy: userId || null });
    return this.repo.save(rt);
  }

  async findAll(options?: { page?: number; limit?: number; search?: string; companyId?: string; status?: RouteTypeStatus }): Promise<{ data: ItemRouteType[]; total: number }> {
    const { page = 1, limit = 20, search, companyId, status } = options || {};
    const qb = this.repo.createQueryBuilder('rt');
    if (search) qb.where('(rt.name ILIKE :search OR rt.routeCode ILIKE :search)', { search: `%${search}%` });
    if (companyId) qb.andWhere('rt.companyId = :companyId', { companyId });
    if (status) qb.andWhere('rt.status = :status', { status });
    qb.orderBy('rt.routeCode', 'ASC');
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<ItemRouteType> {
    const rt = await this.repo.findOne({ where: { id }, relations: ['company'] });
    if (!rt) throw new NotFoundException(`Route type with ID '${id}' not found`);
    return rt;
  }

  async update(id: string, dto: UpdateRouteTypeDto, userId?: string): Promise<ItemRouteType> {
    const rt = await this.findOne(id);
    if (dto.routeCode && dto.routeCode !== rt.routeCode) {
      const existing = await this.repo.findOne({ where: { routeCode: dto.routeCode, companyId: rt.companyId, id: Not(id) } });
      if (existing) throw new ConflictException(`Route code '${dto.routeCode}' already exists in this company`);
    }
    Object.assign(rt, dto, { updatedBy: userId || null });
    return this.repo.save(rt);
  }

  async activate(id: string, userId?: string): Promise<ItemRouteType> {
    const rt = await this.findOne(id);
    if (rt.status === RouteTypeStatus.ACTIVE) throw new BadRequestException('Already active');
    rt.status = RouteTypeStatus.ACTIVE;
    rt.updatedBy = userId || null;
    return this.repo.save(rt);
  }

  async deactivate(id: string, userId?: string): Promise<ItemRouteType> {
    const rt = await this.findOne(id);
    if (rt.status === RouteTypeStatus.INACTIVE) throw new BadRequestException('Already inactive');
    rt.status = RouteTypeStatus.INACTIVE;
    rt.updatedBy = userId || null;
    return this.repo.save(rt);
  }
}