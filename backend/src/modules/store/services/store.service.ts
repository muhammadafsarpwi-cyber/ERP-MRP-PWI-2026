import { Injectable, NotFoundException, BadRequestException, ForbiddenException, InternalServerErrorException, HttpException, Inject, Optional, forwardRef, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, IsNull } from 'typeorm';
import { Store } from '../entities/store.entity';
import { StoreItem } from '../entities/store-item.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialIssue } from '../entities/material-issue.entity';
import { MaterialReturn } from '../entities/material-return.entity';
import { MaterialRequestLine } from '../entities/material-request-line.entity';
import { MaterialIssueLine } from '../entities/material-issue-line.entity';
import { MaterialReturnLine } from '../entities/material-return-line.entity';
import {
  CreateStoreDto,
  UpdateStoreDto,
  CreateMaterialRequestDto,
  UpdateMaterialRequestDto,
  CreateMaterialIssueDto,
  CreateMaterialReturnDto,
} from '../dto/store.dto';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { PurchaseRequisitionService } from '../../procurement/services/purchase-requisition.service';
import {
  applyDivisionScopeFilter,
  assertDivisionInScope,
  narrowWhereByDivision,
  DivisionAccess,
} from '../../../common/division-scope.util';
import { Department } from '../../organization/entities/department.entity';
import { Item, UomConversion } from '../../item/entities';
import { InventoryBalance, InventoryPolicy } from '../../inventory/entities';
import { ToolLifecycleService } from '../../machine-tooling/services/tool-lifecycle.service';

@Injectable()
export class StoreService implements OnModuleInit {
  private readonly logger = new Logger(StoreService.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(StoreItem)
    private readonly storeItemRepo: Repository<StoreItem>,
    @InjectRepository(MaterialRequest)
    private readonly materialRequestRepo: Repository<MaterialRequest>,
    @InjectRepository(MaterialRequestLine)
    private readonly materialRequestLineRepo: Repository<MaterialRequestLine>,
    @InjectRepository(MaterialIssue)
    private readonly materialIssueRepo: Repository<MaterialIssue>,
    @InjectRepository(MaterialIssueLine)
    private readonly materialIssueLineRepo: Repository<MaterialIssueLine>,
    @InjectRepository(MaterialReturn)
    private readonly materialReturnRepo: Repository<MaterialReturn>,
    @InjectRepository(MaterialReturnLine)
    private readonly materialReturnLineRepo: Repository<MaterialReturnLine>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    private readonly stockLedgerService: StockLedgerService,
    private readonly inventoryBalanceService: InventoryBalanceService,
    private readonly prService: PurchaseRequisitionService,
    @Optional()
    @Inject(forwardRef(() => ToolLifecycleService))
    private readonly toolLifecycleService?: ToolLifecycleService,
  ) {}

