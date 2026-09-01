import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { ItemCategory, ItemCategoryStatus } from '../entities';
import { CreateItemCategoryDto, UpdateItemCategoryDto } from '../dto/item-category.dto';

@Injectable()
export class ItemCategoryService {
  constructor(
    @InjectRepository(ItemCategory)
    private readonly categoryRepository: Repository<ItemCategory>,
  ) {}

  async create(dto: CreateItemCategoryDto, userId?: string): Promise<ItemCategory> {
    const existing = await this.categoryRepository.findOne({
      where: { categoryCode: dto.categoryCode, companyId: dto.companyId },
    });
    if (existing) throw new ConflictException(`Category with code '${dto.categoryCode}' already exists in this company`);
    if (dto.parentCategoryId) {
      const parent = await this.findOne(dto.parentCategoryId);
      if (parent.companyId !== dto.companyId) throw new BadRequestException('Parent category must belong to same company');
    }
    const category = this.categoryRepository.create({
      ...dto,
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.categoryRepository.save(category);
  }

  async findAll(options?: { page?: number; limit?: number; search?: string; companyId?: string; parentCategoryId?: string }): Promise<{ data: ItemCategory[]; total: number }> {
    const { page = 1, limit = 20, search, companyId, parentCategoryId } = options || {};
    const qb = this.categoryRepository.createQueryBuilder('cat')
      .leftJoinAndSelect('cat.parentCategory', 'parentCategory')
      .leftJoinAndSelect('cat.children', 'children');
    if (search) {
      qb.where('(cat.name ILIKE :search OR cat.categoryCode ILIKE :search)', { search: `%${search}%` });
    }
    if (companyId) qb.andWhere('cat.companyId = :companyId', { companyId });
    if (parentCategoryId) qb.andWhere('cat.parentCategoryId = :parentCategoryId', { parentCategoryId });
    qb.orderBy('cat.name', 'ASC');
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findHierarchy(companyId?: string): Promise<ItemCategory[]> {
    const qb = this.categoryRepository.createQueryBuilder('cat')
      .leftJoinAndSelect('cat.children', 'children')
      .where('cat.parentCategoryId IS NULL');
    if (companyId) qb.andWhere('cat.companyId = :companyId', { companyId });
    qb.orderBy('cat.name', 'ASC');
    return qb.getMany();
  }

  async findOne(id: string): Promise<ItemCategory> {
    const cat = await this.categoryRepository.findOne({
      where: { id },
      relations: ['parentCategory', 'children', 'company'],
    });
    if (!cat) throw new NotFoundException(`Category with ID '${id}' not found`);
    return cat;
  }

  async update(id: string, dto: UpdateItemCategoryDto, userId?: string): Promise<ItemCategory> {
    const cat = await this.findOne(id);
    if (dto.categoryCode && dto.categoryCode !== cat.categoryCode) {
      const existing = await this.categoryRepository.findOne({
        where: { categoryCode: dto.categoryCode, companyId: cat.companyId, id: Not(id) },
      });
      if (existing) throw new ConflictException(`Category code '${dto.categoryCode}' already exists in this company`);
    }
    if (dto.parentCategoryId) {
      if (dto.parentCategoryId === id) throw new BadRequestException('Category cannot be its own parent');
      const isCircular = await this.checkCircularReference(id, dto.parentCategoryId);
      if (isCircular) throw new BadRequestException('Circular category hierarchy detected');
    }
    Object.assign(cat, dto, { updatedBy: userId || null });
    return this.categoryRepository.save(cat);
  }

  async activate(id: string, userId?: string): Promise<ItemCategory> {
    const cat = await this.findOne(id);
    if (cat.status === ItemCategoryStatus.ACTIVE) throw new BadRequestException('Already active');
    cat.status = ItemCategoryStatus.ACTIVE;
    cat.updatedBy = userId || null;
    return this.categoryRepository.save(cat);
  }

  async deactivate(id: string, userId?: string): Promise<ItemCategory> {
    const cat = await this.findOne(id);
    if (cat.status === ItemCategoryStatus.INACTIVE) throw new BadRequestException('Already inactive');
    cat.status = ItemCategoryStatus.INACTIVE;
    cat.updatedBy = userId || null;
    return this.categoryRepository.save(cat);
  }

  private async checkCircularReference(categoryId: string, parentCategoryId: string): Promise<boolean> {
    let currentParentId: string | null = parentCategoryId;
    const visited = new Set<string>([categoryId]);
    while (currentParentId) {
      if (visited.has(currentParentId)) return true;
      visited.add(currentParentId);
      const parent = await this.categoryRepository.findOne({ where: { id: currentParentId } });
      currentParentId = parent?.parentCategoryId || null;
    }
    return false;
  }
}
