import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { ItemCategory, ItemCategoryStatus } from '../entities';
import { CreateItemCategoryDto, UpdateItemCategoryDto } from '../dto/item-category.dto';

export type CategoryWithMeta = Omit<ItemCategory, 'parentCategory' | 'children'> & {
  level: number;
  childCount: number;
  usageCount: number;
  parentCategory?: { id: string; name: string } | null;
  children?: CategoryWithMeta[];
};

@Injectable()
export class ItemCategoryService {
  constructor(
    @InjectRepository(ItemCategory)
    private readonly categoryRepository: Repository<ItemCategory>,
  ) {}

  /**
   * Number of items assigned to each category (only categories in use).
   */
  private async loadUsageCounts(companyId?: string): Promise<Map<string, number>> {
    const rows: Array<{ category_id: string; item_count: number }> = await this.categoryRepository.manager.query(
      `SELECT category_id, COUNT(*)::int AS item_count
         FROM items
        WHERE category_id IS NOT NULL
        ${companyId ? 'AND company_id = $1' : ''}
        GROUP BY category_id`,
      companyId ? [companyId] : [],
    );
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.category_id, Number(r.item_count));
    return map;
  }

  /**
   * Categories per parent (child counts), computed from the full set.
   */
  private computeChildCounts(all: ItemCategory[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const c of all) {
      if (!c.parentCategoryId) continue;
      map.set(c.parentCategoryId, (map.get(c.parentCategoryId) || 0) + 1);
    }
    return map;
  }

  /**
   * Computes hierarchy depth for every category: level 0 = root, 1 = child, 2 = sub-child...
   * Levels are derived from the parent_category_id chain, never hard-coded.
   */
  private computeLevels(all: ItemCategory[]): Map<string, number> {
    const byId = new Map<string, ItemCategory>(all.map((c) => [c.id, c]));
    const memo = new Map<string, number>();
    const visit = (id: string, seen: Set<string>): number => {
      const cached = memo.get(id);
      if (cached !== undefined) return cached;
      const cat = byId.get(id);
      if (!cat) {
        memo.set(id, 0);
        return 0;
      }
      if (seen.has(id) || !cat.parentCategoryId) {
        memo.set(id, 0);
        return 0;
      }
      const nextSeen = new Set(seen).add(id);
      const level = visit(cat.parentCategoryId, nextSeen) + 1;
      memo.set(id, level);
      return level;
    };
    for (const c of all) visit(c.id, new Set());
    return memo;
  }

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

  async findAll(options?: { page?: number; limit?: number; search?: string; companyId?: string; parentCategoryId?: string }): Promise<{ data: CategoryWithMeta[]; total: number }> {
    const { page = 1, limit = 20, search, companyId, parentCategoryId } = options || {};
    const qb = this.categoryRepository.createQueryBuilder('cat')
      .leftJoinAndSelect('cat.parentCategory', 'parentCategory');
    if (search) {
      qb.where('(cat.name ILIKE :search OR cat.categoryCode ILIKE :search)', { search: `%${search}%` });
    }
    if (companyId) qb.andWhere('cat.companyId = :companyId', { companyId });
    if (parentCategoryId) qb.andWhere('cat.parentCategoryId = :parentCategoryId', { parentCategoryId });
    qb.orderBy('cat.name', 'ASC');
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();

    const all = companyId
      ? await this.categoryRepository.find({ where: { companyId } })
      : await this.categoryRepository.find();
    const levels = this.computeLevels(all);
    const childCounts = this.computeChildCounts(all);
    const usage = await this.loadUsageCounts(companyId);
    const enriched: CategoryWithMeta[] = data.map((cat) => ({
      ...cat,
      level: levels.get(cat.id) ?? 0,
      childCount: childCounts.get(cat.id) || 0,
      usageCount: usage.get(cat.id) || 0,
      children: [],
    }));
    return { data: enriched, total };
  }

  /**
   * Full-depth hierarchy (all descendants nested under their roots) with level,
   * childCount and usageCount attached. level 0 = root, 1 = child, 2 = sub-child.
   */
  async findHierarchy(companyId?: string): Promise<CategoryWithMeta[]> {
    const all = companyId
      ? await this.categoryRepository.find({ where: { companyId }, order: { name: 'ASC' } })
      : await this.categoryRepository.find({ order: { name: 'ASC' } });

    const levels = this.computeLevels(all);
    const usage = await this.loadUsageCounts(companyId);
    const byId = new Map<string, ItemCategory>(all.map((c) => [c.id, c]));
    const node = (c: ItemCategory): CategoryWithMeta => ({
      ...c,
      level: levels.get(c.id) ?? 0,
      childCount: 0,
      usageCount: usage.get(c.id) || 0,
      parentCategory: c.parentCategoryId && byId.has(c.parentCategoryId)
        ? { id: c.parentCategoryId, name: byId.get(c.parentCategoryId)!.name }
        : null,
      children: [],
    });

    const nodes = new Map<string, CategoryWithMeta>();
    for (const c of all) nodes.set(c.id, node(c));

    const roots: CategoryWithMeta[] = [];
    for (const c of all) {
      const n = nodes.get(c.id)!;
      const parent = c.parentCategoryId && nodes.get(c.parentCategoryId);
      if (parent) parent.children!.push(n);
      else roots.push(n);
    }

    const setCounts = (n: CategoryWithMeta) => {
      n.childCount = n.children?.length ?? 0;
      for (const k of n.children || []) setCounts(k);
    };
    for (const r of roots) setCounts(r);

    return roots;
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
