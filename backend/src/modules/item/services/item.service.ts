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
    const { page = 1, limit = 20, search, status, itemType, categoryId, companyId, isPurchasable, isSellable, isManufacturable, isStockItem, trackInventory, sortField = 'createdAt', sortOrder = 'DESC' } = filter;

    const qb = this.itemRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.baseUom', 'baseUom')
      .leftJoinAndSelect('item.company', 'company');

    if (search) {
      qb.where('(item.itemCode ILIKE :search OR item.sku ILIKE :search OR item.name ILIKE :search OR item.barcode ILIKE :search)', { search: `%${search}%` });
    }
    if (status) qb.andWhere('item.status = :status', { status });
    if (itemType) qb.andWhere('item.itemType = :itemType', { itemType });
    if (categoryId) qb.andWhere('item.categoryId = :categoryId', { categoryId });
    if (companyId) qb.andWhere('item.companyId = :companyId', { companyId });
    if (isPurchasable !== undefined) qb.andWhere('item.isPurchasable = :isPurchasable', { isPurchasable });
    if (isSellable !== undefined) qb.andWhere('item.isSellable = :isSellable', { isSellable });
    if (isManufacturable !== undefined) qb.andWhere('item.isManufacturable = :isManufacturable', { isManufacturable });
    if (isStockItem !== undefined) qb.andWhere('item.isStockItem = :isStockItem', { isStockItem });
    if (trackInventory !== undefined) qb.andWhere('item.trackInventory = :trackInventory', { trackInventory });

    const validSortFields = ['itemCode', 'name', 'itemType', 'status', 'createdAt'];
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
      relations: ['category', 'baseUom', 'purchaseUom', 'salesUom', 'company', 'barcodes', 'specifications', 'specifications.uom', 'documents'],
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

  private validateTrackingFlags(item: { trackInventory?: boolean; serialTracked?: boolean; batchTracked?: boolean; expiryTracked?: boolean }): void {
    if (item.serialTracked && !item.trackInventory) throw new BadRequestException('Serial tracking requires inventory tracking');
    if (item.batchTracked && !item.trackInventory) throw new BadRequestException('Batch tracking requires inventory tracking');
    if (item.expiryTracked && !item.trackInventory) throw new BadRequestException('Expiry tracking requires inventory tracking');
  }
}
