import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { randomUUID } from 'crypto';
import { Item, ItemStatus } from '../entities';
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
    const syncedOut = await this.resolveProductionFlowMapping(dto.companyId, dto.productionInItemId, newItemId);

    const rt = await this.resolveRouteType(dto.companyId, dto.routeTypeId, dto.routeType);

    // Auto-generate SKU if not provided
    const sku = dto.sku || await this.generateSku(dto.companyId, dto.itemCode);

    // Auto-generate Barcode if not provided
    const barcode = dto.barcode || await this.generateBarcode();

    this.normalizeDtoAliases(dto as any);
    const processes = this.extractProcesses(dto as any);
    const cleanDto = { ...dto, ...processes };
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
    const effectiveInItemId = dto.productionInItemId !== undefined ? dto.productionInItemId : item.productionInItemId;
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
    stages: Array<{
      sequence: number; kind: 'process' | 'output'; stageKey: string; title: string;
      itemId: string | null; itemCode: string | null; itemName: string | null;
      itemType: string | null; wireSizeMm: number | null; diameterMm: number | null;
      thicknessMm: number | null; widthMm: number | null; lengthPerPiece: number | null;
      baseUomName: string | null; departmentId: string | null; departmentName: string | null;
      operationCode: string | null; operationName: string | null;
      isCurrent: boolean; configured: boolean;
    }>;
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

    // FULL ROUTE: walk the chain both directions
    const chain = await this.buildRouteChain(item);
    const fullRoute = this.mapRouteChain(chain, item.id);

    // PROMPT-35: exactly six production-flow stages (RAW → FLATTENING → SPIRAL,
    // each with its output/specification block), derived from the real chain.
    const stages = await this.buildSixStageFlow(chain, item.id);

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
    };
  }

  private deriveOperationName(item: any): string | null {
    if (item.processes && Array.isArray(item.processes) && item.processes.length > 0) {
      return item.processes[0]?.name ?? null;
    }
    if (item.process1) return item.process1;
    const deptName = item.department?.name ?? null;
    if (deptName) {
      const lower = deptName.toLowerCase();
      if (lower.includes('pvc')) return 'PVC Extrusion';
      if (lower.includes('spiral')) return 'Spiral Winding';
      if (lower.includes('flatten') || lower.includes('flat')) return 'Wire Flattening';
      if (lower.includes('pack')) return 'Packing';
      if (lower.includes('drawing')) return 'Wire Drawing';
      return deptName;
    }
    if (item.routeTypeRef?.name) return item.routeTypeRef.name;
    if (item.routeType) return item.routeType;
    return null;
  }

  /**
   * Operation performed AT a route stage. An item's own `processes[0]`
   * describes the operation that consumes its INPUT, so for stage cards the
   * department-derived operation (what happens in this stage's department)
   * is the accurate label; item processes are the fallback.
   */
  private deriveStageOperationName(item: any): string | null {
    const deptName = item.department?.name ?? null;
    if (deptName) {
      const lower = deptName.toLowerCase();
      if (lower.includes('pvc')) return 'PVC Extrusion';
      if (lower.includes('spiral')) return 'Spiral Winding';
      if (lower.includes('flatten') || lower.includes('flat')) return 'Wire Flattening';
      if (lower.includes('pack')) return 'Packing';
      if (lower.includes('drawing')) return 'Wire Drawing';
      return deptName;
    }
    if (item.processes && Array.isArray(item.processes) && item.processes.length > 0) {
      return item.processes[item.processes.length - 1]?.name ?? null;
    }
    if (item.process1) return item.process1;
    if (item.routeTypeRef?.name) return item.routeTypeRef.name;
    if (item.routeType) return item.routeType;
    return null;
  }

  private async buildRouteChain(item: any): Promise<any[]> {
    const chain: any[] = [];
    const seen = new Set<string>();

    // Walk upstream (previous items)
    let probe: any = item;
    const upstream: any[] = [];
    while (probe && probe.productionInItemId && !seen.has(probe.productionInItemId)) {
      seen.add(probe.productionInItemId);
      const parent = await this.itemRepository.findOne({
        where: { id: probe.productionInItemId },
        relations: ['department', 'baseUom'],
      });
      if (!parent) break;
      upstream.unshift(parent);
      probe = parent;
    }

    // Build chain: upstream + current + downstream
    chain.push(...upstream);
    chain.push(item);
    seen.add(item.id);

    // Walk downstream (items that consume this item)
    let current = item;
    for (let hops = 0; hops < 20; hops++) {
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
      // Follow the first child for further traversal
      const nextChild = children[0];
      if (!nextChild || seen.has(nextChild.id)) break;
      current = await this.itemRepository.findOne({ where: { id: nextChild.id }, relations: ['department', 'baseUom'] });
      if (!current) break;
    }

    return chain;
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
      let stageName = 'MANUFACTURING';
      const isRootRawMaterial = !it.productionInItemId && idx === 0;
      if (isRootRawMaterial) {
        stageName = 'RAW MATERIAL';
      } else if (it.itemType === 'FINISHED_GOOD') {
        stageName = 'FINISHED GOOD';
      } else if (deptName) {
        const lower = deptName.toLowerCase();
        if (lower.includes('pvc')) stageName = 'PVC EXTRUSION';
        else if (lower.includes('spiral')) stageName = 'SPIRAL WINDING';
        else if (lower.includes('flatten') || lower.includes('flat')) stageName = 'WIRE FLATTENING';
        else if (lower.includes('pack')) stageName = 'PACKING';
        else if (lower.includes('drawing')) stageName = 'WIRE DRAWING';
        else stageName = deptName.toUpperCase();
      } else if (it.processes?.length > 0) {
        stageName = it.processes[0].name.toUpperCase();
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

  private classifyRouteItem(it: any): 'RAW' | 'FLATTENING' | 'SPIRAL' | 'OTHER' {
    const op = (this.deriveStageOperationName(it) ?? '').toLowerCase();
    const dept = (it.department?.name ?? '').toLowerCase();
    if (dept.includes('spiral') || op.includes('spiral')) return 'SPIRAL';
    if (dept.includes('flatten') || dept.includes('flat') || op.includes('flatten')) return 'FLATTENING';
    return 'OTHER';
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
   * PROMPT-35: Build exactly six production-flow stages (01-06):
   *   01 RAW MATERIAL (process block)
   *   02 RAW MATERIAL SPECIFICATION (item/size block)
   *   03 FLATTENING (process block)
   *   04 FLATTENING OUTPUT (item/size block)
   *   05 SPIRAL (process block)
   *   06 SPIRAL OUTPUT (item/size block)
   * Every field is derived from the real chain + operations master; nothing is
   * hard-coded.  Stages with no matching item are emitted with configured=false
   * so the UI can render "Not configured".
   */
  private async buildSixStageFlow(chain: any[], currentItemId: string): Promise<Array<{
    sequence: number; kind: 'process' | 'output'; stageKey: string; title: string;
    itemId: string | null; itemCode: string | null; itemName: string | null;
    itemType: string | null; wireSizeMm: number | null; diameterMm: number | null;
    thicknessMm: number | null; widthMm: number | null; lengthPerPiece: number | null;
    baseUomName: string | null; departmentId: string | null; departmentName: string | null;
    operationCode: string | null; operationName: string | null;
    isCurrent: boolean; configured: boolean;
  }>> {
    const rawItem = chain[0] ?? null;

    let flattenItem: any | null = null;
    let spiralItem: any | null = null;
    for (const it of chain) {
      const cls = this.classifyRouteItem(it);
      if (cls === 'FLATTENING' && !flattenItem) flattenItem = it;
      if (cls === 'SPIRAL' && !spiralItem) spiralItem = it;
    }

    const opCache = new Map<string, { operationCode: string | null; operationName: string | null }>();
    const opFor = async (it: any): Promise<{ operationCode: string | null; operationName: string | null }> => {
      if (!it) return { operationCode: null, operationName: null };
      const deptId = it.departmentId ?? it.department?.id ?? null;
      if (!deptId) return { operationCode: null, operationName: this.deriveStageOperationName(it) };
      if (!opCache.has(deptId)) opCache.set(deptId, await this.resolveOperationForDepartment(deptId));
      return opCache.get(deptId)!;
    };

    const stage = (
      sequence: number,
      kind: 'process' | 'output',
      stageKey: string,
      title: string,
      it: any | null,
      op: { operationCode: string | null; operationName: string | null } | null,
    ) => ({
      sequence,
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
      operationCode: op?.operationCode ?? null,
      operationName: op?.operationName ?? null,
      isCurrent: !!it && it.id === currentItemId,
      configured: !!it,
    });

    const rawIsRoot = rawItem && !rawItem.productionInItemId;
    const rawOp = rawIsRoot
      ? { operationCode: null, operationName: null }
      : await opFor(rawItem);

    return [
      stage(1, 'process', 'RAW_MATERIAL', 'RAW MATERIAL', rawItem, rawOp),
      stage(2, 'output', 'RAW_SPEC', 'RAW MATERIAL SPECIFICATION', rawItem, null),
      stage(3, 'process', 'FLATTENING', 'FLATTENING', flattenItem, await opFor(flattenItem)),
      stage(4, 'output', 'FLATTENING_OUTPUT', 'FLATTENING OUTPUT', flattenItem, null),
      stage(5, 'process', 'SPIRAL', 'SPIRAL', spiralItem, await opFor(spiralItem)),
      stage(6, 'output', 'SPIRAL_OUTPUT', 'SPIRAL OUTPUT', spiralItem, null),
    ];
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