  async onModuleInit() {
    try {
      // Read-only check first so we NEVER acquire an ACCESS EXCLUSIVE lock on stock_ledger at startup when already updated
      const defRows = await this.materialIssueRepo.manager.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'stock_ledger'::regclass AND conname = 'stock_ledger_transaction_type_check'`,
      );
      const currentDef = String(defRows?.[0]?.def || '');
      if (!currentDef.includes('MATERIAL_ISSUE') || !currentDef.includes('SCRAP_DISPOSAL')) {
        await this.materialIssueRepo.manager.query(
          `ALTER TABLE stock_ledger DROP CONSTRAINT IF EXISTS stock_ledger_transaction_type_check`,
        );
        await this.materialIssueRepo.manager.query(
          `ALTER TABLE stock_ledger ADD CONSTRAINT stock_ledger_transaction_type_check CHECK (transaction_type IN (
            'RECEIPT','GOODS_RECEIPT','ISSUE','MATERIAL_ISSUE','MATERIAL_RETURN','MATERIAL_RETURN_SCRAP','SCRAP_DISPOSAL',
            'TRANSFER_OUT','TRANSFER_IN','ADJUSTMENT_IN','ADJUSTMENT_OUT','OPENING','RETURN_IN','RETURN_OUT',
            'SALES_DELIVERY','SALES_RETURN','PRODUCTION_RECEIPT','PRODUCTION_ISSUE','PRODUCTION_SCRAP',
            'PRODUCTION_CONSUMPTION','PRODUCTION_REVERSAL'
          ))`,
        );
      }

      const colRows = await this.materialIssueRepo.manager.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'material_issues' AND column_name IN ('issued_by_name', 'operator_name', 'shift_incharge_name')`,
      );
      if ((colRows?.length || 0) < 3) {
        await this.materialIssueRepo.manager.query(
          `ALTER TABLE material_issues
             ADD COLUMN IF NOT EXISTS issued_by_name VARCHAR(150),
             ADD COLUMN IF NOT EXISTS operator_name VARCHAR(150),
             ADD COLUMN IF NOT EXISTS shift_incharge_name VARCHAR(150)`,
        );
      }
      // Standardize legacy MI- Store Issue prefixes to SIN- across material_issues, stock_ledger, and component_changes
      await this.materialIssueRepo.manager.query(
        `UPDATE material_issues mi
            SET issue_number = REGEXP_REPLACE(mi.issue_number, '^MI-', 'SIN-')
          WHERE mi.issue_number LIKE 'MI-%'
            AND NOT EXISTS (
              SELECT 1 FROM material_issues m2
               WHERE m2.company_id = mi.company_id
                 AND m2.issue_number = REGEXP_REPLACE(mi.issue_number, '^MI-', 'SIN-')
            )`,
      );
      await this.materialIssueRepo.manager.query(
        `UPDATE stock_ledger
            SET reference_number = CASE WHEN reference_number LIKE 'MI-%' THEN REGEXP_REPLACE(reference_number, '^MI-', 'SIN-') ELSE reference_number END,
                notes = CASE WHEN notes LIKE '%MI-%' THEN REGEXP_REPLACE(notes, 'MI-(\\d{8}-\\d+)', 'SIN-\\1', 'g') ELSE notes END
          WHERE reference_number LIKE 'MI-%' OR notes ~ 'MI-\\d{8}-\\d+'`,
      );
      await this.materialIssueRepo.manager.query(
        `UPDATE component_changes
            SET reason = CASE WHEN reason ~ 'MI-\\d{8}-\\d+' THEN REGEXP_REPLACE(reason, 'MI-(\\d{8}-\\d+)', 'SIN-\\1', 'g') ELSE reason END,
                remarks = CASE WHEN remarks ~ 'MI-\\d{8}-\\d+' THEN REGEXP_REPLACE(remarks, 'MI-(\\d{8}-\\d+)', 'SIN-\\1', 'g') ELSE remarks END,
                mounting_sessions = CASE WHEN mounting_sessions::text ~ 'MI-\\d{8}-\\d+' THEN REGEXP_REPLACE(mounting_sessions::text, 'MI-(\\d{8}-\\d+)', 'SIN-\\1', 'g')::jsonb ELSE mounting_sessions END
          WHERE reason ~ 'MI-\\d{8}-\\d+' OR remarks ~ 'MI-\\d{8}-\\d+' OR mounting_sessions::text ~ 'MI-\\d{8}-\\d+'`,
      );

      this.logger.log('Verified stock_ledger transaction_type constraint and material_issues schema.');
    } catch (err: any) {
      this.logger.warn(`Store schema verification skipped: ${err?.message || err}`);
    }
  }

  // ==================== STORE MASTER ====================

  /**
   * Enforce record-level company scoping for by-ID lookups. A user can only
   * see / operate on store records belonging to the company they are scoped to.
   * When companyId is provided (server-derived, never client-supplied) a record
   * from another company is rejected outright.
   */
  private assertCompanyOwned(record: { companyId?: string | null }, companyId?: string, resource = 'Store record'): void {
    if (companyId && record.companyId && record.companyId !== companyId) {
      throw new ForbiddenException(`${resource} belongs to a different company`);
    }
  }

  /**
   * PROMPT #27 — record-level DIVISION scoping, the second axis of isolation
   * after company ownership above.
   *
   * `stores`, `material_requests`, `material_issues` and `material_returns` all
   * carry a real `division_id` column, so they are genuinely division-scoped
   * and the caller's effective scope (resolved server-side from the auth
   * context) is enforced on both the list queries and every by-id lookup.
   *
   * `store_items` have no `division_id` of their own — they inherit their
   * parent store's (see `findStoreItems`).
   */
  private assertDivisionOwned(
    record: { divisionId?: string | null },
    allowedDivisionIds: DivisionAccess | undefined,
  ): void {
    assertDivisionInScope(record.divisionId, allowedDivisionIds);
  }

  async findAllStores(
    companyId: string,
    query?: { status?: string; divisionId?: string; sectionId?: string; departmentId?: string; search?: string },
    allowedDivisionIds?: DivisionAccess,
  ) {
    const qb = this.storeRepo.createQueryBuilder('s')
      .where('s.company_id = :companyId', { companyId });

    if (query?.status) {
      qb.andWhere('s.status = :status', { status: query.status });
    }
    if (query?.divisionId) {
      // Client-supplied display filter. `DivisionScopeGuard` has already
      // refused it with 403 when it names a division the caller does not hold,
      // and the clause below guarantees the result can never exceed the
      // caller's own scope.
      qb.andWhere('s.division_id = :divisionId', { divisionId: query.divisionId });
    }
    if (query?.sectionId) {
      qb.andWhere('s.section_id = :sectionId', { sectionId: query.sectionId });
    }
    if (query?.departmentId) {
      qb.andWhere('s.department_id = :departmentId', { departmentId: query.departmentId });
    }
    // PROMPT #27 — this is what makes the list safe when the client omits
    // `divisionId` entirely. Not `includeUnassigned`: a store with no division
    // is not inside any restricted caller's permitted set.
    applyDivisionScopeFilter(qb as any, 's.division_id', allowedDivisionIds);
    if (query?.search) {
      qb.andWhere('(LOWER(s.store_code) LIKE LOWER(:search) OR LOWER(s.store_name) LIKE LOWER(:search))', { search: `%${query.search}%` });
    }

    return qb.orderBy('s.store_name', 'ASC').getMany();
  }

  async findStoreById(id: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const store = await this.storeRepo.findOne({ where: { id } });
    if (!store) throw new NotFoundException(`Store ${id} not found`);
    this.assertCompanyOwned(store, companyId);
    this.assertDivisionOwned(store, allowedDivisionIds);
    return store;
  }

  async createStore(dto: CreateStoreDto, userId: string) {
    if (!dto.companyId) {
      throw new BadRequestException('Company ID is required to create a store');
    }
    const existing = await this.storeRepo.findOne({ where: { companyId: dto.companyId, storeCode: dto.storeCode } });
    if (existing) throw new BadRequestException(`Store code "${dto.storeCode}" already exists`);

    const store = this.storeRepo.create({
      ...dto,
      divisionId: dto.divisionId || null,
      sectionId: dto.sectionId || null,
      departmentId: dto.departmentId || null,
      warehouseId: dto.warehouseId || null,
      createdBy: userId,
    });
    return this.storeRepo.save(store);
  }

  async updateStore(id: string, dto: UpdateStoreDto, userId: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const store = await this.findStoreById(id, companyId, allowedDivisionIds);
    if (dto.storeCode && dto.storeCode !== store.storeCode) {
      const existing = await this.storeRepo.findOne({ where: { companyId: store.companyId, storeCode: dto.storeCode } });
      if (existing && existing.id !== id) {
        throw new BadRequestException(`Store code "${dto.storeCode}" already exists`);
      }
      store.storeCode = dto.storeCode;
    }
    const { storeCode: _sc, companyId: _cid, ...rest } = dto;
    Object.assign(store, {
      ...rest,
      divisionId: rest.divisionId !== undefined ? (rest.divisionId || null) : store.divisionId,
      sectionId: rest.sectionId !== undefined ? (rest.sectionId || null) : store.sectionId,
      departmentId: rest.departmentId !== undefined ? (rest.departmentId || null) : store.departmentId,
      warehouseId: rest.warehouseId !== undefined ? (rest.warehouseId || null) : store.warehouseId,
      updatedBy: userId,
    });
    return this.storeRepo.save(store);
  }

  async deleteStore(id: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const store = await this.findStoreById(id, companyId, allowedDivisionIds);
    store.status = 'INACTIVE';
    return this.storeRepo.save(store);
  }

  // ==================== STORE ITEMS ====================

  async findStoreItems(
    storeId: string,
    query?: { search?: string; status?: string; includeFinishedGoods?: boolean },
    companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ) {
    const store = await this.storeRepo.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException(`Store ${storeId} not found`);
    this.assertCompanyOwned(store, companyId);
    // PROMPT #27 — `store_items` have no `division_id`; they belong to a
    // division through `store_id`. Asserting on the parent closes the indirect
    // path (TEST E — guessing another division's store id).
    this.assertDivisionOwned(store, allowedDivisionIds);
    const qb = this.storeItemRepo.createQueryBuilder('si');
    if (typeof (qb as any).leftJoin === 'function' && typeof (qb as any).addSelect === 'function') {
      qb.leftJoin('si.store', 's')
        .addSelect(['s.id', 's.storeCode', 's.storeName', 's.storeType', 's.warehouseId', 's.divisionId', 's.companyId'])
        .where('si.store_id = :storeId', { storeId });
    } else {
      qb.leftJoinAndSelect('si.store', 's')
        .where('si.store_id = :storeId', { storeId });
    }

    if (query?.status) {
      qb.andWhere('si.status = :status', { status: query.status });
    }

    const rawItems = await qb.getMany();
    const explicitItemIds = new Set(rawItems.map((i) => i.itemId).filter(Boolean));

    const isGeneralStore = String(store.storeType || '').toUpperCase() === 'GENERAL';
    const excludedManufacturingTypes = [
      'RAW_MATERIAL',
      'FINISHED_GOOD',
      'WORK_IN_PROGRESS',
      'SEMI_FINISHED',
    ];

    // Auto-discover General Store items from Item Master (strictly is_store_item = true) + any items with live balances in store.warehouseId
    const autoItemIds: string[] = [];
    if (isGeneralStore) {
      try {
        const gsRows = await this.storeRepo.manager.query(
          `SELECT id FROM items
           WHERE is_active = true
             AND is_store_item = true
             AND UPPER(COALESCE(item_type, 'OTHER')) <> ALL($1)
             AND ($2::uuid IS NULL OR division_id IS NULL OR division_id = $2::uuid)`,
          [excludedManufacturingTypes, store.divisionId || null],
        );
        gsRows.forEach((r: any) => {
          if (r.id && !explicitItemIds.has(r.id)) autoItemIds.push(r.id);
        });
      } catch {
        // fallback gracefully
      }
    }

    if (store.warehouseId) {
      try {
        const balItemRows = await this.storeRepo.manager.query(
          `SELECT DISTINCT ib.item_id
           FROM inventory_balances ib
           INNER JOIN items i ON i.id = ib.item_id
           WHERE ib.warehouse_id = $1
             AND ib.on_hand <> 0
             AND ($2::boolean = false OR (i.is_store_item = true AND UPPER(COALESCE(i.item_type, 'OTHER')) <> ALL($3)))`,
          [store.warehouseId, isGeneralStore, excludedManufacturingTypes],
        );
        balItemRows.forEach((r: any) => {
          if (r.item_id && !explicitItemIds.has(r.item_id) && !autoItemIds.includes(r.item_id)) {
            autoItemIds.push(r.item_id);
          }
        });
      } catch {
        // fallback gracefully
      }
    }

    const itemIds = Array.from(new Set([...explicitItemIds, ...autoItemIds]));
    if (itemIds.length === 0) return [];

    let detailMap = new Map<string, any>();
    let balanceMap = new Map<string, { onHand: number; available: number }>();

    if (itemIds.length > 0) {
      try {
        const placeholders = itemIds.map((_, idx) => `$${idx + 1}`).join(', ');
        const itemDetails = await this.storeRepo.manager.query(
          `SELECT i.id, i.item_code, i.name, i.item_type, i.is_store_item, i.storage_location,
                  i.minimum_stock_level, i.reorder_level, i.maximum_stock_level,
                  u.code as uom_code, u.name as uom_name, ic.name as category_name
           FROM items i
           LEFT JOIN uoms u ON u.id = i.base_uom_id
           LEFT JOIN item_categories ic ON ic.id = i.category_id
           WHERE i.id IN (${placeholders})`,
          itemIds,
        );
        detailMap = new Map<string, any>(itemDetails.map((d: any) => [d.id, d]));
      } catch (err) {
        // Fallback gracefully if items query fails
      }

      if (store.warehouseId) {
        try {
          const placeholders = itemIds.map((_, idx) => `$${idx + 2}`).join(', ');
          const balances = await this.storeRepo.manager.query(
            `SELECT item_id, COALESCE(SUM(on_hand), 0)::numeric as on_hand, COALESCE(SUM(available), 0)::numeric as available
             FROM inventory_balances
             WHERE warehouse_id = $1 AND item_id IN (${placeholders})
             GROUP BY item_id`,
            [store.warehouseId, ...itemIds],
          );
          balances.forEach((b: any) => {
            balanceMap.set(b.item_id, {
              onHand: parseFloat(b.on_hand || '0'),
              available: parseFloat(b.available || '0'),
            });
          });
        } catch (err) {
          // Fallback gracefully if balance query fails
        }
      }
    }

    const mappedExplicit = rawItems.map(rec => {
      const d = detailMap.get(rec.itemId);
      const b = balanceMap.get(rec.itemId);
      return {
        ...rec,
        locationDetail: rec.locationDetail || d?.storage_location || null,
        item: d
          ? {
              id: d.id,
              itemCode: d.item_code,
              name: d.name,
              itemType: d.item_type,
              isStoreItem: Boolean(d.is_store_item),
              storageLocation: d.storage_location || null,
              categoryName: d.category_name,
              uomCode: d.uom_code,
              uomName: d.uom_name,
            }
          : null,
        onHandStock: b ? b.onHand : 0,
        availableStock: b ? b.available : 0,
      };
    });

    const mappedAuto = autoItemIds
      .filter((id) => detailMap.has(id))
      .map((id) => {
        const d = detailMap.get(id);
        const b = balanceMap.get(id);
        return {
          id: `auto-${storeId}-${id}`,
          storeId,
          itemId: id,
          store,
          bin: null,
          rack: null,
          shelf: null,
          locationDetail: d.storage_location || null,
          minimumStock: Number(d.minimum_stock_level || 0),
          minStock: Number(d.minimum_stock_level || 0),
          reorderLevel: Number(d.reorder_level || 0),
          maximumStock: Number(d.maximum_stock_level || 0),
          maxStock: Number(d.maximum_stock_level || 0),
          status: 'ACTIVE',
          item: {
            id: d.id,
            itemCode: d.item_code,
            name: d.name,
            itemType: d.item_type,
            isStoreItem: Boolean(d.is_store_item),
            storageLocation: d.storage_location || null,
            categoryName: d.category_name,
            uomCode: d.uom_code,
            uomName: d.uom_name,
          },
          onHandStock: b ? b.onHand : 0,
          availableStock: b ? b.available : 0,
        };
      });

    let results: any[] = [...mappedExplicit, ...mappedAuto];

    if (isGeneralStore) {
      results = results.filter(
        r =>
          Boolean(r.item?.isStoreItem) &&
          !excludedManufacturingTypes.includes(String(r.item?.itemType || '').toUpperCase()),
      );
    } else if (!query?.includeFinishedGoods) {
      results = results.filter(r => r.item?.itemType !== 'FINISHED_GOOD');
    }

    if (query?.search) {
      const s = query.search.toLowerCase();
      results = results.filter(r =>
        (r.item?.itemCode && r.item.itemCode.toLowerCase().includes(s)) ||
        (r.item?.name && r.item.name.toLowerCase().includes(s)) ||
        (r.bin && r.bin.toLowerCase().includes(s)) ||
        (r.rack && r.rack.toLowerCase().includes(s)) ||
        (r.shelf && r.shelf.toLowerCase().includes(s)) ||
        (r.locationDetail && r.locationDetail.toLowerCase().includes(s))
      );
    }

    return results;
  }

  async findStoreItemById(id: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const item = await this.storeItemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Store item ${id} not found`);
    if (companyId) {
      const store = await this.storeRepo.findOne({ where: { id: item.storeId } });
      if (!store) throw new NotFoundException(`Store ${item.storeId} not found`);
      this.assertCompanyOwned(store, companyId);
      this.assertDivisionOwned(store, allowedDivisionIds);
    }
    return item;
  }

  async createStoreItem(storeId: string, itemId: string, dto: Partial<StoreItem> & { reorderPoint?: number }, userId: string, companyId?: string) {
    const store = await this.storeRepo.findOne({ where: { id: storeId } });
    if (!store) throw new NotFoundException(`Store ${storeId} not found`);
    this.assertCompanyOwned(store, companyId);
    const existing = await this.storeItemRepo.findOne({ where: { storeId, itemId } });
    if (existing) throw new BadRequestException(`Item already exists in this store`);

    const itemRows = await this.storeRepo.manager.query(
      `SELECT id, item_type, name FROM items WHERE id = $1 LIMIT 1`,
      [itemId],
    );
    if (itemRows?.[0]?.item_type === 'FINISHED_GOOD') {
      throw new BadRequestException(
        `Finished Good "${itemRows[0].name}" cannot be added to Store Items. Store manages Raw Materials, Spare Parts, Tools, and Consumables.`,
      );
    }

    const { reorderPoint, ...restDto } = dto as any;
    const normalizedReorder = restDto.reorderLevel ?? reorderPoint;
    const storeItem = this.storeItemRepo.create({
      storeId,
      itemId,
      ...restDto,
      ...(normalizedReorder !== undefined ? { reorderLevel: normalizedReorder } : {}),
      createdBy: userId,
    });
    return this.storeItemRepo.save(storeItem);
  }

  async updateStoreItem(id: string, dto: Partial<StoreItem> & { reorderPoint?: number }, userId: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const item = await this.findStoreItemById(id, companyId, allowedDivisionIds);
    const { reorderPoint, ...restDto } = dto as any;
    const normalizedReorder = restDto.reorderLevel ?? reorderPoint;
    Object.assign(
      item,
      restDto,
      normalizedReorder !== undefined ? { reorderLevel: normalizedReorder } : {},
      { updatedBy: userId },
    );
    const saved = await this.storeItemRepo.save(item);
    // Two-way sync back to Item Master
    await this.storeRepo.manager.query(
      `UPDATE items
       SET storage_location = COALESCE($2, storage_location),
           minimum_stock_level = COALESCE($3, minimum_stock_level),
           reorder_level = COALESCE($4, reorder_level),
           maximum_stock_level = COALESCE($5, maximum_stock_level),
           updated_by = $6,
           updated_at = NOW()
       WHERE id = $1`,
      [
        item.itemId,
        restDto.locationDetail !== undefined ? restDto.locationDetail : null,
        restDto.minStock !== undefined ? Number(restDto.minStock) : null,
        normalizedReorder !== undefined ? Number(normalizedReorder) : null,
        restDto.maxStock !== undefined ? Number(restDto.maxStock) : null,
        userId || null,
      ],
    );
    return saved;
  }

  async syncStoreItemInline(
    itemId: string,
    body: {
      storeId?: string;
      locationDetail?: string | null;
      minStock?: number;
      reorderLevel?: number;
      maxStock?: number;
    },
    userId: string,
    companyId?: string,
  ) {
    // 1. Update Item Master directly
    const itemSets: string[] = ['updated_at = NOW()'];
    const itemParams: any[] = [itemId];
    let pIdx = 2;

    if (body.locationDetail !== undefined) {
      itemSets.push(`storage_location = $${pIdx++}`);
      itemParams.push(body.locationDetail === '' ? null : body.locationDetail);
    }
    if (body.minStock !== undefined) {
      itemSets.push(`minimum_stock_level = $${pIdx++}`);
      itemParams.push(Number(body.minStock || 0));
    }
    if (body.reorderLevel !== undefined) {
      itemSets.push(`reorder_level = $${pIdx++}`);
      itemParams.push(Number(body.reorderLevel || 0));
    }
    if (body.maxStock !== undefined) {
      itemSets.push(`maximum_stock_level = $${pIdx++}`);
      itemParams.push(Number(body.maxStock || 0));
    }
    if (userId) {
      itemSets.push(`updated_by = $${pIdx++}`);
      itemParams.push(userId);
    }

    await this.storeRepo.manager.query(
      `UPDATE items SET ${itemSets.join(', ')} WHERE id = $1`,
      itemParams,
    );

    // 2. Upsert StoreItem record(s) so Store Items & Item Master stay 100% in sync
    if (body.storeId) {
      let storeItem = await this.storeItemRepo.findOne({
        where: { storeId: body.storeId, itemId },
      });
      if (!storeItem) {
        storeItem = this.storeItemRepo.create({
          companyId: companyId || undefined,
          storeId: body.storeId,
          itemId,
          status: 'ACTIVE',
          createdBy: userId,
        } as Partial<StoreItem>);
      }
      if (body.locationDetail !== undefined) storeItem.locationDetail = body.locationDetail || null;
      if (body.minStock !== undefined) storeItem.minimumStock = Number(body.minStock || 0);
      if (body.reorderLevel !== undefined) storeItem.reorderLevel = Number(body.reorderLevel || 0);
      if (body.maxStock !== undefined) storeItem.maximumStock = Number(body.maxStock || 0);
      storeItem.updatedBy = userId;
      await this.storeItemRepo.save(storeItem);
    } else {
      // Update any existing store_items rows for this itemId
      const existingRows = await this.storeItemRepo.find({ where: { itemId } });
      for (const si of existingRows) {
        if (body.locationDetail !== undefined) si.locationDetail = body.locationDetail || null;
        if (body.minStock !== undefined) si.minimumStock = Number(body.minStock || 0);
        if (body.reorderLevel !== undefined) si.reorderLevel = Number(body.reorderLevel || 0);
        if (body.maxStock !== undefined) si.maximumStock = Number(body.maxStock || 0);
        si.updatedBy = userId;
        await this.storeItemRepo.save(si);
      }
    }

    return { success: true, itemId };
  }

  // ==================== MATERIAL REQUESTS ====================

  async findAllMaterialRequests(
    companyId: string,
    query?: {
      status?: string;
      storeId?: string;
      departmentId?: string;
      mine?: boolean;
      userId?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      limit?: number | string;
      page?: number | string;
      allDates?: boolean | string;
    },
    allowedDivisionIds?: DivisionAccess,
  ) {
    const qb = this.materialRequestRepo.createQueryBuilder('mr')
      .where('mr.company_id = :companyId', { companyId });

    if (query?.status) {
      qb.andWhere('mr.status = :status', { status: query.status });
    }
    if (query?.storeId) {
      qb.andWhere('mr.store_id = :storeId', { storeId: query.storeId });
    }
    if (query?.departmentId) {
      qb.andWhere('mr.department_id = :departmentId', { departmentId: query.departmentId });
    }
    if (query?.mine && query.userId) {
      qb.andWhere('mr.created_by = :userId', { userId: query.userId });
    }
    if (query?.dateFrom) {
      qb.andWhere('mr.created_at >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query?.dateTo) {
      qb.andWhere('mr.created_at <= :dateTo', { dateTo: query.dateTo });
    }
    if (query?.search?.trim()) {
      qb.andWhere('(mr.request_number ILIKE :search OR mr.remarks ILIKE :search)', {
        search: `%${query.search.trim()}%`,
      });
    }

    const hasExplicitRange = Boolean(
      query?.dateFrom || query?.dateTo || query?.status || query?.search?.trim() ||
      query?.allDates === true || query?.allDates === 'true',
    );
    if (!hasExplicitRange) {
      const recentSince = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      qb.andWhere(
        "(mr.created_at >= :recentSince OR mr.status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED'))",
        { recentSince },
      );
    }
    // PROMPT #27 — `material_requests.division_id` is a real column, so the
    // request list is genuinely division-scoped.
    applyDivisionScopeFilter(qb as any, 'mr.division_id', allowedDivisionIds);

    qb.loadRelationCountAndMap('mr.lineCount', 'mr.lines', 'lines')
      .orderBy('mr.created_at', 'DESC');

    const safeLimit = Math.min(Math.max(Number(query?.limit) || 200, 1), 500);
    if (typeof (qb as any).take === 'function') {
      (qb as any).take(safeLimit);
    }
    if (query?.page && typeof (qb as any).skip === 'function') {
      const safePage = Math.max(Number(query.page) || 1, 1);
      (qb as any).skip((safePage - 1) * safeLimit);
    }

    return qb.getMany();
  }

  async findMaterialRequestById(id: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const request = await this.materialRequestRepo.findOne({
      where: { id },
      relations: ['lines'],
      order: { lines: { lineNumber: 'ASC' } },
    });
    if (!request) throw new NotFoundException(`Material request ${id} not found`);
    this.assertCompanyOwned(request, companyId, 'Material request');
    this.assertDivisionOwned(request, allowedDivisionIds);
    const enriched = await this.enrichRequestLines(request);
    return enriched;
  }

  private async enrichRequestLines(request: MaterialRequest) {
    if (!request.lines || request.lines.length === 0) return request;
    const store = request.storeId ? await this.storeRepo.findOne({ where: { id: request.storeId } }) : null;

    // Batch the availability lookup: one query for every line that needs it,
    // instead of one getAvailableStock() round-trip PER LINE (classic N+1).
    const needsLookup: MaterialRequestLine[] = [];
    if (store?.warehouseId) {
      for (const line of request.lines) {
        if (Number(line.availableStock || 0) <= 0 && line.itemId) needsLookup.push(line);
      }
    }
    if (needsLookup.length) {
      const pairs = needsLookup.map((line) => ({ itemId: line.itemId, warehouseId: store!.warehouseId! }));
      try {
        const balances = await this.inventoryBalanceService.findBalancesForItemWarehousePairs(
          request.companyId, pairs,
        );
        const availableByItem = new Map<string, number>();
        for (const b of balances) {
          availableByItem.set(
            b.itemId,
            (availableByItem.get(b.itemId) || 0) + (Number(b.onHand) - Number(b.reserved)),
          );
        }
        // No balance row ⇒ 0 (same as the per-line lookup); a failed batch keeps
        // whatever the line already carried rather than wiping it to zero.
        for (const line of needsLookup) {
          line.availableStock = availableByItem.get(line.itemId) ?? 0;
        }
      } catch {
        for (const line of needsLookup) line.availableStock = line.availableStock || 0;
      }
    }

    for (const line of request.lines) {
      const requestedQty = Number(line.requestedQuantity || 0);
      const prCreated = Number(line.prCreatedQty || 0);
      const issued = Number(line.issuedQuantity || 0);

      line.currentShortage = Math.max(requestedQty - Number(line.availableStock || 0), 0);
      line.prRemainingQty = Math.max(requestedQty - prCreated, 0);

      if (line.prStatus === 'NONE' && prCreated > 0) {
        line.prStatus = requestedQty > prCreated ? 'PARTIALLY_CONVERTED' : 'FULLY_CONVERTED';
      }
      if (issued > 0 && line.prStatus === 'NONE') {
        line.prStatus = 'ISSUED';
      }
    }

    return request;
  }

  async createMaterialRequest(dto: CreateMaterialRequestDto, userId: string) {
    const request = this.materialRequestRepo.create({
      ...dto,
      lines: undefined,
      createdBy: userId,
    });
    const saved = await this.materialRequestRepo.save(request);

    if (dto.lines && dto.lines.length > 0) {
      await this.saveRequestLines(saved.id, dto.lines);
    }

    return this.findMaterialRequestById(saved.id);
  }

  async updateMaterialRequest(id: string, dto: UpdateMaterialRequestDto, userId: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const request = await this.findMaterialRequestById(id, companyId, allowedDivisionIds);
    if (request.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT requests can be edited');
    }

    const { lines, ...header } = dto;
    Object.assign(request, header, { updatedBy: userId });
    await this.materialRequestRepo.save(request);

    if (lines && lines.length > 0) {
      await this.materialRequestLineRepo.delete({ requestId: id });
      await this.saveRequestLines(id, lines);
    }

    return this.findMaterialRequestById(id, companyId, allowedDivisionIds);
  }

  private async saveRequestLines(requestId: string, lines: CreateMaterialRequestDto['lines'], manager?: EntityManager) {
    const repo = manager ? manager.getRepository(MaterialRequestLine) : this.materialRequestLineRepo;
    const savedLines: MaterialRequestLine[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = repo.create({
        requestId,
        lineNumber: i + 1,
        itemId: lines[i].itemId,
        requestedQuantity: lines[i].requestedQuantity,
        uomId: lines[i].uomId,
        batchId: lines[i].batchId || null,
        requiredDate: lines[i].requiredDate || null,
        availableStock: lines[i].availableStock || 0,
        minimumStock: lines[i].minimumStock || 0,
        maximumStock: lines[i].maximumStock || 0,
        currentShortage: lines[i].currentShortage || 0,
        remarks: lines[i].remarks || null,
      });
      savedLines.push(await repo.save(line));
    }
    return savedLines;
  }

  async submitMaterialRequest(id: string, userId: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const request = await this.findMaterialRequestById(id, companyId, allowedDivisionIds);
    if (request.status !== 'DRAFT') throw new BadRequestException('Only DRAFT requests can be submitted');
    if (!request.lines || request.lines.length === 0) {
      throw new BadRequestException('Cannot submit a request with no line items');
    }
    request.status = 'SUBMITTED';
    request.submittedBy = userId;
    request.submittedAt = new Date();
    return this.materialRequestRepo.save(request);
  }

  async approveMaterialRequest(id: string, userId: string, remarks?: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const request = await this.findMaterialRequestById(id, companyId, allowedDivisionIds);
    if (request.status !== 'SUBMITTED') throw new BadRequestException('Only SUBMITTED requests can be approved');

    if (request.createdBy && request.createdBy === userId) {
      throw new BadRequestException('You cannot approve your own request (segregation of duties)');
    }

    request.status = 'APPROVED';
    request.approvedBy = userId;
    request.approvedAt = new Date();
    if (remarks) request.remarks = remarks;
    return this.materialRequestRepo.save(request);
  }

  async gmApproveMaterialRequest(id: string, userId: string, remarks?: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const request = await this.findMaterialRequestById(id, companyId, allowedDivisionIds);
    if (request.status !== 'APPROVED') {
      throw new BadRequestException('Only manager-APPROVED requests can be GM approved');
    }
    if (request.createdBy && request.createdBy === userId) {
      throw new BadRequestException('You cannot GM-approve your own request (segregation of duties)');
    }
    if (request.approvedBy && request.approvedBy === userId) {
      throw new BadRequestException('Manager and GM approver cannot be the same person');
    }

    request.gmApprovedBy = userId;
    request.gmApprovedAt = new Date();
    if (remarks) request.remarks = remarks;
    return this.materialRequestRepo.save(request);
  }

  async rejectMaterialRequest(id: string, userId: string, remarks?: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const request = await this.findMaterialRequestById(id, companyId, allowedDivisionIds);
    if (request.status !== 'SUBMITTED') throw new BadRequestException('Only SUBMITTED requests can be rejected');

    if (request.createdBy && request.createdBy === userId) {
      throw new BadRequestException('You cannot reject your own request (segregation of duties)');
    }

    request.status = 'REJECTED';
    request.rejectedBy = userId;
    request.rejectedAt = new Date();
    if (remarks) request.remarks = remarks;
    return this.materialRequestRepo.save(request);
  }

  async cancelMaterialRequest(id: string, userId: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const request = await this.findMaterialRequestById(id, companyId, allowedDivisionIds);
    if (!['DRAFT', 'SUBMITTED'].includes(request.status)) throw new BadRequestException('Cannot cancel request in current status');
    request.status = 'CANCELLED';
    request.cancelledBy = userId;
    request.cancelledAt = new Date();
    return this.materialRequestRepo.save(request);
  }

  /**
   * Move a store requisition to the Recycle Bin.
   *
   * Only `DRAFT`, `REJECTED` and `CANCELLED` requests may be trashed. Anything
   * past that point is either feeding a purchase requisition (`pr_id` / `po_id`
   * set) or sits on the approval path an auditor reads; hiding it would strand
   * the downstream procurement documents with no visible parent.
   */
  async removeMaterialRequest(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const request = await this.findMaterialRequestById(id, companyId, allowedDivisionIds);
    if (request.prId || request.poId) {
      throw new BadRequestException(
        'This request was converted to a purchase requisition and cannot be recycled. ' +
          'Cancel the downstream requisition first.',
      );
    }
    if (!['DRAFT', 'REJECTED', 'CANCELLED'].includes(request.status)) {
      throw new BadRequestException(
        `A ${request.status} request is on the approval path and cannot be recycled. ` +
          'Reject or cancel it first.',
      );
    }
    request.deletedAt = new Date();
    request.deletedBy = userId ?? null;
    return this.materialRequestRepo.save(request);
  }

  // ==================== MATERIAL REQUEST -> PR CONVERSION ====================

  async convertRequestToPr(
    id: string,
    userId: string,
    companyId: string,
    dto?: { useShortageOnly?: boolean; lineQuantities?: { lineId: string; quantity: number; estimatedUnitPrice?: number }[] },
    allowedDivisionIds?: DivisionAccess,
  ) {
    const request = await this.findMaterialRequestById(id, companyId, allowedDivisionIds);
    if (!request.lines || request.lines.length === 0) {
      throw new BadRequestException('Request has no line items to convert');
    }
    if (!['APPROVED', 'PARTIALLY_CONVERTED'].includes(request.status)) {
      throw new BadRequestException('Only APPROVED (or partially converted) requests can be converted to PR');
    }
    if (!request.gmApprovedAt) {
      throw new BadRequestException('GM approval is required before converting to PR');
    }
    const isReConversion = 'PARTIALLY_CONVERTED' === request.status;

    const conversionMap = new Map<string, { quantity: number; estimatedUnitPrice?: number }>(
      (dto?.lineQuantities || []).map((l) => [l.lineId, { quantity: l.quantity, estimatedUnitPrice: l.estimatedUnitPrice }]),
    );

    const prLines: any[] = [];
    const lineUpdates: { line: MaterialRequestLine; convertQty: number }[] = [];

    for (const line of request.lines) {
      const requested = Number(line.requestedQuantity || 0);
      const already = Number(line.prCreatedQty || 0);
      const remaining = requested - already;
      const available = Number(line.availableStock || 0);

      // Default to net shortage when useShortageOnly is requested or stock partially covers the MR
      let convertQty = dto?.useShortageOnly || available > 0
        ? Math.max(0, requested - available - already)
        : remaining;
      const override = conversionMap.get(line.id);
      if (override) {
        convertQty = Math.min(Number(override.quantity), remaining);
        if (convertQty < 0) throw new BadRequestException('Conversion quantity cannot be negative');
      }
      if (convertQty <= 0) continue;

      prLines.push({
        lineNumber: line.lineNumber,
        itemId: line.itemId,
        uomId: line.uomId,
        quantity: convertQty,
        estimatedUnitPrice: override?.estimatedUnitPrice,
        requiredDate: line.requiredDate || request.requiredDate || undefined,
        notes: `From material request ${request.requestNumber}`,
      });
      lineUpdates.push({ line, convertQty });
    }

    if (prLines.length === 0) {
      throw new BadRequestException('No remaining quantities to convert');
    }

    const departmentName = request.departmentId
      ? (await this.departmentRepo.findOne({ where: { id: request.departmentId } }))?.name ?? null
      : null;

    const pr = await this.prService.create(
      {
        companyId,
        requisitionCode: isReConversion
          ? `PR-MR-${request.requestNumber}-${Date.now().toString(36).toUpperCase()}`
          : `PR-MR-${request.requestNumber}`,
        title: request.purpose || `Material request ${request.requestNumber}${isReConversion ? ' (re-conversion)' : ''}`,
        department: departmentName ?? undefined,
        requestedDeliveryDate: request.requiredDate || undefined,
        notes: `Created from material request ${request.requestNumber}`,
        lines: prLines,
      },
      userId,
    );

    for (const { line, convertQty } of lineUpdates) {
      const newCreated = Number(line.prCreatedQty || 0) + convertQty;
      const newRemaining = Math.max(Number(line.requestedQuantity || 0) - newCreated, 0);
      await this.materialRequestLineRepo.update(line.id, {
        prCreatedQty: newCreated,
        prRemainingQty: newRemaining,
        prStatus: newRemaining <= 0 ? 'FULLY_CONVERTED' : 'PARTIALLY_CONVERTED',
      });
    }

    const allConverted = request.lines.every((l) => {
      const upd = lineUpdates.find((u) => u.line.id === l.id);
      const finalQty = upd ? Number(l.prCreatedQty || 0) + upd.convertQty : Number(l.prCreatedQty || 0);
      return finalQty >= Number(l.requestedQuantity || 0);
    });

    await this.materialRequestRepo.update(request.id, {
      prId: pr.id,
      prNumber: pr.requisitionCode,
      convertedAt: new Date(),
      convertedBy: userId,
      status: allConverted ? 'FULLY_CONVERTED' : 'PARTIALLY_CONVERTED',
      updatedBy: userId,
    });

    return this.findMaterialRequestById(request.id);
  }

  // ==================== PROCUREMENT / ETA ====================

  async acknowledgeForProcurement(id: string, userId: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const request = await this.findMaterialRequestById(id, companyId, allowedDivisionIds);
    if (!['PARTIALLY_CONVERTED', 'FULLY_CONVERTED'].includes(request.status)) {
      throw new BadRequestException('Request must be converted to PR before procurement acknowledgement');
    }
    request.procurementAcknowledgedBy = userId;
    request.procurementAcknowledgedAt = new Date();
    request.etaPending = true;
    return this.materialRequestRepo.save(request);
  }

  async updateEta(
    id: string,
    userId: string,
    dto: { expectedDeliveryDate?: string; supplierId?: string; supplierConfirmedDate?: string },
    companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ) {
    const request = await this.findMaterialRequestById(id, companyId, allowedDivisionIds);
    if (!['PARTIALLY_CONVERTED', 'FULLY_CONVERTED'].includes(request.status)) {
      throw new BadRequestException('Request must be converted before ETA update');
    }

    if (dto.expectedDeliveryDate) request.expectedDeliveryDate = dto.expectedDeliveryDate;
    if (dto.supplierId) request.supplierId = dto.supplierId;
    if (dto.supplierConfirmedDate) request.supplierConfirmedDate = dto.supplierConfirmedDate;

    const hasEta = Boolean(request.expectedDeliveryDate || request.supplierConfirmedDate);
    request.etaPending = !hasEta;

    request.updatedBy = userId;
    return this.materialRequestRepo.save(request);
  }

  async getRequestTimeline(id: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const request = await this.findMaterialRequestById(id, companyId, allowedDivisionIds);
    const events: { action: string; user: string | null; date: Date | null; document: string; remarks?: string | null }[] = [];

    events.push({ action: 'Material Request Created', user: request.createdBy, date: request.createdAt, document: request.requestNumber });
    if (request.submittedAt) events.push({ action: 'Material Request Submitted', user: request.submittedBy, date: request.submittedAt, document: request.requestNumber });
    if (request.approvedAt) events.push({ action: 'Manager Approved', user: request.approvedBy, date: request.approvedAt, document: request.requestNumber });
    if (request.gmApprovedAt) events.push({ action: 'GM Approved', user: request.gmApprovedBy, date: request.gmApprovedAt, document: request.requestNumber });
    if (request.rejectedAt) events.push({ action: 'Rejected', user: request.rejectedBy, date: request.rejectedAt, document: request.requestNumber });
    if (request.cancelledAt) events.push({ action: 'Cancelled', user: request.cancelledBy, date: request.cancelledAt, document: request.requestNumber });
    if (request.convertedAt) events.push({ action: 'PR Created', user: request.convertedBy, date: request.convertedAt, document: request.prNumber || '' });
    if (request.procurementAcknowledgedAt) events.push({ action: 'Procurement Acknowledged', user: request.procurementAcknowledgedBy, date: request.procurementAcknowledgedAt, document: request.requestNumber });
    if (request.supplierConfirmedDate) events.push({ action: 'Supplier Confirmed', user: null, date: new Date(`${request.supplierConfirmedDate}T00:00:00Z`), document: request.requestNumber });
    if (request.expectedDeliveryDate) events.push({ action: 'ETA Confirmed', user: null, date: new Date(`${request.expectedDeliveryDate}T00:00:00Z`), document: request.requestNumber });
    if (request.actualDeliveryDate) events.push({ action: 'Material Received', user: null, date: new Date(`${request.actualDeliveryDate}T00:00:00Z`), document: request.requestNumber });

    return events.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
  }

  async getEtaInfo(id: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const request = await this.findMaterialRequestById(id, companyId, allowedDivisionIds);
    const now = new Date();

    const leadTimes: Record<string, number | null> = {
      approvalLeadTime: request.submittedAt && request.approvedAt
        ? Math.round((request.approvedAt.getTime() - request.submittedAt.getTime()) / (1000 * 60 * 60 * 24))
        : null,
      gmApprovalLeadTime: request.approvedAt && request.gmApprovedAt
        ? Math.round((request.gmApprovedAt.getTime() - request.approvedAt.getTime()) / (1000 * 60 * 60 * 24))
        : null,
      procurementLeadTime: request.gmApprovedAt && request.procurementAcknowledgedAt
        ? Math.round((request.procurementAcknowledgedAt.getTime() - request.gmApprovedAt.getTime()) / (1000 * 60 * 60 * 24))
        : null,
    };

    let supplierLeadTime: number | null = null;
    if (request.supplierConfirmedDate && request.expectedDeliveryDate) {
      supplierLeadTime = Math.round(
        (new Date(`${request.expectedDeliveryDate}T00:00:00Z`).getTime() - new Date(`${request.supplierConfirmedDate}T00:00:00Z`).getTime()) / (1000 * 60 * 60 * 24),
      );
    }
    leadTimes.supplierLeadTime = supplierLeadTime;

    let receivingLeadTime: number | null = null;
    if (request.expectedDeliveryDate && request.actualDeliveryDate) {
      receivingLeadTime = Math.round(
        (new Date(`${request.actualDeliveryDate}T00:00:00Z`).getTime() - new Date(`${request.expectedDeliveryDate}T00:00:00Z`).getTime()) / (1000 * 60 * 60 * 24),
      );
    }
    leadTimes.receivingLeadTime = receivingLeadTime;

    const totalStart = request.submittedAt?.getTime() ?? request.createdAt.getTime();
    const totalEnd = request.actualDeliveryDate
      ? new Date(`${request.actualDeliveryDate}T00:00:00Z`).getTime()
      : request.procurementAcknowledgedAt?.getTime() ?? now.getTime();
    leadTimes.totalProcurementLeadTime = Math.round((totalEnd - totalStart) / (1000 * 60 * 60 * 24));

    let etaStatus = 'ETA_PENDING';
    let remainingDays: number | null = null;
    let overdue = false;
    if (request.expectedDeliveryDate) {
      const etaDate = new Date(`${request.expectedDeliveryDate}T00:00:00Z`);
      etaDate.setHours(23, 59, 59, 999);
      if (request.actualDeliveryDate) {
        etaStatus = 'RECEIVED';
      } else if (now > etaDate) {
        etaStatus = 'OVERDUE';
        overdue = true;
      } else {
        etaStatus = 'PENDING';
        remainingDays = Math.ceil((etaDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    return {
      requestId: request.id,
      requestNumber: request.requestNumber,
      status: request.status,
      requestedDate: request.requestDate,
      requiredDate: request.requiredDate,
      approvedDate: request.approvedAt,
      gmApprovedDate: request.gmApprovedAt,
      orderDate: request.convertedAt,
      supplierConfirmedDate: request.supplierConfirmedDate,
      expectedDeliveryDate: request.expectedDeliveryDate,
      actualDeliveryDate: request.actualDeliveryDate,
      prNumber: request.prNumber,
      prId: request.prId,
      poNumber: request.poNumber,
      supplierId: request.supplierId,
      etaStatus,
      etaPending: request.etaPending,
      remainingDays,
      overdue,
      leadTimes,
    };
  }

  // ==================== MATERIAL ISSUES ====================

  async getPartMachineHistory(
    companyId: string,
    machineId: string,
    itemId: string,
    asOfDate?: string,
  ) {
    if (!machineId || !itemId || machineId === 'OTHER_GENERAL') {
      return { hasPreviousIssue: false };
    }

    const [machineRows, itemRows] = await Promise.all([
      this.storeRepo.manager.query(
        `SELECT id, machine_code, name FROM machines WHERE id = $1 LIMIT 1`,
        [machineId],
      ),
      this.storeRepo.manager.query(
        `SELECT i.id, i.item_code, i.name, u.code AS uom_code
         FROM items i
         LEFT JOIN uoms u ON u.id = i.base_uom_id
         WHERE i.id = $1 LIMIT 1`,
        [itemId],
      ),
    ]);

    const machine = machineRows[0];
    const item = itemRows[0];
    if (!machine || !item) {
      return { hasPreviousIssue: false };
    }

    const machineCode = String(machine.machine_code || '').trim();
    const issueRows = await this.storeRepo.manager.query(
      `SELECT mi.id,
              mi.issue_number,
              mi.issue_date::date::text AS issue_date,
              mi.status,
              mil.quantity,
              COALESCE(u.code, $4, 'PCS') AS uom_code
       FROM material_issue_lines mil
       INNER JOIN material_issues mi ON mi.id = mil.issue_id
       LEFT JOIN uoms u ON u.id = mil.uom_id
       WHERE mil.item_id = $1
         AND mi.company_id = $2
         AND mi.deleted_at IS NULL
         AND COALESCE(UPPER(mi.status), '') <> 'CANCELLED'
         AND (
           mi.reference_document ILIKE '%' || $3 || '%'
           OR mi.remarks ILIKE '%' || $3 || '%'
         )
       ORDER BY mi.issue_date DESC, mi.created_at DESC`,
      [itemId, companyId, machineCode, item.uom_code || 'PCS'],
    );

    if (!issueRows.length) {
      return {
        hasPreviousIssue: false,
        machineId: machine.id,
        machineCode,
        machineName: machine.name,
        itemId: item.id,
        itemCode: item.item_code,
        itemName: item.name,
        totalIssuesToMachine: 0,
      };
    }

    const latest = issueRows[0];
    const lastIssueDate: string = latest.issue_date;
    const refDate = asOfDate ? new Date(asOfDate) : new Date();
    const prevDate = new Date(lastIssueDate);
    const diffMs = Math.max(0, refDate.getTime() - prevDate.getTime());
    const daysSinceLastIssue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Sum total Good Production Qty & Weight (Kg) on this machine since lastIssueDate
    const prodRows = await this.storeRepo.manager.query(
      `WITH entry_lines AS (
         SELECT
           pe.id AS entry_id,
           pe.running_hours,
           COALESCE(pei.actual_quantity, pe.actual_quantity, 0)::numeric AS actual_qty,
           COALESCE(u_line.code, u_hdr.code, 'PCS') AS uom_code,
           COALESCE(it_line.weight_per_piece, it_hdr.weight_per_piece, 0)::numeric AS w_piece,
           COALESCE(it_line.weight_per_meter, it_hdr.weight_per_meter, 0)::numeric AS w_meter,
           COALESCE(it_line.pieces_per_kg, it_hdr.pieces_per_kg, 0)::numeric AS pcs_per_kg
         FROM production_entries pe
         LEFT JOIN production_entry_items pei
           ON pei.production_entry_id = pe.id AND pei.deleted_at IS NULL AND pei.is_active = true
         LEFT JOIN items it_line ON it_line.id = pei.item_id
         LEFT JOIN items it_hdr ON it_hdr.id = pe.item_id
         LEFT JOIN uoms u_line ON u_line.id = pei.uom_id
         LEFT JOIN uoms u_hdr ON u_hdr.id = pe.uom_id
         WHERE pe.company_id = $1
           AND pe.deleted_at IS NULL
           AND pe.is_active = true
           AND (pe.machine_id = $2 OR UPPER(COALESCE(pe.machine_no, '')) = UPPER($3))
           AND pe.entry_date >= $4::date
           AND ($5::date IS NULL OR pe.entry_date <= $5::date)
       )
       SELECT
         COUNT(DISTINCT entry_id)::int AS entry_count,
         COALESCE(SUM(actual_qty), 0)::numeric AS total_qty,
         MAX(uom_code) AS primary_uom,
         COALESCE(SUM(
           CASE
             WHEN UPPER(uom_code) IN ('KG', 'KGS') THEN actual_qty
             WHEN w_piece > 0 THEN actual_qty * w_piece
             WHEN pcs_per_kg > 0 THEN actual_qty / pcs_per_kg
             WHEN w_meter > 0 THEN actual_qty * w_meter
             ELSE 0
           END
         ), 0)::numeric AS total_weight_kg
       FROM entry_lines`,
      [companyId, machineId, machineCode, lastIssueDate, asOfDate || null],
    );

    const prod = prodRows[0] || {};

    return {
      hasPreviousIssue: true,
      machineId: machine.id,
      machineCode,
      machineName: machine.name,
      itemId: item.id,
      itemCode: item.item_code,
      itemName: item.name,
      lastIssueId: latest.id,
      lastIssueVoucherNo: latest.issue_number,
      lastIssueDate,
      lastIssueQty: Number(latest.quantity || 0),
      lastIssueUom: latest.uom_code || item.uom_code || 'PCS',
      daysSinceLastIssue,
      totalIssuesToMachine: issueRows.length,
      productionSinceLastIssue: {
        entryCount: Number(prod.entry_count || 0),
        totalQty: Number(prod.total_qty || 0),
        uomCode: prod.primary_uom || 'PCS',
        totalWeightKg: Number(Number(prod.total_weight_kg || 0).toFixed(2)),
      },
    };
  }

  async getIssuePersonnelSuggestions(
    companyId: string,
    departmentId?: string,
    machineId?: string,
  ) {
    try {
      const [opRows, supRows, userRows] = await Promise.all([
        this.storeRepo.manager.query(
          `SELECT DISTINCT TRIM(operator_name) AS name
           FROM production_entries
           WHERE company_id = $1
             AND deleted_at IS NULL
             AND operator_name IS NOT NULL
             AND TRIM(operator_name) <> ''
             AND ($2::uuid IS NULL OR department_id = $2::uuid)
             AND ($3::uuid IS NULL OR machine_id = $3::uuid)
           ORDER BY name ASC
           LIMIT 100`,
          [companyId, departmentId || null, machineId && machineId !== 'OTHER_GENERAL' ? machineId : null],
        ),
        this.storeRepo.manager.query(
          `SELECT DISTINCT TRIM(supervisor_name) AS name
           FROM production_entries
           WHERE company_id = $1
             AND deleted_at IS NULL
             AND supervisor_name IS NOT NULL
             AND TRIM(supervisor_name) <> ''
             AND ($2::uuid IS NULL OR department_id = $2::uuid)
           ORDER BY name ASC
           LIMIT 100`,
          [companyId, departmentId || null],
        ),
        this.storeRepo.manager.query(
          `SELECT DISTINCT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))), ''), display_name, username) AS name
           FROM erp_users
           WHERE is_active = true
           ORDER BY name ASC
           LIMIT 100`,
        ),
      ]);

      const operators = Array.from(
        new Set([
          ...opRows.map((r: any) => r.name).filter(Boolean),
          ...userRows.map((r: any) => r.name).filter(Boolean),
        ]),
      );
      const shiftIncharges = Array.from(
        new Set([
          ...supRows.map((r: any) => r.name).filter(Boolean),
          ...userRows.map((r: any) => r.name).filter(Boolean),
        ]),
      );

      return { operators, shiftIncharges };
    } catch {
      return { operators: [], shiftIncharges: [] };
    }
  }

  async findAllMaterialIssues(
    companyId: string,
    query?: {
      status?: string;
      storeId?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      limit?: number | string;
      page?: number | string;
      allDates?: boolean | string;
    },
    allowedDivisionIds?: DivisionAccess,
  ) {
    const qb = this.materialIssueRepo.createQueryBuilder('mi')
      .where('mi.company_id = :companyId', { companyId });

    if (query?.status) {
      qb.andWhere('mi.status = :status', { status: query.status });
    }
    if (query?.storeId) {
      qb.andWhere('mi.store_id = :storeId', { storeId: query.storeId });
    }
    if (query?.dateFrom) {
      qb.andWhere('mi.created_at >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query?.dateTo) {
      qb.andWhere('mi.created_at <= :dateTo', { dateTo: query.dateTo });
    }
    if (query?.search?.trim()) {
      qb.andWhere('(mi.issue_number ILIKE :search OR mi.purpose ILIKE :search OR mi.remarks ILIKE :search)', {
        search: `%${query.search.trim()}%`,
      });
    }

    const hasExplicitRange = Boolean(
      query?.dateFrom || query?.dateTo || query?.status || query?.search?.trim() ||
      query?.allDates === true || query?.allDates === 'true',
    );
    if (!hasExplicitRange) {
      const recentSince = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      qb.andWhere("(mi.created_at >= :recentSince OR mi.status = 'DRAFT')", { recentSince });
    }
    // PROMPT #27 — issues move stock out of a store, so they are the most
    // sensitive store document of the three; scope is mandatory.
    applyDivisionScopeFilter(qb as any, 'mi.division_id', allowedDivisionIds);

    qb.loadRelationCountAndMap('mi.lineCount', 'mi.lines', 'lines')
      .orderBy('mi.created_at', 'DESC');

    const safeLimit = Math.min(Math.max(Number(query?.limit) || 200, 1), 500);
    if (typeof (qb as any).take === 'function') {
      (qb as any).take(safeLimit);
    }
    if (query?.page && typeof (qb as any).skip === 'function') {
      const safePage = Math.max(Number(query.page) || 1, 1);
      (qb as any).skip((safePage - 1) * safeLimit);
    }

    const issues = await qb.getMany();
    if (issues.length > 0) {
      await this.attachEnrichedIssueLines(issues);
    }
    return issues;
  }

  private async attachEnrichedIssueLines(issues: MaterialIssue[]): Promise<void> {
    const issueIds = issues.map((i) => i.id).filter(Boolean);
    if (issueIds.length === 0) return;

    try {
      const rows: Array<{
        id: string;
        issue_id: string;
        line_number: number;
        item_id: string;
        quantity: string | number;
        unit_cost: string | number | null;
        total_cost: string | number | null;
        uom_id: string;
        batch_id: string | null;
        serial_number: string | null;
        requires_old_item_return: boolean;
        old_item_returned_qty: string | number;
        remarks: string | null;
        item_code: string | null;
        item_name: string | null;
        item_type: string | null;
        uom_code: string | null;
      }> = await this.storeRepo.manager.query(
        `SELECT mil.id,
                mil.issue_id,
                mil.line_number,
                mil.item_id,
                mil.quantity,
                mil.unit_cost,
                mil.total_cost,
                mil.uom_id,
                mil.batch_id,
                mil.serial_number,
                mil.requires_old_item_return,
                mil.old_item_returned_qty,
                mil.remarks,
                i.item_code,
                i.name AS item_name,
                i.item_type,
                COALESCE(u.code, bu.code) AS uom_code
           FROM material_issue_lines mil
           LEFT JOIN items i ON i.id = mil.item_id
           LEFT JOIN uoms u ON u.id = mil.uom_id
           LEFT JOIN uoms bu ON bu.id = i.base_uom_id
          WHERE mil.issue_id = ANY($1)
          ORDER BY mil.line_number ASC, mil.created_at ASC`,
        [issueIds],
      );

      const byIssueId = new Map<string, any[]>();
      for (const r of rows || []) {
        const list = byIssueId.get(r.issue_id) ?? [];
        list.push({
          id: r.id,
          issueId: r.issue_id,
          lineNumber: Number(r.line_number || 0),
          itemId: r.item_id,
          quantity: Number(r.quantity || 0),
          unitCost: r.unit_cost != null ? Number(r.unit_cost) : null,
          totalCost: r.total_cost != null ? Number(r.total_cost) : null,
          uomId: r.uom_id,
          batchId: r.batch_id,
          serialNumber: r.serial_number,
          requiresOldItemReturn: Boolean(r.requires_old_item_return),
          oldItemReturnedQty: Number(r.old_item_returned_qty || 0),
          remarks: r.remarks,
          itemCode: r.item_code || '',
          itemName: r.item_name || '',
          itemType: r.item_type || '',
          uomCode: r.uom_code || '',
        });
        byIssueId.set(r.issue_id, list);
      }

      for (const issue of issues) {
        issue.lines = byIssueId.get(issue.id) ?? [];
      }
    } catch {
      // Fallback gracefully if line enrichment fails
    }
  }

  async findMaterialIssueById(id: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const issue = await this.materialIssueRepo.findOne({
      where: { id },
      relations: ['lines'],
      order: { lines: { lineNumber: 'ASC' } },
    });
    if (!issue) throw new NotFoundException(`Material issue ${id} not found`);
    this.assertCompanyOwned(issue, companyId, 'Material issue');
    this.assertDivisionOwned(issue, allowedDivisionIds);

    // Enrich line items with itemCode, itemName, and uomCode for Print/PDF & Edit modals
    if (issue.lines && issue.lines.length > 0) {
      try {
        const lineDetails = await this.storeRepo.manager.query(
          `SELECT mil.id AS line_id,
                  i.item_code,
                  i.name AS item_name,
                  i.item_type,
                  COALESCE(u.code, bu.code) AS uom_code
           FROM material_issue_lines mil
           LEFT JOIN items i ON i.id = mil.item_id
           LEFT JOIN uoms u ON u.id = mil.uom_id
           LEFT JOIN uoms bu ON bu.id = i.base_uom_id
           WHERE mil.issue_id = $1`,
          [issue.id],
        );
        const detailByLineId = new Map<string, any>(
          lineDetails.map((d: any) => [d.line_id, d]),
        );
        issue.lines = issue.lines.map((l: any) => {
          const d = detailByLineId.get(l.id);
          return {
            ...l,
            itemCode: d?.item_code || l.itemCode || '',
            itemName: d?.item_name || l.itemName || '',
            itemType: d?.item_type || l.itemType || '',
            uomCode: d?.uom_code || l.uomCode || '',
          };
        });
      } catch {
        // Fallback gracefully if enrichment fails
      }
    }

    return issue;
  }

  async createMaterialIssue(dto: CreateMaterialIssueDto, userId: string) {
    const generatedSin = `SIN-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const issue = this.materialIssueRepo.create({
      ...dto,
      issueNumber: dto.issueNumber?.trim() || generatedSin,
      issuedBy: userId || null,
      lines: undefined,
      createdBy: userId,
    });
    const saved = await this.materialIssueRepo.save(issue);

    if (dto.lines && dto.lines.length > 0) {
      for (let i = 0; i < dto.lines.length; i++) {
        const line = this.materialIssueLineRepo.create({
          issueId: saved.id,
          lineNumber: i + 1,
          itemId: dto.lines[i].itemId,
          quantity: dto.lines[i].quantity,
          uomId: dto.lines[i].uomId,
          batchId: dto.lines[i].batchId || null,
          serialNumber: dto.lines[i].serialNumber || null,
          bin: dto.lines[i].bin || null,
          rack: dto.lines[i].rack || null,
          requiresOldItemReturn: Boolean(dto.lines[i].requiresOldItemReturn),
          oldItemReturnedQty: Number(dto.lines[i].oldItemReturnedQty || 0),
          remarks: dto.lines[i].remarks || null,
        });
        await this.materialIssueLineRepo.save(line);
      }
    }

    return this.findMaterialIssueById(saved.id);
  }

  async updateMaterialIssue(
    id: string,
    payload: CreateMaterialIssueDto['lines'] | Partial<CreateMaterialIssueDto>,
    userId: string,
    companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ) {
    const issue = await this.findMaterialIssueById(id, companyId, allowedDivisionIds);
    if (issue.status !== 'DRAFT') throw new BadRequestException('Only DRAFT issues can be edited');

    const lines = Array.isArray(payload) ? payload : payload.lines;
    const headerUpdates: Partial<MaterialIssue> = { updatedBy: userId };

    if (!Array.isArray(payload)) {
      if (payload.issueDate !== undefined) headerUpdates.issueDate = payload.issueDate;
      if (payload.storeId !== undefined) headerUpdates.storeId = payload.storeId;
      if (payload.divisionId !== undefined) headerUpdates.divisionId = payload.divisionId || null;
      if (payload.sectionId !== undefined) headerUpdates.sectionId = payload.sectionId || null;
      if (payload.departmentId !== undefined) headerUpdates.departmentId = payload.departmentId || null;
      if (payload.issuedToDepartmentId !== undefined) headerUpdates.issuedToDepartmentId = payload.issuedToDepartmentId || null;
      if (payload.purpose !== undefined) headerUpdates.purpose = payload.purpose || null;
      if (payload.referenceDocument !== undefined) headerUpdates.referenceDocument = payload.referenceDocument || null;
      if (payload.remarks !== undefined) headerUpdates.remarks = payload.remarks || null;
      if (payload.operatorName !== undefined) headerUpdates.operatorName = payload.operatorName || null;
      if (payload.shiftInchargeName !== undefined) headerUpdates.shiftInchargeName = payload.shiftInchargeName || null;
      if (payload.issuedByName !== undefined) headerUpdates.issuedByName = payload.issuedByName || null;
    }

    if (lines && lines.length > 0) {
      await this.materialIssueLineRepo.delete({ issueId: id });
      for (let i = 0; i < lines.length; i++) {
        const line = this.materialIssueLineRepo.create({
          issueId: id,
          lineNumber: i + 1,
          itemId: lines[i].itemId,
          quantity: lines[i].quantity,
          uomId: lines[i].uomId,
          batchId: lines[i].batchId || null,
          serialNumber: lines[i].serialNumber || null,
          bin: lines[i].bin || null,
          rack: lines[i].rack || null,
          requiresOldItemReturn: Boolean(lines[i].requiresOldItemReturn),
          oldItemReturnedQty: Number(lines[i].oldItemReturnedQty || 0),
          remarks: lines[i].remarks || null,
        });
        await this.materialIssueLineRepo.save(line);
      }
    }

    await this.materialIssueRepo.update(id, headerUpdates);
    if (headerUpdates.issueDate !== undefined && this.toolLifecycleService) {
      try {
        await this.toolLifecycleService.recalculateLinkedToolRuns({
          companyId: issue.companyId,
          storeIssueId: id,
        });
      } catch (err: any) {
        this.logger.warn(
          `Tool run recalculation skipped after issue ${id} update: ${err?.message || err}`,
        );
      }
    }
    return this.findMaterialIssueById(id);
  }

  private async convertToBaseUom(
    manager: EntityManager,
    itemId: string,
    uomId: string,
    quantity: number,
  ): Promise<{ postQty: number; postUomId: string; itemName: string }> {
    let postQty = quantity;
    let postUomId = uomId;
    let itemName = itemId;

    const item = await manager.getRepository(Item).findOne({ where: { id: itemId } });
    if (item) {
      itemName = item.name || item.itemCode || itemId;
      if (item.baseUomId && uomId && item.baseUomId !== uomId) {
        const conv = await manager.getRepository(UomConversion).findOne({
          where: { fromUomId: uomId, toUomId: item.baseUomId },
        });
        if (conv && Number(conv.conversionFactor) > 0) {
          postQty = quantity * Number(conv.conversionFactor);
          postUomId = item.baseUomId;
        }
      }
    }
    return { postQty, postUomId, itemName };
  }

  private async addToScrapOrQuarantinePool(
    manager: EntityManager,
    companyId: string,
    itemId: string,
    warehouseId: string,
    uomId: string,
    qty: number,
    pool: 'scrap' | 'quarantine',
  ): Promise<void> {
    if (qty <= 0) return;
    const balRepo = manager.getRepository(InventoryBalance);
    let balance = await balRepo.findOne({
      where: { companyId, itemId, warehouseId, locationId: IsNull(), batchId: IsNull() },
      lock: { mode: 'pessimistic_write' },
    });
    if (!balance) {
      balance = await balRepo.findOne({
        where: { companyId, itemId, warehouseId },
        lock: { mode: 'pessimistic_write' },
      });
    }
    if (!balance) {
      balance = balRepo.create({
        companyId,
        itemId,
        warehouseId,
        uomId,
        onHand: 0,
        reserved: 0,
        available: 0,
        scrapQty: pool === 'scrap' ? qty : 0,
        quarantineQty: pool === 'quarantine' ? qty : 0,
        status: 'ACTIVE',
      });
    } else {
      if (pool === 'scrap') {
        balance.scrapQty = Number(balance.scrapQty || 0) + qty;
      } else {
        balance.quarantineQty = Number(balance.quarantineQty || 0) + qty;
      }
    }
    await balRepo.save(balance);
  }

  async postMaterialIssue(id: string, userId: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const issue = await this.findMaterialIssueById(id, companyId, allowedDivisionIds);
    if (issue.status !== 'DRAFT') throw new BadRequestException('Only DRAFT issues can be posted');
    if (!issue.lines || issue.lines.length === 0) {
      throw new BadRequestException('Cannot post an issue with no line items');
    }

    const store = issue.storeId ? await this.storeRepo.findOne({ where: { id: issue.storeId } }) : null;
    if (!store || !store.warehouseId) {
      throw new BadRequestException('Issue store has no linked warehouse; cannot post inventory');
    }

    try {
      await this.materialIssueRepo.manager.transaction(async (manager) => {
        const repo = manager.getRepository(MaterialIssue);
        // Lock ONLY the material_issues header row (PostgreSQL forbids FOR UPDATE on the nullable side of a LEFT JOIN)
        const locked = await repo
          .createQueryBuilder('mi')
          .setLock('pessimistic_write')
          .where('mi.id = :id', { id })
          .getOne();
        if (!locked) throw new NotFoundException(`Material issue ${id} not found`);
        if (locked.status !== 'DRAFT') throw new BadRequestException('Issue has already been posted');

        const lockedLines = await manager.getRepository(MaterialIssueLine).find({
          where: { issueId: locked.id },
          order: { lineNumber: 'ASC' },
        });
        if (lockedLines.length === 0) {
          throw new BadRequestException('Cannot post an issue with no line items');
        }

        const policy = await manager.getRepository(InventoryPolicy).findOne({
          where: { companyId: locked.companyId },
        });
        const allowNegative = Boolean(policy?.allowNegativeStock);

        for (const line of lockedLines) {
          const qty = Number(line.quantity || 0);
          if (qty <= 0) continue;

          const { postQty, postUomId, itemName } = await this.convertToBaseUom(
            manager,
            line.itemId,
            line.uomId,
            qty,
          );

          // Lock inventory balance rows for this item+warehouse to prevent concurrent negative stock race
          const balRows = await manager
            .getRepository(InventoryBalance)
            .createQueryBuilder('ib')
            .setLock('pessimistic_write')
            .where('ib.company_id = :companyId AND ib.item_id = :itemId AND ib.warehouse_id = :warehouseId', {
              companyId: locked.companyId,
              itemId: line.itemId,
              warehouseId: store.warehouseId!,
            })
            .getMany();

          const availableBaseQty = balRows.reduce((sum, r) => sum + Number(r.available || 0), 0);
          if (!allowNegative && availableBaseQty < postQty) {
            throw new BadRequestException(
              `Insufficient stock for ${itemName}: available ${availableBaseQty}, requested ${postQty}`,
            );
          }

          // Resolve current warehouse weighted average / latest cost for this issue line
          const balCostRow = balRows.find((r) => Number(r.averageCost || r.unitCost || 0) > 0);
          const baseUnitCost =
            Number(balCostRow?.averageCost || balCostRow?.unitCost || 0) ||
            (await this.inventoryBalanceService.getEffectiveUnitCost?.(
              locked.companyId,
              line.itemId,
              store.warehouseId!,
              manager,
            )) ||
            0;
          const lineUnitCost =
            baseUnitCost > 0 && qty > 0
              ? Number(((baseUnitCost * postQty) / qty).toFixed(4))
              : 0;
          const lineTotalCost =
            lineUnitCost > 0 ? Number((qty * lineUnitCost).toFixed(4)) : null;

          if (lineUnitCost > 0) {
            await manager.getRepository(MaterialIssueLine).update(line.id, {
              unitCost: lineUnitCost,
              totalCost: lineTotalCost,
            });
            (line as any).unitCost = lineUnitCost;
            (line as any).totalCost = lineTotalCost;
          }

          await this.stockLedgerService.create({
            companyId: locked.companyId,
            transactionType: 'MATERIAL_ISSUE',
            transactionDate: new Date(),
            itemId: line.itemId,
            warehouseId: store.warehouseId!,
            batchId: line.batchId || undefined,
            quantity: postQty,
            unitCost: baseUnitCost > 0 ? baseUnitCost : null,
            totalCost: baseUnitCost > 0 ? Number((postQty * baseUnitCost).toFixed(4)) : null,
            uomId: postUomId,
            direction: 'OUT',
            referenceType: 'MATERIAL_ISSUE',
            referenceId: locked.id,
            referenceNumber: locked.issueNumber,
            notes: `Store Issue Note ${locked.issueNumber}${postQty !== qty ? ` (${qty} converted to ${postQty})` : ''}`,
            createdBy: userId,
            divisionId: locked.divisionId,
            sectionId: locked.sectionId,
            departmentId: locked.departmentId || locked.issuedToDepartmentId,
          }, manager);

          await this.inventoryBalanceService.updateBalance(
            locked.companyId, line.itemId, store.warehouseId!,
            null, line.batchId, postUomId, postQty, 'OUT', manager,
          );

          // Old consumable / tool exchange: log returned old item into Scrap Drum pool
          const oldReturned = Number(line.oldItemReturnedQty || 0);
          if (oldReturned > 0) {
            const oldConv = await this.convertToBaseUom(manager, line.itemId, line.uomId, oldReturned);
            await this.addToScrapOrQuarantinePool(
              manager,
              locked.companyId,
              line.itemId,
              store.warehouseId!,
              oldConv.postUomId,
              oldConv.postQty,
              'scrap',
            );
          }
        }

        if (locked.requestId) {
          await this.updateRequestIssuedQuantity(locked.requestId, lockedLines, manager);
        }

        await repo.update(locked.id, {
          status: 'POSTED',
          postedBy: userId,
          postedAt: new Date(),
          updatedBy: userId,
        });
      });
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      const detail = err?.driverError?.message || err?.message || 'Unexpected database error while posting Store Issue Note';
      this.logger.error(`Failed to post Store Issue Note ${issue.issueNumber} (${id}): ${detail}`, err?.stack);
      throw new InternalServerErrorException(`Failed to post Store Issue Note ${issue.issueNumber}: ${detail}`);
    }

    const postedIssue = await this.findMaterialIssueById(id);

    // Closed-Loop Tool Life Tracker: Auto-close previous active tool run & start new run on the target machine
    if (this.toolLifecycleService && postedIssue?.referenceDocument) {
      try {
        await this.toolLifecycleService.handlePostedMaterialIssue({
          companyId: postedIssue.companyId,
          issueId: postedIssue.id,
          issueNumber: postedIssue.issueNumber,
          issueDate: postedIssue.issueDate
            ? String(postedIssue.issueDate).slice(0, 10)
            : new Date().toISOString().slice(0, 10),
          referenceDocument: postedIssue.referenceDocument,
          lines: (postedIssue.lines || []).map((l: any) => ({
            itemId: l.itemId,
            quantity: Number(l.quantity || 0),
            oldItemReturnedQty: Number(l.oldItemReturnedQty || 0),
            unitCost: Number(l.unitCost || 0) > 0 ? Number(l.unitCost) : null,
            uomId: l.uomId,
            remarks: l.remarks,
          })),
          userId,
        });
      } catch (err: any) {
        this.logger.warn(
          `Closed-loop tool lifecycle sync skipped for issue ${postedIssue.issueNumber}: ${err?.message || err}`,
        );
      }
    }

    return postedIssue;
  }

  private async updateRequestIssuedQuantity(requestId: string, lines: MaterialIssueLine[], manager: EntityManager) {
    if (lines.length === 0) return;
    const mrLineRepo = manager.getRepository(MaterialRequestLine);
    const mrLines = await mrLineRepo.find({ where: { requestId } });

    for (const issueLine of lines) {
      const mrLine = mrLines.find((l) => l.itemId === issueLine.itemId);
      if (mrLine) {
        await mrLineRepo.update(mrLine.id, {
          issuedQuantity: Number(mrLine.issuedQuantity || 0) + Number(issueLine.quantity || 0),
        });
      }
    }
  }

  async cancelMaterialIssue(id: string, userId: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const issue = await this.findMaterialIssueById(id, companyId, allowedDivisionIds);
    if (issue.status !== 'DRAFT') throw new BadRequestException('Only DRAFT issues can be cancelled');
    issue.status = 'CANCELLED';
    issue.cancelledBy = userId;
    issue.cancelledAt = new Date();
    return this.materialIssueRepo.save(issue);
  }

  /**
   * Move a Goods Outward Note to the Recycle Bin.
   *
   * ONLY `DRAFT` and `CANCELLED` issues may be trashed. A POSTED issue has
   * already written `stock_ledger` movements and reduced `inventory_balances`;
   * hiding the document would leave those postings on the books with nothing
   * visible to explain them, so the guard refuses and the operator must raise
   * a material return or a stock adjustment instead. This mirrors the Draft
   * guard the Sales Quotation screen has always applied.
   */
  async removeMaterialIssue(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const issue = await this.findMaterialIssueById(id, companyId, allowedDivisionIds);
    if (!['DRAFT', 'CANCELLED'].includes(issue.status)) {
      throw new BadRequestException(
        `A ${issue.status} issue has already moved stock and cannot be recycled. ` +
          'Raise a material return or a stock adjustment instead.',
      );
    }
    issue.deletedAt = new Date();
    issue.deletedBy = userId ?? null;
    return this.materialIssueRepo.save(issue);
  }

  // ==================== MATERIAL RETURNS ====================

  async findAllMaterialReturns(
    companyId: string,
    query?: {
      status?: string;
      storeId?: string;
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      limit?: number | string;
      page?: number | string;
      allDates?: boolean | string;
    },
    allowedDivisionIds?: DivisionAccess,
  ) {
    const qb = this.materialReturnRepo.createQueryBuilder('mr')
      .where('mr.company_id = :companyId', { companyId });

    if (query?.status) {
      qb.andWhere('mr.status = :status', { status: query.status });
    }
    if (query?.storeId) {
      qb.andWhere('mr.store_id = :storeId', { storeId: query.storeId });
    }
    if (query?.dateFrom) {
      qb.andWhere('mr.created_at >= :dateFrom', { dateFrom: query.dateFrom });
    }
    if (query?.dateTo) {
      qb.andWhere('mr.created_at <= :dateTo', { dateTo: query.dateTo });
    }
    if (query?.search?.trim()) {
      qb.andWhere('(mr.return_number ILIKE :search OR mr.remarks ILIKE :search)', {
        search: `%${query.search.trim()}%`,
      });
    }

    const hasExplicitRange = Boolean(
      query?.dateFrom || query?.dateTo || query?.status || query?.search?.trim() ||
      query?.allDates === true || query?.allDates === 'true',
    );
    if (!hasExplicitRange) {
      const recentSince = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      qb.andWhere("(mr.created_at >= :recentSince OR mr.status = 'DRAFT')", { recentSince });
    }
    // PROMPT #27 — returns move stock back into a store; scope is mandatory.
    applyDivisionScopeFilter(qb as any, 'mr.division_id', allowedDivisionIds);

    qb.loadRelationCountAndMap('mr.lineCount', 'mr.lines', 'lines')
      .orderBy('mr.created_at', 'DESC');

    const safeLimit = Math.min(Math.max(Number(query?.limit) || 200, 1), 500);
    if (typeof (qb as any).take === 'function') {
      (qb as any).take(safeLimit);
    }
    if (query?.page && typeof (qb as any).skip === 'function') {
      const safePage = Math.max(Number(query.page) || 1, 1);
      (qb as any).skip((safePage - 1) * safeLimit);
    }

    return qb.getMany();
  }

  async findMaterialReturnById(id: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const returnRecord = await this.materialReturnRepo.findOne({
      where: { id },
      relations: ['lines'],
      order: { lines: { lineNumber: 'ASC' } },
    });
    if (!returnRecord) throw new NotFoundException(`Material return ${id} not found`);
    this.assertCompanyOwned(returnRecord, companyId, 'Material return');
    this.assertDivisionOwned(returnRecord, allowedDivisionIds);
    return returnRecord;
  }

  async createMaterialReturn(dto: CreateMaterialReturnDto, userId: string) {
    const returnRecord = this.materialReturnRepo.create({
      ...dto,
      lines: undefined,
      createdBy: userId,
    });
    const saved = await this.materialReturnRepo.save(returnRecord);

    if (dto.lines && dto.lines.length > 0) {
      for (let i = 0; i < dto.lines.length; i++) {
        const line = this.materialReturnLineRepo.create({
          returnId: saved.id,
          lineNumber: i + 1,
          itemId: dto.lines[i].itemId,
          quantity: dto.lines[i].quantity,
          uomId: dto.lines[i].uomId,
          batchId: dto.lines[i].batchId || null,
          serialNumber: dto.lines[i].serialNumber || null,
          conditionCode: dto.lines[i].conditionCode || dto.conditionCode || 'GOOD',
          remarks: dto.lines[i].remarks || null,
        });
        await this.materialReturnLineRepo.save(line);
      }
    }

    return this.findMaterialReturnById(saved.id);
  }

  async updateMaterialReturn(id: string, lines: CreateMaterialReturnDto['lines'], userId: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const returnRecord = await this.findMaterialReturnById(id, companyId, allowedDivisionIds);
    if (returnRecord.status !== 'DRAFT') throw new BadRequestException('Only DRAFT returns can be edited');

    if (lines && lines.length > 0) {
      await this.materialReturnLineRepo.delete({ returnId: id });
      for (let i = 0; i < lines.length; i++) {
        const line = this.materialReturnLineRepo.create({
          returnId: id,
          lineNumber: i + 1,
          itemId: lines[i].itemId,
          quantity: lines[i].quantity,
          uomId: lines[i].uomId,
          batchId: lines[i].batchId || null,
          serialNumber: lines[i].serialNumber || null,
          conditionCode: lines[i].conditionCode || 'GOOD',
          remarks: lines[i].remarks || null,
        });
        await this.materialReturnLineRepo.save(line);
      }
    }

    await this.materialReturnRepo.update(id, { updatedBy: userId });
    return this.findMaterialReturnById(id);
  }

  async postMaterialReturn(id: string, userId: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const returnRecord = await this.findMaterialReturnById(id, companyId, allowedDivisionIds);
    if (returnRecord.status !== 'DRAFT') throw new BadRequestException('Only DRAFT returns can be posted');
    if (!returnRecord.lines || returnRecord.lines.length === 0) {
      throw new BadRequestException('Cannot post a return with no line items');
    }

    const store = returnRecord.storeId ? await this.storeRepo.findOne({ where: { id: returnRecord.storeId } }) : null;
    if (!store || !store.warehouseId) {
      throw new BadRequestException('Return store has no linked warehouse; cannot post inventory');
    }

    try {
      await this.materialReturnRepo.manager.transaction(async (manager) => {
        const repo = manager.getRepository(MaterialReturn);
        const locked = await repo
          .createQueryBuilder('mr')
          .setLock('pessimistic_write')
          .where('mr.id = :id', { id })
          .getOne();
        if (!locked) throw new NotFoundException(`Material return ${id} not found`);
        if (locked.status !== 'DRAFT') throw new BadRequestException('Return has already been posted');

        const lockedLines = await manager.getRepository(MaterialReturnLine).find({
          where: { returnId: locked.id },
          order: { lineNumber: 'ASC' },
        });
        if (lockedLines.length === 0) {
          throw new BadRequestException('Cannot post a return with no line items');
        }

        for (const line of lockedLines) {
        const qty = Number(line.quantity || 0);
        if (qty <= 0) continue;

        const { postQty, postUomId } = await this.convertToBaseUom(
          manager,
          line.itemId,
          line.uomId,
          qty,
        );

        const cond = (line.conditionCode || locked.conditionCode || 'GOOD').toUpperCase();
        const isUsable = cond === 'GOOD' || cond === 'REUSABLE';

        if (isUsable) {
          await this.stockLedgerService.create({
            companyId: locked.companyId,
            transactionType: 'MATERIAL_RETURN',
            transactionDate: new Date(),
            itemId: line.itemId,
            warehouseId: store.warehouseId!,
            batchId: line.batchId || undefined,
            quantity: postQty,
            uomId: postUomId,
            direction: 'IN',
            referenceType: 'MATERIAL_RETURN',
            referenceId: locked.id,
            referenceNumber: locked.returnNumber,
            notes: `Material return ${locked.returnNumber} [${cond}]${postQty !== qty ? ` (${qty} converted to ${postQty})` : ''}`,
            createdBy: userId,
            divisionId: locked.divisionId,
            sectionId: locked.sectionId,
            departmentId: locked.departmentId || locked.fromDepartmentId,
          }, manager);

          await this.inventoryBalanceService.updateBalance(
            locked.companyId, line.itemId, store.warehouseId!,
            null, line.batchId, postUomId, postQty, 'IN', manager,
          );
        } else {
          const pool: 'scrap' | 'quarantine' =
            cond === 'DAMAGED' || cond === 'QUARANTINE' ? 'quarantine' : 'scrap';

          await this.addToScrapOrQuarantinePool(
            manager,
            locked.companyId,
            line.itemId,
            store.warehouseId!,
            postUomId,
            postQty,
            pool,
          );

          await this.stockLedgerService.create({
            companyId: locked.companyId,
            transactionType: 'MATERIAL_RETURN_SCRAP',
            transactionDate: new Date(),
            itemId: line.itemId,
            warehouseId: store.warehouseId!,
            batchId: line.batchId || undefined,
            quantity: postQty,
            uomId: postUomId,
            direction: 'IN',
            referenceType: 'MATERIAL_RETURN',
            referenceId: locked.id,
            referenceNumber: locked.returnNumber,
            notes: `Material return ${locked.returnNumber} routed to ${pool.toUpperCase()} pool [${cond}]`,
            createdBy: userId,
            divisionId: locked.divisionId,
            sectionId: locked.sectionId,
            departmentId: locked.departmentId || locked.fromDepartmentId,
          }, manager);
        }
      }

        await repo.update(locked.id, {
          status: 'POSTED',
          postedBy: userId,
          postedAt: new Date(),
          updatedBy: userId,
        });
      });
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      const detail = err?.driverError?.message || err?.message || 'Unexpected database error while posting material return';
      this.logger.error(`Failed to post material return ${returnRecord.returnNumber} (${id}): ${detail}`, err?.stack);
      throw new InternalServerErrorException(`Failed to post material return ${returnRecord.returnNumber}: ${detail}`);
    }

    return this.findMaterialReturnById(id);
  }

  async cancelMaterialReturn(id: string, userId: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const returnRecord = await this.findMaterialReturnById(id, companyId, allowedDivisionIds);
    if (returnRecord.status !== 'DRAFT') throw new BadRequestException('Only DRAFT returns can be cancelled');
    returnRecord.status = 'CANCELLED';
    returnRecord.cancelledBy = userId;
    returnRecord.cancelledAt = new Date();
    return this.materialReturnRepo.save(returnRecord);
  }

  /**
   * Move a Goods Inward Note to the Recycle Bin.
   *
   * Same guard rationale as `removeMaterialIssue`: a POSTED return has already
   * booked inbound `stock_ledger` movements, so recycling it would orphan those
   * receipts.
   */
  async removeMaterialReturn(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const returnRecord = await this.findMaterialReturnById(id, companyId, allowedDivisionIds);
    if (!['DRAFT', 'CANCELLED'].includes(returnRecord.status)) {
      throw new BadRequestException(
        `A ${returnRecord.status} return has already moved stock and cannot be recycled. ` +
          'Raise a stock adjustment instead.',
      );
    }
    returnRecord.deletedAt = new Date();
    returnRecord.deletedBy = userId ?? null;
    return this.materialReturnRepo.save(returnRecord);
  }

  // ==================== DASHBOARD ====================

  async getDashboard(companyId: string, allowedDivisionIds?: DivisionAccess) {
    // PROMPT #27 — the store dashboard is a roll-up of division-scoped
    // documents. A restricted caller must not see another division's pending
    // approvals or today's issues/returns in their tile counts, so every count
    // below is scoped rather than company-wide.
    const totalStores = await this.storeRepo.count({
      where: narrowWhereByDivision({ companyId, status: 'ACTIVE' }, 'divisionId', allowedDivisionIds),
    });
    const storeItemQb = this.storeItemRepo.createQueryBuilder('si')
      .innerJoin('si.store', 's')
      .where('s.company_id = :companyId', { companyId });
    applyDivisionScopeFilter(storeItemQb as any, 's.division_id', allowedDivisionIds);
    const totalStoreItems = await storeItemQb.getCount();

    const pendingRequests = await this.materialRequestRepo.count({
      where: narrowWhereByDivision({ companyId, status: 'SUBMITTED' }, 'divisionId', allowedDivisionIds),
    });

    const pendingApprovals = await this.materialRequestRepo.count({
      where: narrowWhereByDivision({ companyId, status: 'SUBMITTED' }, 'divisionId', allowedDivisionIds),
    });

    const pendingPrConversion = await this.materialRequestRepo.count({
      where: narrowWhereByDivision({ companyId, status: 'APPROVED' }, 'divisionId', allowedDivisionIds),
    });

    const pendingEta = await this.materialRequestRepo.count({
      where: narrowWhereByDivision({ companyId, etaPending: true }, 'divisionId', allowedDivisionIds),
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayIssueQb = this.materialIssueRepo.createQueryBuilder('mi')
      .where('mi.company_id = :companyId', { companyId })
      .andWhere('mi.issue_date >= :today', { today: today.toISOString().split('T')[0] });
    applyDivisionScopeFilter(todayIssueQb as any, 'mi.division_id', allowedDivisionIds);
    const todayIssues = await todayIssueQb.getCount();

    const todayReturnQb = this.materialReturnRepo.createQueryBuilder('mr')
      .where('mr.company_id = :companyId', { companyId })
      .andWhere('mr.return_date >= :today', { today: today.toISOString().split('T')[0] });
    applyDivisionScopeFilter(todayReturnQb as any, 'mr.division_id', allowedDivisionIds);
    const todayReturns = await todayReturnQb.getCount();

    return {
      totalStores,
      totalStoreItems,
      pendingRequests,
      pendingApprovals,
      pendingPrConversion,
      pendingEta,
      todayIssues,
      todayReturns,
    };
  }
}