import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import { randomUUID } from 'crypto';
import { Item, ItemStatus, ItemType } from '../entities';
import { CreateItemDto, UpdateItemDto, ItemFilterDto } from '../dto/item.dto';
import { Division, Section, Department } from '../../organization/entities';
import { ItemRouteType, RouteTypeStatus } from '../entities/route-type.entity';
import { StockLedger } from '../../inventory/entities/stock-ledger.entity';
import { InventoryBalance } from '../../inventory/entities/inventory-balance.entity';
import { ProductionEntry } from '../../production/entities/production-entry.entity';
import { BarcodeService } from '../../barcode/services/barcode.service';
import { BarcodeEntityType } from '../../barcode/entities/barcode.entity';

@Injectable()
export class ItemService implements OnModuleInit {
  private readonly logger = new Logger(ItemService.name);

  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(Division)
    private readonly divisionRepository: Repository<Division>,
    @InjectRepository(Section)
    private readonly sectionRepository: Repository<Section>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(ItemRouteType)
    private readonly routeTypeRepository: Repository<ItemRouteType>,
    @InjectRepository(StockLedger)
    private readonly stockLedgerRepository: Repository<StockLedger>,
    @InjectRepository(InventoryBalance)
    private readonly inventoryBalanceRepository: Repository<InventoryBalance>,
    @InjectRepository(ProductionEntry)
    private readonly productionEntryRepository: Repository<ProductionEntry>,
    private readonly barcodeService: BarcodeService,
  ) {}

  async onModuleInit() {
    try {
      // TASK #45: Heal any legacy records where production_in_item_id is set
      // but production_out_item_id is NULL or out of sync (current item is the output).
      await this.itemRepository
        .createQueryBuilder()
        .update(Item)
        .set({ productionOutItemId: () => 'id' })
        .where('production_in_item_id IS NOT NULL')
        .andWhere('(production_out_item_id IS NULL OR production_out_item_id != id)')
        .execute();
      this.logger.log('Production OUT item auto-sync check completed successfully.');
    } catch (err: any) {
      this.logger.warn(`Could not run production OUT auto-sync check: ${err?.message}`);
    }
  }

  /**
   * Generate a unique SKU for an item within a company.
   * Strategy: Use itemCode as the base SKU (itemCode is already unique per company).
   * If a collision occurs (shouldn't happen since itemCode is unique), append a suffix.
   */
  private async generateSku(companyId: string, itemCode: string): Promise<string> {
    let candidate = itemCode;
    let suffix = 1;
    while (suffix <= 100) {
      const existing = await this.itemRepository.findOne({
        where: { companyId, sku: candidate },
      });
      if (!existing) return candidate;
      candidate = `${itemCode}-${String(suffix).padStart(2, '0')}`;
      suffix++;
    }
    throw new ConflictException('Unable to generate unique SKU');
  }

  /**
   * Generate a unique barcode for an item.
   * Strategy: 13-digit numeric barcode (Code128-compatible internal format).
   * Starts from the current max barcode + 1 to guarantee uniqueness.
   */
  private async generateBarcode(): Promise<string> {
    const result = await this.itemRepository.query(`
      SELECT COALESCE(
        MAX(CAST(barcode AS BIGINT)),
        8901000000000
      ) + 1 AS next_barcode
      FROM items
      WHERE barcode IS NOT NULL AND barcode != '' AND barcode ~ '^[0-9]+$'
    `);
    const next = Number(result?.[0]?.next_barcode ?? 8901000000001);
    return String(next).padStart(13, '0');
  }

  /**
   * Backfill SKU and Barcode for existing items that are missing them.
   * Idempotent: safe to run multiple times.
   */
  async backfillSkuAndBarcode(): Promise<{
    totalItems: number;
    itemsWithSku: number;
    itemsRepairedSku: number;
    itemsWithBarcode: number;
    itemsRepairedBarcode: number;
    duplicateSkus: number;
    duplicateBarcodes: number;
  }> {
    const [totalResult] = await this.itemRepository.query(`SELECT COUNT(*)::int AS total FROM items`);
    const totalItems = totalResult?.total ?? 0;

    // Backfill missing SKU
    await this.itemRepository.query(`
      UPDATE items SET sku = item_code
      WHERE (sku IS NULL OR sku = '' OR LENGTH(TRIM(sku)) = 0)
    `);

    // Fix duplicate SKUs
    await this.itemRepository.query(`
      WITH duplicate_skus AS (
        SELECT id, sku, company_id,
               ROW_NUMBER() OVER (PARTITION BY company_id, sku ORDER BY created_at ASC) AS rn
        FROM items WHERE sku IS NOT NULL AND sku != ''
      )
      UPDATE items SET sku = items.sku || '-' || ds.rn
      FROM duplicate_skus ds
      WHERE items.id = ds.id AND ds.rn > 1;
    `);

    // Backfill missing Barcode
    await this.itemRepository.query(`
      WITH numbered_items AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY company_id, created_at ASC) AS seq
        FROM items WHERE barcode IS NULL OR barcode = '' OR LENGTH(TRIM(barcode)) = 0
      ),
      max_barcode AS (
        SELECT COALESCE(MAX(CAST(barcode AS BIGINT)), 8901000000000) AS max_bc
        FROM items WHERE barcode IS NOT NULL AND barcode != '' AND barcode ~ '^[0-9]+$'
      )
      UPDATE items SET barcode = LPAD(CAST((mb.max_bc + ni.seq) AS TEXT), 13, '0')
      FROM numbered_items ni, max_barcode mb WHERE items.id = ni.id;
    `);

    const [skuResult] = await this.itemRepository.query(`SELECT COUNT(*)::int AS cnt FROM items WHERE sku IS NOT NULL AND sku != ''`);
    const [barcodeResult] = await this.itemRepository.query(`SELECT COUNT(*)::int AS cnt FROM items WHERE barcode IS NOT NULL AND barcode != ''`);
    const [repairedSku] = await this.itemRepository.query(`SELECT COUNT(*)::int AS cnt FROM items WHERE sku IS NOT NULL AND sku != '' AND sku = item_code`);
    const [dupSku] = await this.itemRepository.query(`
      SELECT COUNT(*)::int AS cnt FROM (
        SELECT company_id, sku FROM items WHERE sku IS NOT NULL AND sku != ''
        GROUP BY company_id, sku HAVING COUNT(*) > 1
      ) t
    `);
    const [dupBarcode] = await this.itemRepository.query(`
      SELECT COUNT(*)::int AS cnt FROM (
        SELECT barcode FROM items WHERE barcode IS NOT NULL AND barcode != ''
        GROUP BY barcode HAVING COUNT(*) > 1
      ) t
    `);

    return {
      totalItems,
      itemsWithSku: skuResult?.cnt ?? 0,
      itemsRepairedSku: totalItems - (skuResult?.cnt ?? 0),
      itemsWithBarcode: barcodeResult?.cnt ?? 0,
      itemsRepairedBarcode: totalItems - (barcodeResult?.cnt ?? 0),
      duplicateSkus: dupSku?.cnt ?? 0,
      duplicateBarcodes: dupBarcode?.cnt ?? 0,
    };
  }

  /**
   * Get stock ledger entries for a specific item.
   */
  async getItemStockLedger(itemId: string, limit = 50, offset = 0): Promise<{ data: StockLedger[]; total: number }> {
    const [data, total] = await this.stockLedgerRepository.findAndCount({
      where: { itemId },
      relations: ['warehouse', 'uom', 'item', 'location'],
      order: { transactionDate: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { data, total };
  }

  /**
   * Get inventory balances by warehouse for a specific item.
   */
  async getItemInventory(itemId: string): Promise<InventoryBalance[]> {
    return this.inventoryBalanceRepository.find({
      where: { itemId, status: 'ACTIVE' },
      relations: ['warehouse', 'uom'],
      order: { onHand: 'DESC' },
    });
  }

  /**
   * Get production history for a specific item.
   * Includes BOTH roles:
   *  - OUTPUT: production entries where this item was produced (item_id = :itemId)
   *  - INPUT: production entries where this item was consumed (via productionInItemId reverse lookup)
   *  - Stock ledger: PRODUCTION_CONSUMPTION / PRODUCTION_SCRAP records for this item
   */
  async getItemProductionHistory(itemId: string, limit = 50, offset = 0): Promise<{ data: any[]; total: number }> {
    // 1. Find all output items that have this item as their input material
    const outputItems = await this.itemRepository.query(
      `SELECT id FROM items WHERE production_in_item_id = $1`,
      [itemId],
    );
    const outputItemIds: string[] = outputItems?.map((r: any) => r.id) ?? [];

    // 2. Build the combined set of item IDs to search in production_entries
    const allItemIds = [itemId, ...outputItemIds];

    // 3. Query production entries where this item is OUTPUT or an output-item of this input
    const qb = this.productionEntryRepository.createQueryBuilder('pe')
      .leftJoinAndSelect('pe.department', 'department')
      .leftJoinAndSelect('pe.shift', 'shift')
      .leftJoinAndSelect('pe.machine', 'machine')
      .leftJoinAndSelect('pe.uom', 'uom')
      .leftJoinAndSelect('pe.item', 'item')
      .where('pe.itemId IN (:...allItemIds)', { allItemIds })
      .orderBy('pe.entryDate', 'DESC')
      .addOrderBy('pe.createdAt', 'DESC');

    const [entries, entriesTotal] = await qb.take(limit).skip(offset).getManyAndCount();

    // 4. Also query stock ledger for production consumption/scrappy records for this item
    const [stockRecords, stockTotal] = await this.stockLedgerRepository
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.warehouse', 'warehouse')
      .leftJoinAndSelect('sl.uom', 'uom')
      .where('sl.itemId = :itemId', { itemId })
      .andWhere('sl.transactionType IN (:...types)', {
        types: ['PRODUCTION_CONSUMPTION', 'PRODUCTION_SCRAP', 'PRODUCTION_ISSUE', 'PRODUCTION_RECEIPT'],
      })
      .orderBy('sl.transactionDate', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();

    // 5. Merge and deduplicate: production entries + stock ledger consumption records
    const results: any[] = [];

    // Add production entries with role annotation
    for (const entry of entries) {
      const isOutput = entry.itemId === itemId;
      const isConsumed = outputItemIds.includes(entry.itemId);
      results.push({
        id: entry.id,
        entryDate: entry.entryDate,
        department: entry.department,
        machine: entry.machine,
        machineNo: entry.machineNo,
        operatorName: entry.operatorName,
        targetQuantity: entry.targetQuantity,
        actualQuantity: entry.actualQuantity,
        scrapQuantity: entry.scrapQuantity,
        uom: entry.uom,
        status: entry.isActive ? 'COMPLETED' : 'CANCELLED',
        referenceNumber: entry.id,
        role: isOutput ? 'OUTPUT' : 'INPUT',
        roleDescription: isOutput ? 'Produced' : 'Consumed',
        source: 'PRODUCTION_ENTRY',
        item: entry.item,
      });
    }

    // Add stock ledger consumption records
    for (const sl of stockRecords) {
      results.push({
        id: sl.id,
        entryDate: sl.transactionDate,
        department: null,
        machine: null,
        machineNo: null,
        operatorName: null,
        targetQuantity: null,
        actualQuantity: sl.direction === 'IN' ? Number(sl.quantity) : -Number(sl.quantity),
        scrapQuantity: sl.transactionType === 'PRODUCTION_SCRAP' ? Number(sl.quantity) : 0,
        uom: sl.uom,
        status: sl.transactionType,
        referenceNumber: sl.referenceNumber || sl.id,
        role: sl.direction === 'IN' ? 'OUTPUT' : 'INPUT',
        roleDescription: sl.transactionType === 'PRODUCTION_CONSUMPTION'
          ? 'Consumed'
          : sl.transactionType === 'PRODUCTION_SCRAP'
            ? 'Scrapped'
            : sl.transactionType === 'PRODUCTION_ISSUE'
              ? 'Issued'
              : 'Received',
        source: 'STOCK_LEDGER',
        warehouse: sl.warehouse,
      });
    }

    // Sort by date descending
    results.sort((a, b) => {
      const dateA = a.entryDate ? new Date(a.entryDate).getTime() : 0;
      const dateB = b.entryDate ? new Date(b.entryDate).getTime() : 0;
      return dateB - dateA;
    });

    return { data: results.slice(0, limit), total: results.length };
  }

  /**
   * Resolves the route classification for an item. Accepts a route type master
   * UUID (preferred) or a legacy route code, and returns the values to persist.
   */
  private async resolveRouteType(
    companyId: string,
    routeTypeId?: string | null,
    routeTypeCode?: string | null,
  ): Promise<{ routeTypeId: string | null; routeTypeCode: string | null }> {
    if (routeTypeId) {
      const rt = await this.routeTypeRepository.findOne({ where: { id: routeTypeId, companyId } });
      if (!rt) throw new BadRequestException(`Route type '${routeTypeId}' does not exist in this company.`);
      if (rt.status !== RouteTypeStatus.ACTIVE) throw new BadRequestException(`Route type '${rt.name}' is not active.`);
      return { routeTypeId: rt.id, routeTypeCode: rt.routeCode };
    }
    if (routeTypeCode) {
      const rt = await this.routeTypeRepository.findOne({ where: { routeCode: routeTypeCode, companyId } });
      if (rt) {
        if (rt.status !== RouteTypeStatus.ACTIVE) throw new BadRequestException(`Route type '${rt.name}' is not active.`);
        return { routeTypeId: rt.id, routeTypeCode: rt.routeCode };
      }
      // Legacy free-form code not present in master: persist as-is for compatibility.
      return { routeTypeId: null, routeTypeCode };
    }
    return { routeTypeId: null, routeTypeCode: null };
  }

  private async validateOrgHierarchy(companyId: string, divisionId?: string | null, sectionId?: string | null, departmentId?: string | null): Promise<void> {
    if (divisionId) {
      const division = await this.divisionRepository.findOne({ where: { id: divisionId, companyId } });
      if (!division) throw new BadRequestException(`Division '${divisionId}' does not exist in this company.`);
    }
    if (sectionId) {
      const section = await this.sectionRepository.findOne({ where: { id: sectionId } });
      if (!section) throw new BadRequestException(`Section '${sectionId}' does not exist.`);
      if (divisionId && section.divisionId && section.divisionId !== divisionId) {
        throw new BadRequestException(`Section '${section.sectionCode}' does not belong to the selected Division.`);
      }
    }
    if (departmentId) {
      const department = await this.departmentRepository.findOne({ where: { id: departmentId } });
      if (!department) throw new BadRequestException(`Department '${departmentId}' does not exist.`);
      if (sectionId && department.sectionId && department.sectionId !== sectionId) {
        throw new BadRequestException(`Department '${department.departmentCode}' does not belong to the selected Section.`);
      }
      if (divisionId && department.divisionId && department.divisionId !== divisionId) {
        throw new BadRequestException(`Department '${department.departmentCode}' does not belong to the selected Division.`);
      }
    }
  }

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
    await this.validateOrgHierarchy(dto.companyId, dto.divisionId, dto.sectionId, dto.departmentId);

    // TASK #34B: The current Item IS the output of its own production stage —
    // the user selects only the INPUT material; production_out_item_id is a
    // backward-compat column that is always auto-synchronized to the current
    // Item ID (or NULL for root raw materials).
    const newItemId = randomUUID();
    // TASK 15: a RAW MATERIAL item has NO input material — never force or derive
    // an upstream Item, and never show "Raw Material → Raw Material".
    const isRawMaterial = dto.itemType === ItemType.RAW_MATERIAL;
    const effectiveInItemId = isRawMaterial ? null : dto.productionInItemId;
    const syncedOut = await this.resolveProductionFlowMapping(dto.companyId, effectiveInItemId, newItemId);

    const rt = await this.resolveRouteType(dto.companyId, dto.routeTypeId, dto.routeType);

    // Auto-generate SKU if not provided
    const sku = dto.sku || await this.generateSku(dto.companyId, dto.itemCode);

    // Auto-generate Barcode if not provided
    const barcode = dto.barcode || await this.generateBarcode();

    this.normalizeDtoAliases(dto as any);
    const processes = this.extractProcesses(dto as any);
    const cleanDto = { ...dto, ...processes };
    if (isRawMaterial) (cleanDto as any).productionInItemId = null;

    // TASK 15: the configured Production Route rows (DEPARTMENT + ITEM per stage)
    // are validated before save. Each stage is independently configurable; no
    // row is forced to the current Item.
    if (Array.isArray(processes.processes) && processes.processes.length > 0) {
      cleanDto.processes = await this.validateRouteRows(processes.processes as any, {
        companyId: dto.companyId,
        currentItemId: newItemId,
      });
    }

    this.cleanProcessAliases(cleanDto);

    const item = this.itemRepository.create({
      ...cleanDto,
      id: newItemId,
      sku,
      barcode,
      productionOutItemId: syncedOut,
      routeTypeId: rt.routeTypeId,
      routeType: rt.routeTypeCode,
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.itemRepository.save(item);
    this.ensureProcessesArray(saved);

    // Auto-create centralized barcode registry entry
    try {
      const barcode = await this.barcodeService.ensureBarcodeForEntity(
        saved.companyId,
        BarcodeEntityType.ITEM,
        saved.id,
        saved.itemCode,
        saved.name,
        userId,
      );
      // Sync barcode value to items.barcode column
      if (barcode && barcode.barcodeValue && !saved.barcode) {
        saved.barcode = barcode.barcodeValue;
        await this.itemRepository.save(saved);
      }
    } catch (err) {
      this.logger.warn(`Failed to create centralized barcode for item ${saved.id}: ${err}`);
    }

    return saved;
  }

  async findAll(filter: ItemFilterDto): Promise<{ data: Item[]; total: number }> {
    const { page = 1, limit = 20, search, status, itemType, categoryId, companyId, divisionId, sectionId, departmentId, routeType, routeTypeId, wireSizeMm, thicknessMm, widthMm, active, isPurchasable, isSellable, isManufacturable, isStockItem, trackInventory, sortField = 'createdAt', sortOrder = 'DESC' } = filter;

    const qb = this.itemRepository.createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.baseUom', 'baseUom')
      .leftJoinAndSelect('item.company', 'company')
      .leftJoinAndSelect('item.division', 'division')
      .leftJoinAndSelect('item.section', 'section')
      .leftJoinAndSelect('item.department', 'department')
      .leftJoinAndSelect('item.routeTypeRef', 'routeTypeRef')
      .leftJoinAndSelect('item.productionInItem', 'productionInItem')
      .leftJoinAndSelect('item.productionOutItem', 'productionOutItem');

    if (search) {
      qb.where('(item.itemCode ILIKE :search OR item.sku ILIKE :search OR item.name ILIKE :search OR item.barcode ILIKE :search OR CAST(item.wireSizeMm AS TEXT) ILIKE :search OR CAST(item.diameterMm AS TEXT) ILIKE :search)', { search: `%${search}%` });
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
    if (routeTypeId) qb.andWhere('item.routeTypeId = :routeTypeId', { routeTypeId });
    if (wireSizeMm !== undefined && wireSizeMm !== null && Number.isFinite(wireSizeMm)) qb.andWhere('item.wireSizeMm = :wireSizeMm', { wireSizeMm });
    if (thicknessMm !== undefined && thicknessMm !== null && Number.isFinite(thicknessMm)) qb.andWhere('item.thicknessMm = :thicknessMm', { thicknessMm });
    if (widthMm !== undefined && widthMm !== null && Number.isFinite(widthMm)) qb.andWhere('item.widthMm = :widthMm', { widthMm });
    if (isPurchasable !== undefined) qb.andWhere('item.isPurchasable = :isPurchasable', { isPurchasable });
    if (isSellable !== undefined) qb.andWhere('item.isSellable = :isSellable', { isSellable });
    if (isManufacturable !== undefined) qb.andWhere('item.isManufacturable = :isManufacturable', { isManufacturable });
    if (isStockItem !== undefined) qb.andWhere('item.isStockItem = :isStockItem', { isStockItem });
    if (trackInventory !== undefined) qb.andWhere('item.trackInventory = :trackInventory', { trackInventory });

    const validSortFields = ['itemCode', 'name', 'itemType', 'status', 'createdAt', 'routeType', 'wireSizeMm', 'thicknessMm', 'widthMm'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`item.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    data.forEach(item => this.ensureProcessesArray(item));

    return { data, total };
  }

  async findOne(id: string): Promise<Item> {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: ['category', 'baseUom', 'purchaseUom', 'salesUom', 'company', 'division', 'section', 'department', 'routeTypeRef', 'barcodes', 'specifications', 'specifications.uom', 'documents', 'productionInItem', 'productionOutItem'],
    });
    if (!item) throw new NotFoundException(`Item with ID '${id}' not found`);
    this.ensureProcessesArray(item);
    return item;
  }

  async findByItemCode(companyId: string, itemCode: string): Promise<Item> {
    const item = await this.itemRepository.findOne({ where: { companyId, itemCode }, relations: ['category', 'baseUom'] });
    if (!item) throw new NotFoundException(`Item '${itemCode}' not found in this company`);
    this.ensureProcessesArray(item);
    return item;
  }

  async findBySku(companyId: string, sku: string): Promise<Item> {
    const item = await this.itemRepository.findOne({ where: { companyId, sku }, relations: ['category', 'baseUom'] });
    if (!item) throw new NotFoundException(`Item with SKU '${sku}' not found in this company`);
    this.ensureProcessesArray(item);
    return item;
  }

  async findByBarcode(companyId: string, barcode: string): Promise<Item> {
    // First try the items.barcode column (fast lookup)
    let item = await this.itemRepository.findOne({ where: { companyId, barcode }, relations: ['category', 'baseUom', 'barcodes', 'division', 'section', 'department', 'routeTypeRef', 'productionInItem', 'productionOutItem'] });
    if (item) {
      this.ensureProcessesArray(item);
      return item;
    }
    // Fallback: check item_barcodes table
    const barcodeEntity = await this.itemRepository.query(
      `SELECT item_id FROM item_barcodes WHERE barcode = $1 AND status = 'ACTIVE' LIMIT 1`,
      [barcode],
    );
    if (barcodeEntity?.[0]?.item_id) {
      item = await this.findOne(barcodeEntity[0].item_id);
      return item;
    }
    throw new NotFoundException(`Item with barcode '${barcode}' not found`);
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

    await this.validateOrgHierarchy(
      item.companyId,
      dto.divisionId !== undefined ? dto.divisionId : item.divisionId,
      dto.sectionId !== undefined ? dto.sectionId : item.sectionId,
      dto.departmentId !== undefined ? dto.departmentId : item.departmentId,
    );

    // TASK #34B: Production IN/OUT mapping — the user supplies only the INPUT
    // material; production_out_item_id is server-owned and always mirrored to the
    // current Item ID (see resolveProductionFlowMapping below).
    // TASK 15: a RAW MATERIAL item has NO input material (never forced upstream).
    const isRawMaterial = (dto.itemType ?? item.itemType) === ItemType.RAW_MATERIAL;
    const effectiveInItemId = isRawMaterial
      ? null
      : (dto.productionInItemId !== undefined ? dto.productionInItemId : item.productionInItemId);
    const syncedOut = await this.resolveProductionFlowMapping(item.companyId, effectiveInItemId, id);

    // Resolve route type if supplied
    if (dto.routeTypeId !== undefined || dto.routeType !== undefined) {
      const rt = await this.resolveRouteType(
        item.companyId,
        dto.routeTypeId !== undefined ? dto.routeTypeId : item.routeTypeId,
        dto.routeType !== undefined ? dto.routeType : item.routeType,
      );
      // Override scalar update with resolved values
      (dto as any).routeTypeId = rt.routeTypeId;
      (dto as any).routeType = rt.routeTypeCode;
    }

    // Build a clean column-level update that only touches defined fields —
    // this bypasses the stale relation objects (division/section/department) that
    // were loaded with the original entity, preventing TypeORM from persisting
    // the old relation IDs instead of the newly supplied scalar FKs.
    this.normalizeDtoAliases(dto as any);
    const processes = this.extractProcesses(dto as any);
    const scalarUpdate: Record<string, unknown> = { updatedBy: userId || null };
    for (const [k, v] of Object.entries(dto)) {
      if (v !== undefined) scalarUpdate[k] = v;
    }
    this.cleanProcessAliases(scalarUpdate);
    Object.assign(scalarUpdate, processes);

    // Server-owned production OUT: a client-supplied productionOutItemId is
    // overridden so the backward-compat column always equals the current Item ID
    // (auto-sync), healing any stale pre-#34B sample data.
    scalarUpdate.productionOutItemId = syncedOut;

    // TASK 15: a RAW MATERIAL item never persists an input material mapping.
    if (isRawMaterial) scalarUpdate.productionInItemId = null;

    // TASK 15: validate the configured Production Route rows (DEPARTMENT + ITEM
    // per stage) before persist. Each stage is independently configurable; no row
    // is forced to the current Item.
    if (dto.processes !== undefined) {
      const validatedRoutes = await this.validateRouteRows(
        Array.isArray(dto.processes) ? (dto.processes as any) : [],
        {
          companyId: item.companyId,
          currentItemId: id,
        },
      );
      scalarUpdate.processes = validatedRoutes.length ? validatedRoutes : null;
    }

    await this.itemRepository.update(id, scalarUpdate);

    // Fresh read from the database so the returned object reflects the new state.
    return this.findOne(id);
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

  /**
   * TASK #34B: Resolve + validate the Item Master production IN/OUT mapping and
   * return the server-owned production OUT Item ID to persist.
   *
   * Model (the current Item IS the output of its own production stage):
   *   · The user selects ONLY the INPUT material (`productionInItemId`).
   *   · `production_out_item_id` is kept ONLY for backward compatibility and is
   *     ALWAYS auto-synchronized to the current Item's id when an input is mapped
   *     (NULL when the item is a root raw material, i.e. it has no input).
   *   · Any client-supplied `productionOutItemId` is ignored / overridden.
   *
   * Validation:
   *   · the input material can never be the item itself (self-input),
   *   · the input must exist in this company and be ACTIVE (deleted/inactive
   *     inputs are rejected),
   *   · circular chains are rejected by walking the input's own input chain
   *     backward (A ← B ← A can never be executed),
   *   · chains may span departments (a later stage may consume an upstream
   *     stage's output regardless of organizational placement).
   */
  private async resolveProductionFlowMapping(
    companyId: string,
    inItemId: string | null | undefined,
    currentItemId: string,
  ): Promise<string | null> {
    const effectiveIn = inItemId ?? null;
    if (!effectiveIn) {
      // Root raw material / no production stage: no input and no output.
      return null;
    }

    if (effectiveIn === currentItemId) {
      throw new BadRequestException('Production IN Item cannot be the item itself');
    }

    // The input must exist in this company and be ACTIVE — a deleted or inactive
    // input is never a valid raw material for a production stage.
    const input = await this.itemRepository.findOne({ where: { id: effectiveIn, companyId } });
    if (!input) {
      throw new BadRequestException(
        `Production IN Item '${effectiveIn}' does not exist in this company (invalid UUID or deleted item).`,
      );
    }
    if (input.status !== ItemStatus.ACTIVE) {
      throw new BadRequestException(`Production IN Item '${input.itemCode}' is not ACTIVE`);
    }

    // Circular-chain guard: walk the input's own input chain backward. If it ever
    // reaches the current item (or revisits a node), the mapping would form a loop
    // that can never be executed — reject it.
    const seen = new Set<string>([effectiveIn]);
    let probeId = input.productionInItemId;
    let hops = 0;
    while (probeId) {
      if (hops++ > 50) {
        throw new BadRequestException('Production IN chain is deeper than 50 stages — circular reference suspected');
      }
      if (probeId === currentItemId || seen.has(probeId)) {
        throw new BadRequestException('Circular production chain detected (the input ultimately depends on this item)');
      }
      seen.add(probeId);
      const probe = await this.itemRepository.findOne({ where: { id: probeId } });
      if (!probe) {
        throw new BadRequestException(`Production IN chain references missing item '${probeId}'`);
      }
      probeId = probe.productionInItemId;
    }

    // The current Item IS the output of its stage.
    return currentItemId;
  }

  /**
   * TASK 15: Normalize the configured Production Route rows (filter empty rows,
   * re-index sequence 1..N). Each stage = a DEPARTMENT + ITEM pair (name is
   * optional and auto-derived from the department when omitted). A row is kept
   * when it carries at least a department or an item — name-only rows are
   * silently dropped as incomplete.
   */
  private ensureRouteRows(processes: any): Array<Record<string, any>> {
    if (!Array.isArray(processes)) return [];
    return processes
      .filter((r) => {
        if (!r || typeof r !== 'object') return false;
        const hasDept = Boolean(r.departmentId && String(r.departmentId).trim());
        const hasItem = Boolean(r.outputItemId && String(r.outputItemId).trim());
        return hasDept || hasItem;
      })
      .map((r, idx) => ({
        ...r,
        sequence: idx + 1,
        name: typeof r.name === 'string' ? r.name.trim() : '',
      }));
  }

  /**
   * TASK 15 (revised): Validate + normalize the configured Production Route rows
   * before save.
   *
   *  · Each stage is an independent DEPARTMENT + ITEM pair (step number, dept,
   *    item, item metadata, optional operation). The current Item may appear at
   *    any stage — the stage whose output equals the current Item is the
   *    "current stage" (isCurrent).
   *  · Step numbering is re-indexed (1..N) — sequential, no duplicates.
   *  · Every non-blank row must carry a real ACTIVE Output Item in the same
   *    company. Duplicate items across stages are rejected (A → B → A cycle).
   *  · The process DEPARTMENT (if given) must exist. The department's real name,
   *    section, and division OVERWRITE client-provided descriptive fields so the
   *    persisted route is always authoritative. Department scope is NOT restricted
   *    to the current Item's own Division/Section — cross-department flows are
   *    valid.
   *  · Operation name is optional — auto-derived from the department name when
   *    omitted. Repeatable operations ARE allowed (no de-duplication by name).
   *  · Rows carrying neither a department nor an output item are silently
   *    dropped (incomplete authoring artifacts).
   */
  private async validateRouteRows(
    rows: Array<Record<string, any>> | undefined,
    ctx: { companyId: string; currentItemId: string },
  ): Promise<Array<Record<string, any>>> {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const clean = (val: any): string | null => (val == null || String(val).trim() === '' ? null : String(val).trim());
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Phase 1: clean raw rows, drop blanks (no dept AND no item).
    const cleaned: Array<Record<string, any>> = [];
    rows.forEach((row, idx) => {
      const hasDept = row && row.departmentId && String(row.departmentId).trim();
      const hasItem = row && row.outputItemId && String(row.outputItemId).trim();
      if (!hasDept && !hasItem) return; // incomplete — silently drop
      const name = row && typeof row.name === 'string' ? row.name.trim() : '';
      cleaned.push({
        sequence: idx + 1,
        name,
        departmentId: clean(row.departmentId),
        departmentName: clean(row.departmentName),
        divisionId: clean(row.divisionId),
        divisionName: clean(row.divisionName),
        sectionId: clean(row.sectionId),
        sectionName: clean(row.sectionName),
        outputItemId: clean(row.outputItemId),
      });
    });
    if (cleaned.length === 0) return cleaned;

    // Phase 2: validate every row's output item and department.
    const seenItems = new Map<string, number>(); // outputItemId → first row index (0-based)

    for (let i = 0; i < cleaned.length; i++) {
      const row = cleaned[i];
      const stepLabel = `Step ${i + 1}${row.name ? ` ('${row.name}')` : ''}`;

      // --- Output Item validation ---
      const outId = row.outputItemId;
      if (outId) {
        if (!UUID_RE.test(outId)) {
          throw new BadRequestException(`${stepLabel} has an invalid Output Item ID.`);
        }
        const outItem = await this.itemRepository.findOne({ where: { id: outId, companyId: ctx.companyId } });
        if (!outItem) {
          throw new BadRequestException(`${stepLabel} Output Item '${outId}' does not exist in this company.`);
        }
        if (outItem.status !== ItemStatus.ACTIVE) {
          throw new BadRequestException(`${stepLabel} Output Item '${outItem.itemCode}' is not ACTIVE.`);
        }

        // Cycle detection: same item at two different stages = A → B → A.
        if (seenItems.has(outId)) {
          throw new BadRequestException(
            `Circular production route detected — Output Item '${outItem.itemCode}' appears at both Stage ${seenItems.get(outId)! + 1} and Stage ${i + 1}.`,
          );
        }
        seenItems.set(outId, i);
      } else {
        // Row has a department but no item — the item is still missing at this
        // stage. This is allowed during authoring (partial rows) but the backend
        // still needs the item for the stage to be valid. Reject on save.
        if (row.departmentId) {
          // Department-only row with no item: if it was explicitly sent by the
          // client (name provided), reject; otherwise silently drop.
          if (row.name) {
            throw new BadRequestException(`${stepLabel} must have an Output Item selected.`);
          }
          // No name and no item — incomplete row, remove from output.
          cleaned.splice(i, 1);
          i--; // re-adjust index
          continue;
        }
      }

      // --- Department validation + authoritative overwrite ---
      if (row.departmentId) {
        if (!UUID_RE.test(row.departmentId)) {
          throw new BadRequestException(`${stepLabel} has an invalid department ID.`);
        }
        const dept = await this.departmentRepository.findOne({ where: { id: row.departmentId } });
        if (!dept) {
          throw new BadRequestException(`${stepLabel} references a department that does not exist.`);
        }
        // Authoritative overwrite: the real department's metadata always wins.
        row.departmentName = dept.name ?? null;
        row.divisionId = (dept as any).divisionId ?? null;
        row.sectionId = (dept as any).sectionId ?? null;
      } else {
        // No department: clear any client-supplied descriptive fields.
        row.departmentName = null;
        row.divisionId = null;
        row.divisionName = null;
        row.sectionId = null;
        row.sectionName = null;
      }

      // --- Operation name: auto-derive from department when empty ---
      if (!row.name && row.departmentName) {
        row.name = row.departmentName;
      }

      // Re-index sequence after any splicing.
      row.sequence = i + 1;
    }

    // Resolve section/division names from the real entities.
    for (const row of cleaned) {
      if (row.sectionId && !row.sectionName) {
        const sec = await this.sectionRepository.findOne({ where: { id: row.sectionId } });
        row.sectionName = sec?.name ?? null;
      }
      if (row.divisionId && !row.divisionName) {
        const div = await this.divisionRepository.findOne({ where: { id: row.divisionId } });
        row.divisionName = div?.name ?? null;
      }
    }

    return cleaned;
  }

  private extractProcesses(source: Record<string, any>): {
    process1?: string | null;
    process2?: string | null;
    process3?: string | null;
    process4?: string | null;
    process5?: string | null;
    process6?: string | null;
    processes?: { sequence: number; name: string }[];
  } {
    let procArray: { sequence: number; name: string }[] | undefined;
    if (Array.isArray(source.processes)) {
      procArray = source.processes
        .filter((p: any) => p && (typeof p === 'string' ? p.trim() : (p.name && String(p.name).trim())))
        .map((p: any, idx: number) => ({
          sequence: typeof p.sequence === 'number' ? p.sequence : (idx + 1),
          name: typeof p === 'string' ? p.trim() : String(p.name).trim(),
          // TASK 15: carry through the configured PROCESS/DEPARTMENT + OUTPUT ITEM
          // relationship so the JSONB row is the authoritative route.
          departmentId: typeof p === 'object' && p.departmentId != null ? p.departmentId : undefined,
          departmentName: typeof p === 'object' && p.departmentName != null ? p.departmentName : undefined,
          divisionId: typeof p === 'object' && p.divisionId != null ? p.divisionId : undefined,
          divisionName: typeof p === 'object' && p.divisionName != null ? p.divisionName : undefined,
          sectionId: typeof p === 'object' && p.sectionId != null ? p.sectionId : undefined,
          sectionName: typeof p === 'object' && p.sectionName != null ? p.sectionName : undefined,
          outputItemId: typeof p === 'object' && p.outputItemId != null ? p.outputItemId : undefined,
        }));
    }

    const p1 = source.process1 ?? source['process 1'] ?? source.process_1 ?? source['Process 1'];
    const p2 = source.process2 ?? source['process 2'] ?? source.process_2 ?? source['Process 2'];
    const p3 = source.process3 ?? source['process 3'] ?? source.process_3 ?? source['Process 3'];
    const p4 = source.process4 ?? source['process 4'] ?? source.process_4 ?? source['Process 4'];
    const p5 = source.process5 ?? source['process 5'] ?? source.process_5 ?? source['Process 5'];
    const p6 = source.process6 ?? source['process 6'] ?? source.process_6 ?? source['Process 6'];

    if (procArray !== undefined) {
      return {
        process1: procArray[0]?.name ?? null,
        process2: procArray[1]?.name ?? null,
        process3: procArray[2]?.name ?? null,
        process4: procArray[3]?.name ?? null,
        process5: procArray[4]?.name ?? null,
        process6: procArray[5]?.name ?? null,
        processes: procArray,
      };
    }

    const hasAnyScalar = [p1, p2, p3, p4, p5, p6].some(p => p !== undefined);
    if (!hasAnyScalar) {
      return {};
    }

    const list: { sequence: number; name: string }[] = [];
    [p1, p2, p3, p4, p5, p6].forEach((p, idx) => {
      if (p && typeof p === 'string' && p.trim()) {
        list.push({ sequence: idx + 1, name: p.trim() });
      }
    });

    return {
      ...(p1 !== undefined ? { process1: p1 } : {}),
      ...(p2 !== undefined ? { process2: p2 } : {}),
      ...(p3 !== undefined ? { process3: p3 } : {}),
      ...(p4 !== undefined ? { process4: p4 } : {}),
      ...(p5 !== undefined ? { process5: p5 } : {}),
      ...(p6 !== undefined ? { process6: p6 } : {}),
      processes: list,
    };
  }

  private normalizeDtoAliases(dto: Record<string, any>): void {
    if (dto.diameterMm === undefined) {
      const d = dto.diameter ?? dto.Diameter ?? dto.diameter_mm;
      if (d !== undefined && d !== null && d !== '') {
        dto.diameterMm = Number(d);
      }
    }
    if (dto.lengthPerPiece === undefined) {
      const l = dto.length ?? dto.Length ?? dto.length_per_piece;
      if (l !== undefined && l !== null && l !== '') {
        dto.lengthPerPiece = Number(l);
      }
    }
    // Backward compatibility: If diameter is set and wireSizeMm is not set, sync wireSizeMm
    if (dto.diameterMm !== undefined && dto.diameterMm !== null && (dto.wireSizeMm === undefined || dto.wireSizeMm === null)) {
      dto.wireSizeMm = dto.diameterMm;
    }
  }

  private cleanProcessAliases(target: Record<string, any>): void {
    const aliases = [
      'process 1', 'Process 1', 'process_1',
      'process 2', 'Process 2', 'process_2',
      'process 3', 'Process 3', 'process_3',
      'process 4', 'Process 4', 'process_4',
      'process 5', 'Process 5', 'process_5',
      'process 6', 'Process 6', 'process_6',
      'diameter', 'Diameter', 'diameter_mm',
      'length', 'Length', 'length_per_piece',
    ];
    for (const a of aliases) {
      delete target[a];
    }
  }

  /**
   * TASK: Production Flow — Previous → Current → Next
   * Returns the complete dynamic production flow for the given item,
   * deriving everything from the actual database relationships.
   */
  async getProductionFlow(itemId: string): Promise<{
    previous: {
      id: string; itemCode: string; name: string; itemType: string;
      wireSizeMm: number | null; diameterMm: number | null; thicknessMm: number | null;
      widthMm: number | null; lengthPerPiece: number | null; baseUomId: string | null;
      baseUomName: string | null; departmentId: string | null; departmentName: string | null;
      divisionId: string | null; divisionName: string | null;
      sectionId: string | null; sectionName: string | null;
      sku: string | null; barcode: string | null;
    } | null;
    current: {
      id: string; itemCode: string; name: string; itemType: string; status: string;
      wireSizeMm: number | null; diameterMm: number | null; thicknessMm: number | null;
      widthMm: number | null; lengthPerPiece: number | null;
      weightPerPiece: number | null; weightPerMeter: number | null; piecesPerKg: number | null;
      baseUomId: string | null; baseUomName: string | null;
      departmentId: string | null; departmentName: string | null;
      divisionId: string | null; divisionName: string | null;
      sectionId: string | null; sectionName: string | null;
      sku: string | null; barcode: string | null;
      routeType: string | null; routeTypeId: string | null; routeTypeName: string | null;
      processes: Array<{ sequence: number; name: string }>;
      finalProduct: string | null; packingNextStep: string | null;
    };
    currentOperation: string | null;
    next: {
      items: Array<{
        id: string; itemCode: string; name: string; itemType: string;
        wireSizeMm: number | null; diameterMm: number | null; thicknessMm: number | null;
        widthMm: number | null; lengthPerPiece: number | null; baseUomId: string | null;
        baseUomName: string | null; departmentId: string | null; departmentName: string | null;
        sku: string | null; barcode: string | null;
      }>;
      operationName: string | null;
    };
    fullRoute: Array<{
      stageOrder: number; stageName: string; itemId: string; itemCode: string;
      itemName: string; itemType: string; departmentName: string | null;
      wireSizeMm: number | null; diameterMm: number | null; thicknessMm: number | null;
      widthMm: number | null; lengthPerPiece: number | null; baseUomName: string | null;
      operationName: string | null; isCurrent: boolean;
    }>;
    // TASK 14: fully dynamic stages — one RAW MATERIAL stage followed by a
    // PROCESS + OUTPUT pair per real downstream item in the chain. `itemNumber`
    // is the item position in the resolved flow (distinct from `sequence`).
    stages: Array<{
      sequence: number; itemNumber: number; kind: 'process' | 'output'; stageKey: string; title: string;
      itemId: string | null; itemCode: string | null; itemName: string | null;
      itemType: string | null; wireSizeMm: number | null; diameterMm: number | null;
      thicknessMm: number | null; widthMm: number | null; lengthPerPiece: number | null;
      baseUomName: string | null; departmentId: string | null; departmentName: string | null;
      divisionId: string | null; divisionName: string | null;
      sectionId: string | null; sectionName: string | null;
      operationCode: string | null; operationName: string | null;
      isCurrent: boolean; configured: boolean;
    }>;
    // TASK 14: true when a circular production mapping was detected and the
    // traversal stopped safely.
    cycleDetected: boolean;
    warning: string | null;
  }> {
    const item = await this.itemRepository.findOne({
      where: { id: itemId },
      relations: ['baseUom', 'division', 'section', 'department', 'routeTypeRef', 'productionInItem',
        'productionInItem.baseUom', 'productionInItem.department', 'productionInItem.division', 'productionInItem.section'],
    });
    if (!item) throw new NotFoundException(`Item '${itemId}' not found`);

    const resolveOrg = (it: any) => ({
      departmentId: it.departmentId ?? it.department?.id ?? null,
      departmentName: it.department?.name ?? null,
      divisionId: it.divisionId ?? it.division?.id ?? null,
      divisionName: it.division?.name ?? null,
      sectionId: it.sectionId ?? it.section?.id ?? null,
      sectionName: it.section?.name ?? null,
    });

    const mapItem = (it: any) => ({
      id: it.id,
      itemCode: it.itemCode,
      name: it.name,
      itemType: it.itemType,
      wireSizeMm: it.wireSizeMm ?? null,
      diameterMm: it.diameterMm ?? null,
      thicknessMm: it.thicknessMm ?? null,
      widthMm: it.widthMm ?? null,
      lengthPerPiece: it.lengthPerPiece ?? null,
      baseUomId: it.baseUomId ?? null,
      baseUomName: it.baseUom?.name ?? null,
      sku: it.sku ?? null,
      barcode: it.barcode ?? null,
      ...resolveOrg(it),
    });

    // PREVIOUS: the input material (if any)
    const prevItem = item.productionInItem ?? (item.productionInItemId
      ? await this.itemRepository.findOne({
          where: { id: item.productionInItemId },
          relations: ['baseUom', 'department', 'division', 'section'],
        })
      : null);

    const previous = prevItem ? {
      ...mapItem(prevItem),
      status: prevItem.status,
      weightPerPiece: prevItem.weightPerPiece ?? null,
      weightPerMeter: prevItem.weightPerMeter ?? null,
      piecesPerKg: prevItem.piecesPerKg ?? null,
      routeType: prevItem.routeType ?? null,
      routeTypeId: prevItem.routeTypeId ?? null,
      routeTypeName: prevItem.routeTypeRef?.name ?? prevItem.routeType ?? null,
      processes: prevItem.processes ?? [],
      finalProduct: prevItem.finalProduct ?? null,
      packingNextStep: prevItem.packingNextStep ?? null,
    } : null;

    // CURRENT: the item itself
    this.ensureProcessesArray(item);
    const current = {
      ...mapItem(item),
      status: item.status,
      weightPerPiece: item.weightPerPiece ?? null,
      weightPerMeter: item.weightPerMeter ?? null,
      piecesPerKg: item.piecesPerKg ?? null,
      routeType: item.routeType ?? null,
      routeTypeId: item.routeTypeId ?? null,
      routeTypeName: item.routeTypeRef?.name ?? item.routeType ?? null,
      processes: item.processes ?? [],
      finalProduct: item.finalProduct ?? null,
      packingNextStep: item.packingNextStep ?? null,
    };

    // CURRENT OPERATION: derive from department or processes
    const currentOperation = this.deriveOperationName(item);

    // NEXT: find items whose productionInItemId = current item's id
    const nextItemsRaw = await this.itemRepository.query(
      `SELECT id FROM items WHERE production_in_item_id = $1 AND is_active = true AND id != $1`,
      [itemId],
    );
    const nextItemIds: string[] = nextItemsRaw?.map((r: any) => r.id) ?? [];

    let nextItems: any[] = [];
    let nextOperationName: string | null = null;

    if (nextItemIds.length > 0) {
      const loaded = await this.itemRepository.findByIds(nextItemIds);
      nextItems = loaded.map((ni: any) => ({
        ...mapItem(ni),
      }));
      // Resolve next operation from the first downstream item's department/processes
      if (loaded.length > 0) {
        nextOperationName = this.deriveOperationName(loaded[0]);
      }
    }

    // TASK 12: when the chain has no real downstream item, expose the Item
    // Master's explicit "Packing / Next Step" as the next operation so the flow
    // contract always carries the configured next step.
    if (nextOperationName == null && item.packingNextStep && String(item.packingNextStep).trim()) {
      nextOperationName = String(item.packingNextStep).trim();
    }

    // FULL ROUTE + STAGES.
    // TASK 15: an explicit configured Production Route (processes rows carrying a
    // PROCESS/DEPARTMENT + OUTPUT ITEM) is the AUTHORITATIVE authoring model and
    // ALWAYS wins. The chain-based builder (TASK 14) is only a read-only fallback
    // for legacy records that have no configured route rows.
    const routeRows = this.ensureRouteRows(item.processes);
    let fullRoute: any[] = [];
    let stages: any[] = [];
    let cycleDetected = false;

    if (routeRows.length > 0) {
      const built = await this.buildConfiguredRouteStages(item);
      fullRoute = built.fullRoute;
      stages = built.stages;
      cycleDetected = built.cycleDetected;
    } else {
      const { chain, cycleDetected: cd } = await this.buildRouteChain(item);
      cycleDetected = cd;
      fullRoute = this.mapRouteChain(chain, item.id);
      stages = await this.buildDynamicStages(chain, item.id);
    }

    return {
      previous: previous ? {
        id: previous.id,
        itemCode: previous.itemCode,
        name: previous.name,
        itemType: previous.itemType,
        wireSizeMm: previous.wireSizeMm,
        diameterMm: previous.diameterMm,
        thicknessMm: previous.thicknessMm,
        widthMm: previous.widthMm,
        lengthPerPiece: previous.lengthPerPiece,
        baseUomId: previous.baseUomId,
        baseUomName: previous.baseUomName,
        departmentId: previous.departmentId,
        departmentName: previous.departmentName,
        divisionId: previous.divisionId,
        divisionName: previous.divisionName,
        sectionId: previous.sectionId,
        sectionName: previous.sectionName,
        sku: previous.sku,
        barcode: previous.barcode,
      } : null,
      current,
      currentOperation,
      next: {
        items: nextItems,
        operationName: nextOperationName,
      },
      fullRoute,
      stages,
      cycleDetected,
      warning: cycleDetected ? 'Production flow cycle detected.' : null,
    };
  }

  /**
   * TASK 15 (revised): Build `fullRoute` + `stages` from the item's explicitly
   * configured Production Route rows. ONE flow stage per configured row (step =
   * item number). Each row's Output Item is resolved against the REAL Item Master;
   * rows without an Output Item render as "—" / Not configured instead of
   * fabricating an item.
   *
   * Department, section, and division on each stage come from the ROUTE ROW
   * (authoritative — written by validateRouteRows from the real department
   * entity), NOT from the item's own org hierarchy. The stage title falls back
   * to the department name and then to "STEP NN" when no operation name is set.
   *
   * Returns cycleDetected = true when any output item appears at more than one
   * stage (should not happen after validateRouteRows, but guarded here for
   * robustness).
   */
  private async buildConfiguredRouteStages(item: any): Promise<{ fullRoute: any[]; stages: any[]; cycleDetected: boolean }> {
    const rows = this.ensureRouteRows(item.processes);
    if (rows.length === 0) return { fullRoute: [], stages: [], cycleDetected: false };

    const outputItemIds = Array.from(new Set(rows.map((r) => r.outputItemId).filter((id) => typeof id === 'string' && id)));
    const loaded = outputItemIds.length
      ? await this.itemRepository.find({
          where: { id: In(outputItemIds) },
          relations: ['baseUom', 'department', 'division', 'section'],
        })
      : [];
    const itemsById: Record<string, any> = { [item.id]: item };
    for (const it of loaded) itemsById[it.id] = it;

    const mapStageItem = (it: any) => {
      if (!it) {
        return {
          itemId: null, itemCode: null, itemName: null, itemType: null,
          wireSizeMm: null, diameterMm: null, thicknessMm: null, widthMm: null,
          lengthPerPiece: null, baseUomName: null,
          departmentId: null, departmentName: null,
          divisionId: null, divisionName: null, sectionId: null, sectionName: null,
          barcode: null, sku: null,
        };
      }
      return {
        itemId: it.id,
        itemCode: it.itemCode,
        itemName: it.name,
        itemType: it.itemType,
        wireSizeMm: it.wireSizeMm ?? null,
        diameterMm: it.diameterMm ?? null,
        thicknessMm: it.thicknessMm ?? null,
        widthMm: it.widthMm ?? null,
        lengthPerPiece: it.lengthPerPiece ?? null,
        baseUomName: it.baseUom?.name ?? null,
        departmentId: it.departmentId ?? it.department?.id ?? null,
        departmentName: it.department?.name ?? null,
        divisionId: it.divisionId ?? it.division?.id ?? null,
        divisionName: it.division?.name ?? null,
        sectionId: it.sectionId ?? it.section?.id ?? null,
        sectionName: it.section?.name ?? null,
        barcode: it.barcode ?? null,
        sku: it.sku ?? null,
      };
    };

    const fullRoute: any[] = [];
    const stages: any[] = [];
    let cycleDetected = false;
    const seenItemIds = new Set<string>();

    rows.forEach((row, idx) => {
      const outItem = row.outputItemId ? itemsById[row.outputItemId] ?? null : null;
      const itemInfo = mapStageItem(outItem);

      // Department + section + division come from the ROUTE ROW (authoritative),
      // falling back to the item's own org hierarchy when the row lacks them.
      const departmentId = row.departmentId ?? itemInfo.departmentId ?? null;
      const departmentName = row.departmentName ?? itemInfo.departmentName ?? null;
      const divisionId = row.divisionId ?? itemInfo.divisionId ?? null;
      const divisionName = row.divisionName ?? itemInfo.divisionName ?? null;
      const sectionId = row.sectionId ?? itemInfo.sectionId ?? null;
      const sectionName = row.sectionName ?? itemInfo.sectionName ?? null;

      // Operation name: row.name → dept name → empty (title fallback handled below).
      const operationName = row.name || departmentName || '';
      const isCurrent = Boolean(row.outputItemId && row.outputItemId === item.id);
      const configured = Boolean(row.departmentId && outItem);

      // Stage title: operation name → "STEP NN" fallback — never empty.
      const stepLabel = `STEP ${String(idx + 1).padStart(2, '0')}`;
      const title = operationName ? String(operationName).toUpperCase() : stepLabel;

      // Cycle detection (belt-and-suspenders — validateRouteRows already rejects
      // duplicates, but detect + flag for the preview warning).
      if (row.outputItemId) {
        if (seenItemIds.has(row.outputItemId)) cycleDetected = true;
        seenItemIds.add(row.outputItemId);
      }

      fullRoute.push({
        stageOrder: row.sequence,
        stageName: row.name || departmentName || stepLabel,
        itemId: outItem?.id ?? null,
        itemCode: outItem?.itemCode ?? null,
        itemName: outItem?.name ?? null,
        itemType: outItem?.itemType ?? null,
        departmentId,
        departmentName,
        divisionId,
        divisionName,
        sectionId,
        sectionName,
        wireSizeMm: outItem?.wireSizeMm ?? null,
        diameterMm: outItem?.diameterMm ?? null,
        thicknessMm: outItem?.thicknessMm ?? null,
        widthMm: outItem?.widthMm ?? null,
        lengthPerPiece: outItem?.lengthPerPiece ?? null,
        baseUomName: outItem?.baseUom?.name ?? null,
        operationName,
        operationCode: departmentId,
        barcode: outItem?.barcode ?? null,
        sku: outItem?.sku ?? null,
        isCurrent,
      });

      stages.push({
        sequence: idx + 1,
        itemNumber: idx + 1,
        kind: 'process',
        stageKey: `route-${row.sequence}`,
        title,
        ...itemInfo,
        departmentId,
        departmentName,
        divisionId,
        divisionName,
        sectionId,
        sectionName,
        operationCode: departmentId,
        operationName,
        isCurrent,
        configured,
      });
    });

    return { fullRoute, stages, cycleDetected };
  }

  /**
   * TASK 14: resolve the operation name from REAL configured data only.
   * Order of authority: item processes → department name → route type.
   * No hardcoded operation names (no PVC Extrusion / Spiral Winding / Wire
   * Flattening keyword substitutions).
   */
  private deriveOperationName(item: any): string | null {
    if (item.processes && Array.isArray(item.processes) && item.processes.length > 0) {
      const name = item.processes[0]?.name;
      if (name && typeof name === 'string' && name.trim()) return name.trim();
    }
    if (item.process1) {
      const name = String(item.process1).trim();
      if (name) return name;
    }
    const deptName = item.department?.name ?? null;
    if (deptName && typeof deptName === 'string' && deptName.trim()) return deptName.trim();
    if (item.routeTypeRef?.name && typeof item.routeTypeRef.name === 'string' && item.routeTypeRef.name.trim()) {
      return item.routeTypeRef.name.trim();
    }
    if (item.routeType && typeof item.routeType === 'string' && item.routeType.trim()) return item.routeType.trim();
    return null;
  }

  /**
   * Operation performed AT a route stage (the operation that produced the item,
   * i.e. the department/operation of the stage the item reaches). Resolved from
   * REAL data only: department name (verbatim) → item processes (last) → route
   * type. No keyword-driven fallbacks.
   */
  private deriveStageOperationName(item: any): string | null {
    const deptName = item.department?.name ?? null;
    if (deptName && typeof deptName === 'string' && deptName.trim()) return deptName.trim();
    if (item.processes && Array.isArray(item.processes) && item.processes.length > 0) {
      const name = item.processes[item.processes.length - 1]?.name;
      if (name && typeof name === 'string' && name.trim()) return name.trim();
    }
    if (item.process1) {
      const name = String(item.process1).trim();
      if (name) return name;
    }
    if (item.routeTypeRef?.name && typeof item.routeTypeRef.name === 'string' && item.routeTypeRef.name.trim()) {
      return item.routeTypeRef.name.trim();
    }
    if (item.routeType && typeof item.routeType === 'string' && item.routeType.trim()) return item.routeType.trim();
    return null;
  }

  /**
   * TASK 14: Walk the authoritative production chain both directions
   * (upstream raw materials → current item → downstream consumers).
   * Cycle-safe: every visited Item ID is tracked; if a mapping references an
   * already-visited Item the walk stops and `cycleDetected` is set true so the
   * UI can surface "Production flow cycle detected." without freezing.
   */
  private async buildRouteChain(item: any): Promise<{ chain: any[]; cycleDetected: boolean }> {
    const chain: any[] = [];
    const seen = new Set<string>();
    let cycleDetected = false;

    // Walk upstream (previous items) — a back-edge to the root `item` or a
    // repeat of an already-collected parent is a circular mapping.
    let probe: any = item;
    const upstream: any[] = [];
    while (probe && probe.productionInItemId) {
      const nextId = probe.productionInItemId;
      if (nextId === item.id || upstream.some((u: any) => u.id === nextId) || nextId === probe.id) {
        cycleDetected = true;
        break;
      }
      const parent = await this.itemRepository.findOne({
        where: { id: nextId },
        relations: ['department', 'baseUom'],
      });
      if (!parent) break;
      upstream.unshift(parent);
      probe = parent;
    }

    // Build chain: upstream + current + downstream
    chain.push(...upstream);
    chain.push(item);
    upstream.forEach((u: any) => seen.add(u.id));
    seen.add(item.id);

    // Walk downstream (items that consume this item). A repeat of an
    // already-visited item (A → B → A) stops traversal and flags a cycle.
    let current = item;
    for (let hops = 0; hops < 25; hops++) {
      const children = await this.itemRepository.query(
        `SELECT id FROM items WHERE production_in_item_id = $1 AND is_active = true AND id != $1 LIMIT 5`,
        [current.id],
      );
      if (!children || children.length === 0) break;
      for (const child of children) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        const childItem = await this.itemRepository.findOne({
          where: { id: child.id },
          relations: ['department', 'baseUom'],
        });
        if (childItem) chain.push(childItem);
      }
      const nextChild = children[0];
      if (!nextChild) break;
      if (seen.has(nextChild.id)) {
        cycleDetected = true;
        break;
      }
      current = await this.itemRepository.findOne({ where: { id: nextChild.id }, relations: ['department', 'baseUom'] });
      if (!current) break;
    }

    if (chain.length > 100) cycleDetected = true; // hard safety bound

    return { chain, cycleDetected };
  }

  private mapRouteChain(chain: any[], currentItemId: string): Array<{
    stageOrder: number; stageName: string; itemId: string; itemCode: string;
    itemName: string; itemType: string; departmentName: string | null;
    wireSizeMm: number | null; diameterMm: number | null; thicknessMm: number | null;
    widthMm: number | null; lengthPerPiece: number | null; baseUomName: string | null;
    operationName: string | null; isCurrent: boolean;
  }> {
    return chain.map((it: any, idx: number) => {
      const deptName = it.department?.name ?? null;
      const isRootRawMaterial = !it.productionInItemId && idx === 0;
      let stageName: string;
      if (isRootRawMaterial) {
        stageName = 'RAW MATERIAL';
      } else if (it.itemType === 'FINISHED_GOOD') {
        stageName = 'FINISHED GOOD';
      } else if (deptName && typeof deptName === 'string' && deptName.trim()) {
        stageName = deptName.trim().toUpperCase();
      } else if (it.processes?.length > 0 && it.processes[0]?.name?.trim()) {
        stageName = String(it.processes[0].name).trim().toUpperCase();
      } else if (it.routeTypeRef?.name?.trim()) {
        stageName = String(it.routeTypeRef.name).trim().toUpperCase();
      } else if (it.routeType?.trim()) {
        stageName = String(it.routeType).trim().toUpperCase();
      } else {
        stageName = 'MANUFACTURING';
      }
      return {
        stageOrder: idx + 1,
        stageName,
        itemId: it.id,
        itemCode: it.itemCode,
        itemName: it.name,
        itemType: it.itemType,
        departmentName: deptName,
        wireSizeMm: it.wireSizeMm ?? null,
        diameterMm: it.diameterMm ?? null,
        thicknessMm: it.thicknessMm ?? null,
        widthMm: it.widthMm ?? null,
        lengthPerPiece: it.lengthPerPiece ?? null,
        baseUomName: it.baseUom?.name ?? null,
        // A root raw-material intake stage has no performed operation.
        operationName: isRootRawMaterial ? null : this.deriveStageOperationName(it),
        isCurrent: it.id === currentItemId,
      };
    });
  }

  /**
   * Resolve the ACTIVE operation record (code + name) performed in a
   * department, so stage cards can display machine-readable operation codes.
   */
  private async resolveOperationForDepartment(
    departmentId: string | null,
  ): Promise<{ operationCode: string | null; operationName: string | null }> {
    if (!departmentId) return { operationCode: null, operationName: null };
    try {
      const rows = await this.itemRepository.query(
        `SELECT operation_code, operation_name FROM operations
         WHERE department_id = $1 AND status = 'ACTIVE'
         ORDER BY operation_code LIMIT 1`,
        [departmentId],
      );
      if (rows && rows.length > 0) {
        return { operationCode: rows[0].operation_code, operationName: rows[0].operation_name };
      }
    } catch (err: any) {
      this.logger.warn(`Could not resolve operation for department ${departmentId}: ${err?.message}`);
    }
    return { operationCode: null, operationName: null };
  }

  /**
   * TASK 14: Build the production-flow stages from the ACTUAL resolved chain.
   *
   * Stage model (fully dynamic — no fixed six-stage template, no hardcoded
   * FLATTENING / SPIRAL stages):
   *   · the chain root RAW MATERIAL emits a single process stage (no operation
   *     is performed at intake);
   *   · every subsequent real item in the chain emits a PROCESS stage (the
   *     operation that produced it, resolved from its department / processes /
   *     route) followed by an OUTPUT stage carrying that item's code and
   *     specification.
   * STEP and ITEM numbers are generated from the resolved sequence. The
   * current Item always stays the OUTPUT of its stage. If the chain's leaf has
   * no real downstream mapping, the Item Master's explicit "Packing / Next
   * Step" and "Final Product" text (real configured data) is appended when
   * non-empty. Missing operations are reported with operationName=null so the
   * UI can show "Not configured" WITHOUT fabricating a stage.
   */
  private async buildDynamicStages(chain: any[], currentItemId: string): Promise<Array<{
    sequence: number; itemNumber: number; kind: 'process' | 'output'; stageKey: string; title: string;
    itemId: string | null; itemCode: string | null; itemName: string | null;
    itemType: string | null; wireSizeMm: number | null; diameterMm: number | null;
    thicknessMm: number | null; widthMm: number | null; lengthPerPiece: number | null;
    baseUomName: string | null; departmentId: string | null; departmentName: string | null;
    divisionId: string | null; divisionName: string | null;
    sectionId: string | null; sectionName: string | null;
    operationCode: string | null; operationName: string | null;
    isCurrent: boolean; configured: boolean;
  }>> {
    const opCache = new Map<string, { operationCode: string | null; operationName: string | null }>();
    const opFor = async (it: any): Promise<{ operationCode: string | null; operationName: string | null }> => {
      if (!it) return { operationCode: null, operationName: null };
      let opName: string | null = null;
      let opCode: string | null = null;
      const deptId = it.departmentId ?? it.department?.id ?? null;
      if (deptId) {
        if (!opCache.has(deptId)) opCache.set(deptId, await this.resolveOperationForDepartment(deptId));
        const resolved = opCache.get(deptId)!;
        if (resolved.operationName) {
          opName = resolved.operationName;
          opCode = resolved.operationCode;
        }
      }
      if (!opName) opName = this.deriveStageOperationName(it);
      return { operationCode: opCode, operationName: opName };
    };

    const makeStage = (
      sequence: number,
      kind: 'process' | 'output',
      stageKey: string,
      title: string,
      it: any | null,
      op: { operationCode: string | null; operationName: string | null } | null,
      configuredOverride?: boolean,
    ) => {
      const resolvedOp = op ?? { operationCode: null, operationName: null };
      const operationName = resolvedOp.operationName;
      return {
        sequence,
        itemNumber: sequence,
        kind,
        stageKey,
        title,
        itemId: it?.id ?? null,
        itemCode: it?.itemCode ?? null,
        itemName: it?.name ?? null,
        itemType: it?.itemType ?? null,
        wireSizeMm: it?.wireSizeMm ?? null,
        diameterMm: it?.diameterMm ?? null,
        thicknessMm: it?.thicknessMm ?? null,
        widthMm: it?.widthMm ?? null,
        lengthPerPiece: it?.lengthPerPiece ?? null,
        baseUomName: it?.baseUom?.name ?? null,
        departmentId: it?.departmentId ?? it?.department?.id ?? null,
        departmentName: it?.department?.name ?? null,
        divisionId: it?.divisionId ?? it?.division?.id ?? null,
        divisionName: it?.division?.name ?? null,
        sectionId: it?.sectionId ?? it?.section?.id ?? null,
        sectionName: it?.section?.name ?? null,
        operationCode: resolvedOp.operationCode ?? null,
        operationName,
        isCurrent: !!it && it.id === currentItemId,
        configured: configuredOverride !== undefined ? configuredOverride : !!it,
      };
    };

    const slug = (it: any, idx: number): string => {
      const base = it?.id ? String(it.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) : `n${idx}`;
      return base || `n${idx}`;
    };

    const stages: any[] = [];
    let sequence = 0;

    for (let i = 0; i < chain.length; i++) {
      const it = chain[i];
      const isRootRaw = !it.productionInItemId && i === 0;

      if (isRootRaw) {
        sequence += 1;
        stages.push(makeStage(sequence, 'process', 'RAW_MATERIAL', 'RAW MATERIAL', it, null));
        continue;
      }

      const op = await opFor(it);
      const opTitle =
        (op.operationName && String(op.operationName).trim())
          ? String(op.operationName).trim().toUpperCase()
          : (this.deriveStageOperationName(it) ? String(this.deriveStageOperationName(it)).trim().toUpperCase() : '')
          ;
      const baseTitle = opTitle || (it.itemType === 'FINISHED_GOOD' ? 'FINISHED GOOD' : 'MANUFACTURING');
      const s = slug(it, i);

      sequence += 1;
      stages.push(makeStage(sequence, 'process', `OP_${s}`, baseTitle, it, op, !!op.operationName));

      sequence += 1;
      stages.push(makeStage(sequence, 'output', `OUTPUT_${s}`, `${baseTitle} OUTPUT`, it, null));
    }

    // Explicit "Packing / Next Step" + "Final Product" text (real Item Master
    // fields) appended ONLY at the true leaf with no downstream mapping.
    const leaf = chain[chain.length - 1];
    if (leaf && chain.length > 0) {
      const packingNextStep =
        leaf.packingNextStep != null && String(leaf.packingNextStep).trim()
          ? String(leaf.packingNextStep).trim()
          : null;
      const finalProduct =
        leaf.finalProduct != null && String(leaf.finalProduct).trim()
          ? String(leaf.finalProduct).trim()
          : null;

      if (packingNextStep) {
        sequence += 1;
        stages.push(makeStage(
          sequence,
          'process',
          'NEXT_STEP',
          String(packingNextStep).toUpperCase(),
          leaf,
          { operationCode: null, operationName: packingNextStep },
        ));
      }
      if (finalProduct) {
        sequence += 1;
        stages.push(makeStage(
          sequence,
          'output',
          'FINAL_PRODUCT',
          'FINAL PRODUCT',
          { ...leaf, itemCode: null, name: finalProduct },
          null,
        ));
      }
    }

    return stages;
  }

  /**
   * Generate a QR code data URL for an item.
   */
  async getQrCode(itemId: string): Promise<{ dataUrl: string; payload: string; url: string }> {
    const QRCode = (await import('qrcode')).default;
    const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
    const payload = `/master-data/items?entityId=${itemId}`;
    const url = `${FRONTEND_URL}${payload}`;
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#000000', light: '#ffffff' },
    });
    return { dataUrl, payload, url };
  }

  private ensureProcessesArray(item: Item): void {
    if (!item) return;
    if (item.processes && Array.isArray(item.processes) && item.processes.length > 0) {
      return;
    }
    const list: { sequence: number; name: string }[] = [];
    const scalars = [item.process1, item.process2, item.process3, item.process4, item.process5, item.process6];
    scalars.forEach((val, idx) => {
      if (val && typeof val === 'string' && val.trim()) {
        list.push({ sequence: idx + 1, name: val.trim() });
      }
    });
    item.processes = list;
  }
}
