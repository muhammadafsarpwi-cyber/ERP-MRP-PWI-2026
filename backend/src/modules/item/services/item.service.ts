import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Item, ItemStatus } from '../entities';
import { CreateItemDto, UpdateItemDto, ItemFilterDto } from '../dto/item.dto';

@Injectable()
export class ItemService {
  private readonly logger = new Logger(ItemService.name);

  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
  ) {}

  async create(dto: CreateItemDto, userId?: string): Promise<Item> {
    const existingCode = await this.itemRepository.findOne({
      where: { itemCode: dto.itemCode, companyId: dto.companyId },
    });
    if (existingCode) throw new ConflictException(`Item with code '${dto.itemCode}' already exists in this company`);

    if (dto.sku) {
      const existingSku = await this.itemRepository.findOne({
        where: { sku: dto.sku, companyId: dto.companyId },
      });
      if (existingSku) throw new ConflictException(`Item with SKU '${dto.sku}' already exists in this company`);
    }

    this.validateTrackingFlags(dto);

    const item = this.itemRepository.create({
      ...dto,
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    return this.itemRepository.save(item);
  }

  async findAll(filter: ItemFilterDto): Promise<{ data: Item[]; total: number }> {
    const { page = 1, limit = 20, search, status, itemType, categoryId, companyId, divisionId, sectionId, departmentId, routeType, wireSizeMm, active, isPurchasable, isSellable, isManufacturable, isStockItem, trackInventory, sortField = 'createdAt', sortOrder = 'DESC' } = filter;

    const qb = this.itemRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.baseUom', 'baseUom')
      .leftJoinAndSelect('item.company', 'company')
      .leftJoinAndSelect('item.division', 'division')
      .leftJoinAndSelect('item.section', 'section')
      .leftJoinAndSelect('item.department', 'department');

    if (search) {
      qb.where('(item.itemCode ILIKE :search OR item.sku ILIKE :search OR item.name ILIKE :search OR item.barcode ILIKE :search OR CAST(item.wireSizeMm AS TEXT) ILIKE :search)', { search: `%${search}%` });
    }
    if (status) qb.andWhere('item.status = :status', { status });
    if (active !== undefined) qb.andWhere(active ? 'item.status = :activeStatus' : 'item.status != :activeStatus', { activeStatus: 'ACTIVE' });
    if (itemType) qb.andWhere('item.itemType = :itemType', { itemType });
    if (categoryId) qb.andWhere('item.categoryId = :categoryId', { categoryId });
    if (companyId) qb.andWhere('item.companyId = :companyId', { companyId });
    if (divisionId) qb.andWhere('item.divisionId = :divisionId', { divisionId });
    if (sectionId) qb.andWhere('item.sectionId = :sectionId', { sectionId });
    if (departmentId) qb.andWhere('item.departmentId = :departmentId', { departmentId });
    if (routeType) qb.andWhere('item.routeType = :routeType', { routeType });
    if (wireSizeMm !== undefined && wireSizeMm !== null && Number.isFinite(wireSizeMm)) qb.andWhere('item.wireSizeMm = :wireSizeMm', { wireSizeMm });
    if (isPurchasable !== undefined) qb.andWhere('item.isPurchasable = :isPurchasable', { isPurchasable });
    if (isSellable !== undefined) qb.andWhere('item.isSellable = :isSellable', { isSellable });
    if (isManufacturable !== undefined) qb.andWhere('item.isManufacturable = :isManufacturable', { isManufacturable });
    if (isStockItem !== undefined) qb.andWhere('item.isStockItem = :isStockItem', { isStockItem });
    if (trackInventory !== undefined) qb.andWhere('item.trackInventory = :trackInventory', { trackInventory });

    const validSortFields = ['itemCode', 'name', 'itemType', 'status', 'createdAt', 'routeType', 'wireSizeMm'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`item.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total };
  }

  async findOne(id: string): Promise<Item> {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: ['category', 'baseUom', 'purchaseUom', 'salesUom', 'company', 'division', 'section', 'department', 'barcodes', 'specifications', 'specifications.uom', 'documents'],
    });
    if (!item) throw new NotFoundException(`Item with ID '${id}' not found`);
    return item;
  }

  async findByItemCode(companyId: string, itemCode: string): Promise<Item> {
    const item = await this.itemRepository.findOne({ where: { companyId, itemCode }, relations: ['category', 'baseUom'] });
    if (!item) throw new NotFoundException(`Item '${itemCode}' not found in this company`);
    return item;
  }

  async findBySku(companyId: string, sku: string): Promise<Item> {
    const item = await this.itemRepository.findOne({ where: { companyId, sku }, relations: ['category', 'baseUom'] });
    if (!item) throw new NotFoundException(`Item with SKU '${sku}' not found in this company`);
    return item;
  }

  async findByBarcode(companyId: string, barcode: string): Promise<Item> {
    const item = await this.itemRepository.findOne({ where: { companyId, barcode }, relations: ['category', 'baseUom'] });
    if (!item) throw new NotFoundException(`Item with barcode '${barcode}' not found in this company`);
    return item;
  }

  async update(id: string, dto: UpdateItemDto, userId?: string): Promise<Item> {
    const item = await this.findOne(id);

    if (dto.itemCode && dto.itemCode !== item.itemCode) {
      const existing = await this.itemRepository.findOne({
        where: { itemCode: dto.itemCode, companyId: item.companyId, id: Not(id) },
      });
      if (existing) throw new ConflictException(`Item code '${dto.itemCode}' already exists in this company`);
    }

    if (dto.sku && dto.sku !== item.sku) {
      const existing = await this.itemRepository.findOne({
        where: { sku: dto.sku, companyId: item.companyId, id: Not(id) },
      });
      if (existing) throw new ConflictException(`SKU '${dto.sku}' already exists in this company`);
    }

    const merged = { ...item, ...dto };
    this.validateTrackingFlags(merged);

    Object.assign(item, dto, { updatedBy: userId || null });
    return this.itemRepository.save(item);
  }

  async activate(id: string, userId?: string): Promise<Item> {
    const item = await this.findOne(id);
    if (item.status === ItemStatus.ACTIVE) throw new BadRequestException('Item is already active');
    item.status = ItemStatus.ACTIVE;
    item.updatedBy = userId || null;
    return this.itemRepository.save(item);
  }

  async deactivate(id: string, userId?: string): Promise<Item> {
    const item = await this.findOne(id);
    if (item.status === ItemStatus.INACTIVE) throw new BadRequestException('Item is already inactive');
    item.status = ItemStatus.INACTIVE;
    item.updatedBy = userId || null;
    return this.itemRepository.save(item);
  }

  async discontinue(id: string, userId?: string): Promise<Item> {
    const item = await this.findOne(id);
    if (item.status === ItemStatus.DISCONTINUED) throw new BadRequestException('Item is already discontinued');
    item.status = ItemStatus.DISCONTINUED;
    item.updatedBy = userId || null;
    return this.itemRepository.save(item);
  }

  /**
   * Reference guard: never break transactional history. If BOMs, routings,
   * production, stock, targets or balances reference this item, require
   * deactivation instead of deletion.
   */
  async remove(id: string): Promise<void> {
    const item = await this.findOne(id);

    const guards: Array<{ label: string; sql: string }> = [
      { label: 'BOM line', sql: 'SELECT COUNT(*)::int AS c FROM bom_lines WHERE item_id = $1' },
      { label: 'bill of materials', sql: 'SELECT COUNT(*)::int AS c FROM bill_of_materials WHERE product_id = $1' },
      { label: 'production routing', sql: 'SELECT COUNT(*)::int AS c FROM production_routings WHERE product_id = $1' },
      { label: 'routing operation', sql: 'SELECT COUNT(*)::int AS c FROM routing_operations WHERE input_item_id = $1 OR output_item_id = $1' },
      { label: 'production entry', sql: 'SELECT COUNT(*)::int AS c FROM production_entries WHERE item_id = $1' },
      { label: 'machine target', sql: 'SELECT COUNT(*)::int AS c FROM machine_targets WHERE item_id = $1' },
      { label: 'stock ledger entry', sql: 'SELECT COUNT(*)::int AS c FROM stock_ledger WHERE item_id = $1' },
      { label: 'inventory balance', sql: 'SELECT COUNT(*)::int AS c FROM inventory_balances WHERE item_id = $1' },
    ];

    const refs: string[] = [];
    for (const guard of guards) {
      try {
        const result = await this.itemRepository.query(guard.sql, [id]);
        const count = Number(result?.[0]?.c ?? 0);
        if (count > 0) refs.push(`${count} ${guard.label}${count === 1 ? '' : 's'}`);
      } catch {
        // Table not present in this environment – skip that check.
      }
    }

    if (refs.length > 0) {
      throw new ConflictException(
        `Item '${item.itemCode}' is referenced by ${refs.join(', ')} and cannot be deleted. Deactivate or discontinue it instead.`,
      );
    }

    await this.itemRepository.remove(item);
  }

  private validateTrackingFlags(item: { trackInventory?: boolean; serialTracked?: boolean; batchTracked?: boolean; expiryTracked?: boolean }): void {
    if (item.serialTracked && !item.trackInventory) throw new BadRequestException('Serial tracking requires inventory tracking');
    if (item.batchTracked && !item.trackInventory) throw new BadRequestException('Batch tracking requires inventory tracking');
    if (item.expiryTracked && !item.trackInventory) throw new BadRequestException('Expiry tracking requires inventory tracking');
  }
}
