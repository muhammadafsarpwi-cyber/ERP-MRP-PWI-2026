import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier, SupplierItem } from '../entities';
import { CreateSupplierDto, CreateSupplierItemDto, SupplierFilterDto } from '../dto';

@Injectable()
export class SupplierService {
  private readonly logger = new Logger(SupplierService.name);

  constructor(
    @InjectRepository(Supplier)
    private readonly repo: Repository<Supplier>,
    @InjectRepository(SupplierItem)
    private readonly itemRepo: Repository<SupplierItem>,
  ) {}

  async create(dto: CreateSupplierDto, userId?: string): Promise<Supplier> {
    const existing = await this.repo.findOne({
      where: { supplierCode: dto.supplierCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(`Supplier code '${dto.supplierCode}' already exists in this company`);
    }
    const supplier = this.repo.create({
      ...dto,
      status: 'ACTIVE',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.repo.save(supplier);
  }

  async findAll(filter: SupplierFilterDto): Promise<{ data: Supplier[]; total: number }> {
    const { page = 1, limit = 20, companyId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('s');
    let hasWhere = false;
    if (companyId) { qb.where('s.companyId = :companyId', { companyId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('s.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(s.name ILIKE :search OR s.supplierCode ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'supplierCode', 'name', 'status'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`s.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<Supplier> {
    const supplier = await this.repo.findOne({
      where: { id },
      relations: ['items', 'items.item'],
    });
    if (!supplier) throw new NotFoundException(`Supplier with ID '${id}' not found`);
    return supplier;
  }

  async update(id: string, dto: Partial<CreateSupplierDto>, userId?: string): Promise<Supplier> {
    const supplier = await this.findOne(id);
    Object.assign(supplier, dto, { updatedBy: userId || null });
    return this.repo.save(supplier);
  }

  async remove(id: string): Promise<void> {
    const supplier = await this.findOne(id);
    supplier.status = 'INACTIVE';
    await this.repo.save(supplier);
  }

  async addItem(supplierId: string, dto: CreateSupplierItemDto, companyId: string, userId?: string): Promise<SupplierItem> {
    const supplier = await this.findOne(supplierId);
    const existing = await this.itemRepo.findOne({
      where: { supplierId, itemId: dto.itemId },
    });
    if (existing) throw new ConflictException('Item already exists for this supplier');
    const item = this.itemRepo.create({
      ...dto,
      companyId,
      supplierId,
      status: 'ACTIVE',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.itemRepo.save(item);
  }

  async updateItem(itemId: string, dto: Partial<CreateSupplierItemDto>, userId?: string): Promise<SupplierItem> {
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Supplier item with ID '${itemId}' not found`);
    Object.assign(item, dto, { updatedBy: userId || null });
    return this.itemRepo.save(item);
  }

  async removeItem(itemId: string): Promise<void> {
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Supplier item with ID '${itemId}' not found`);
    await this.itemRepo.remove(item);
  }
}
