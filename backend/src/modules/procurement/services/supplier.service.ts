import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DeepPartial } from 'typeorm';
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

  async generateSupplierCode(companyId: string): Promise<string> {
    const prefix = 'SUP-';
    try {
      const result = await this.repo
        .createQueryBuilder('s')
        .select("MAX(CAST(SUBSTRING(s.supplier_code FROM 'SUP-([0-9]+)') AS INT))", 'maxNum')
        .where('s.company_id = :companyId', { companyId })
        .andWhere('s.supplier_code LIKE :prefix', { prefix: `${prefix}%` })
        .getRawOne();
      const nextNum = (result?.maxNum || 0) + 1;
      return `${prefix}${String(nextNum).padStart(4, '0')}`;
    } catch {
      const count = await this.repo.count({ where: { companyId } });
      return `${prefix}${String(count + 1).padStart(4, '0')}`;
    }
  }

  async getValidCompanyId(companyId?: string): Promise<string> {
    if (companyId && companyId !== '00000000-0000-0000-0000-000000000001') {
      try {
        const res = await this.repo.manager.query('SELECT id FROM companies WHERE id = $1 LIMIT 1', [companyId]);
        if (res && res.length > 0) return res[0].id;
      } catch { /* ignore */ }
    }
    try {
      const defaultComp = await this.repo.manager.query("SELECT id FROM companies WHERE status = 'ACTIVE' LIMIT 1");
      if (defaultComp && defaultComp.length > 0) return defaultComp[0].id;
      const anyComp = await this.repo.manager.query('SELECT id FROM companies LIMIT 1');
      if (anyComp && anyComp.length > 0) return anyComp[0].id;
    } catch { /* ignore */ }
    return '7725aa04-a270-4314-9e82-90949cbe7791';
  }

  async create(dto: CreateSupplierDto, userId?: string): Promise<Supplier> {
    const companyId = await this.getValidCompanyId(dto.companyId);
    const finalCode = dto.supplierCode?.trim() || (await this.generateSupplierCode(companyId));
    const existing = await this.repo.findOne({
      where: { supplierCode: finalCode, companyId },
    });
    if (existing) {
      throw new ConflictException(`Supplier code '${finalCode}' already exists in this company`);
    }

    const {
      isActive,
      divisionId,
      divisionName,
      openingBalance,
      creditDays,
      bankDetails,
      address,
      ...entityData
    } = dto as any;

    const supplier = this.repo.create({
      ...entityData,
      companyId,
      supplierCode: finalCode,
      addressLine1: entityData.addressLine1 || address || null,
      status: dto.status || (isActive !== false ? 'ACTIVE' : 'INACTIVE'),
      createdBy: userId || null,
      updatedBy: userId || null,
    } as DeepPartial<Supplier>);
    return this.repo.save(supplier);
  }

  async findAll(filter: SupplierFilterDto): Promise<{ data: Supplier[]; total: number }> {
    const { page = 1, limit = 20, companyId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('s');
    let hasWhere = false;
    if (companyId && companyId !== '00000000-0000-0000-0000-000000000001') { qb.where('s.companyId = :companyId', { companyId }); hasWhere = true; }
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
    const {
      isActive,
      divisionId,
      divisionName,
      openingBalance,
      creditDays,
      bankDetails,
      address,
      ...entityData
    } = dto as any;

    Object.assign(supplier, entityData);
    if (address) supplier.addressLine1 = address;
    if (dto.status) supplier.status = dto.status;
    else if (isActive !== undefined) supplier.status = isActive ? 'ACTIVE' : 'INACTIVE';
    supplier.updatedBy = userId || null;
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
