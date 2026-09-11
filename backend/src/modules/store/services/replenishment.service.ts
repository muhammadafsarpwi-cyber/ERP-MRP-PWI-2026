import { Injectable, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Store } from '../entities/store.entity';
import { StoreItem } from '../entities/store-item.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { StoreReplenishment } from '../entities/store-replenishment.entity';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { StoreService } from './store.service';

const ACTIVE_MR_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_CONVERTED', 'FULLY_CONVERTED'];
const SYSTEM_ACTOR_USERNAME = 'system.replenishment';
const ACTIVE_PR_STATUSES = ['SUBMITTED', 'APPROVED'];
const OPEN_PO_STATUSES = ['APPROVED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED'];
const PENDING_RECEIPT_GRN_STATUSES = ['RECEIVED', 'INSPECTION', 'ACCEPTED', 'PARTIALLY_ACCEPTED'];

interface PipelineResult {
  onHand: number;
  reserved: number;
  available: number;
  uomId: string | null;
  pendingMrQty: number;
  prOutstanding: number;
  poOutstanding: number;
  pendingReceipt: number;
  postedReceiptCount: number;
  hasActiveMr: boolean;
  prIds: string[];
  prNumbers: string[];
  mr: {
    id: string;
    status: string;
    hasGmApproval: boolean;
    expectedDeliveryDate: string | null;
    poNumber: string | null;
    requestNumber: string;
    prId: string | null;
    prNumber: string | null;
    poId: string | null;
    poExpectedDelivery: string | null;
  } | null;
  po: { id: string; code: string; expectedDeliveryDate: string | null } | null;
}

@Injectable()
export class ReplenishmentService {
  private readonly logger = new Logger(ReplenishmentService.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(StoreItem)
    private readonly storeItemRepo: Repository<StoreItem>,
    @InjectRepository(StoreReplenishment)
    private readonly replenishmentRepo: Repository<StoreReplenishment>,
    @InjectRepository(MaterialRequest)
    private readonly materialRequestRepo: Repository<MaterialRequest>,
    private readonly balanceService: InventoryBalanceService,
    private readonly storeService: StoreService,
    private readonly dataSource: DataSource,
  ) {}

  // ==================== PUBLIC API ====================

  async runReplenishmentCheck(options: { companyId?: string; userId?: string; autoCreateMr?: boolean } = {}) {
    const runReference = `RUN-${Date.now()}`;
    const companyIds = options.companyId
      ? [options.companyId]
      : (await this.dataSource.query<{ id: string }[]>(`SELECT id FROM companies WHERE status = 'ACTIVE'`)).map((c) => c.id);

    // When the check runs without an authenticated caller (the scheduled
    // processor), resolve the dedicated system service actor so created_by /
    // updated_by are always a real, valid erp_users id — never ''.
    const actorId =
      options.userId || (options.autoCreateMr !== false ? await this.resolveSystemActor() : null);

    let createdRequests = 0;
    let checkedRows = 0;

    for (const companyId of companyIds) {
      const stores = await this.storeRepo.find({ where: { companyId, status: 'ACTIVE' as any } });
      for (const store of stores) {
        const storeItems = await this.storeItemRepo.find({ where: { storeId: store.id, status: 'ACTIVE' as any } });
        for (const storeItem of storeItems) {
          checkedRows += 1;
          try {
            const created = await this.checkStoreItem(companyId, store, storeItem, {
              userId: actorId,
              runReference,
              autoCreateMr: options.autoCreateMr !== false,
            });
            if (created) createdRequests += 1;
          } catch (error) {
            this.logger.error(
              `Replenishment check failed store=${store.id} item=${storeItem.itemId}: ${(error as Error).message}`,
            );
          }
        }
      }
    }

    return {
      runReference,
      companiesProcessed: companyIds.length,
      rowsChecked: checkedRows,
      requestsAutoCreated: createdRequests,
    };
  }

  async getQueue(
    companyId: string,
    filters: {
      status?: string;
      statuses?: string;
      storeId?: string;
      divisionId?: string;
      itemId?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { page = 1, limit = 20 } = filters;
    const where: string[] = ['r.company_id = $1'];
    const params: any[] = [companyId];

    const push = (sql: string, value: any) => {
      where.push(sql);
      params.push(value);
    };

    if (filters.status) {
      push(`r.status = $${params.length + 1}`, filters.status);
    }
    if (filters.statuses) {
      const list = filters.statuses.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) {
        params.push(list);
        where.push(`r.status = ANY($${params.length})`);
      }
    }
    if (filters.storeId) push(`r.store_id = $${params.length + 1}`, filters.storeId);
    if (filters.divisionId) push(`r.division_id = $${params.length + 1}`, filters.divisionId);
    if (filters.itemId) push(`r.item_id = $${params.length + 1}`, filters.itemId);
    if (filters.search) {
      push(
        `(i.item_code ILIKE $${params.length + 1} OR i.name ILIKE $${params.length + 1} OR s.store_name ILIKE $${params.length + 1})`,
        `%${filters.search}%`,
      );
    }

    const whereSql = where.join(' AND ');
    const totalRow = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total
         FROM store_replenishments r
         JOIN stores s ON s.id = r.store_id
         JOIN items i ON i.id = r.item_id
        WHERE ${whereSql}`,
      params,
    );

    const orderBy = `
      CASE r.status
        WHEN 'OVERDUE' THEN 1
        WHEN 'LOW_STOCK' THEN 2
        WHEN 'REORDER_REQUIRED' THEN 3
        WHEN 'MANAGER_APPROVAL' THEN 4
        WHEN 'GM_APPROVAL' THEN 5
        WHEN 'PR_PENDING' THEN 6
        WHEN 'ORDERED' THEN 7
        WHEN 'PARTIALLY_RECEIVED' THEN 8
        WHEN 'RECEIVED' THEN 9
        WHEN 'DEFERRED' THEN 10
        WHEN 'CANCELLED' THEN 11
        ELSE 12
      END ASC,
      (COALESCE(r.available, 0) - COALESCE(r.reorder_level, 0)) ASC`;

    const data: any[] = await this.dataSource.query(
      `SELECT r.id, r.company_id AS "companyId", r.store_id AS "storeId",
              r.store_item_id AS "storeItemId", r.item_id AS "itemId",
              r.warehouse_id AS "warehouseId", r.division_id AS "divisionId",
              r.section_id AS "sectionId", r.department_id AS "departmentId",
              r.uom_id AS "uomId",
              COALESCE(r.on_hand, 0) AS "onHand", COALESCE(r.reserved, 0) AS "reserved",
              COALESCE(r.available, 0) AS "available",
              COALESCE(r.minimum_stock, 0) AS "minimumStock",
              COALESCE(r.reorder_level, 0) AS "reorderLevel",
              COALESCE(r.maximum_stock, 0) AS "maximumStock",
              r.reorder_quantity AS "reorderQuantity",
              COALESCE(r.required_quantity, 0) AS "requiredQuantity",
              COALESCE(r.already_in_procurement, 0) AS "alreadyInProcurement",
              COALESCE(r.pending_receipt, 0) AS "pendingReceipt",
              COALESCE(r.remaining_requirement, 0) AS "remainingRequirement",
              r.status, r.source, r.auto_create_mr AS "autoCreateMr",
              r.material_request_id AS "materialRequestId",
              r.material_request_number AS "materialRequestNumber",
              r.pr_id AS "prId", r.pr_number AS "prNumber",
              r.po_id AS "poId", r.po_number AS "poNumber",
              r.expected_delivery_date AS "expectedDeliveryDate",
              r.overdue_since AS "overdueSince",
              r.deferred, r.deferred_until AS "deferredUntil",
              r.deferred_reason AS "deferredReason",
              r.cancelled, r.cancelled_at AS "cancelledAt",
              r.cancelled_by AS "cancelledBy", r.cancel_reason AS "cancelReason",
              r.adjusted_quantity AS "adjustedQuantity",
              r.adjusted_reason AS "adjustedReason",
              r.last_checked_at AS "lastCheckedAt",
              i.item_code AS "itemCode", i.name AS "itemName",
              s.store_code AS "storeCode", s.store_name AS "storeName",
              s.store_type AS "storeType",
              u.code AS "uomCode",
              d.name AS "divisionName", sec.name AS "sectionName",
              dep.name AS "departmentName", w.name AS "warehouseName"
         FROM store_replenishments r
         JOIN stores s ON s.id = r.store_id
         JOIN items i ON i.id = r.item_id
         LEFT JOIN uoms u ON u.id = r.uom_id
         LEFT JOIN divisions d ON d.id = r.division_id
         LEFT JOIN sections sec ON sec.id = r.section_id
         LEFT JOIN departments dep ON dep.id = r.department_id
         LEFT JOIN warehouses w ON w.id = r.warehouse_id
        WHERE ${whereSql}
        ORDER BY ${orderBy}
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit],
    );

    return {
      data,
      total: Number(totalRow[0]?.total) || 0,
      page,
      limit,
    };
  }

  async getKpis(companyId: string) {
    const rows = await this.dataSource.query<{ status: string; cnt: number }[]>(
      `SELECT status, COUNT(*)::int AS cnt FROM store_replenishments WHERE company_id = $1 GROUP BY status`,
      [companyId],
    );
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      byStatus[row.status] = row.cnt;
      total += row.cnt;
    }

    const count = (s: string) => byStatus[s] || 0;
    const kpis = [
      { key: 'total', label: 'Total Store Items', value: total, color: 'blue' },
      { key: 'lowStock', label: 'Low Stock', value: count('LOW_STOCK'), color: 'red' },
      { key: 'reorderRequired', label: 'Reorder Required', value: count('REORDER_REQUIRED'), color: 'orange' },
      { key: 'prPending', label: 'Pending PR', value: count('PR_PENDING'), color: 'purple' },
      { key: 'pendingManagerApproval', label: 'Pending Manager Approval', value: count('MANAGER_APPROVAL'), color: 'gold' },
      { key: 'pendingGmApproval', label: 'Pending GM Approval', value: count('GM_APPROVAL'), color: 'cyan' },
      { key: 'ordered', label: 'Ordered', value: count('ORDERED'), color: 'geekblue' },
      { key: 'pendingReceipt', label: 'Pending Receipt', value: count('PARTIALLY_RECEIVED'), color: 'green' },
      { key: 'overdue', label: 'Overdue Deliveries', value: count('OVERDUE'), color: 'volcano' },
    ];
    return { kpis, byStatus, total };
  }

  // ==================== MANUAL OVERRIDES (audited) ====================

  async adjustQuantity(id: string, userId: string, dto: { quantity: number; reason: string }, companyId?: string) {
    const row = await this.requireRow(id, companyId);
    if (row.cancelled) throw new BadRequestException('Cannot adjust a cancelled replenishment');
    if (Number(dto.quantity) < 0) throw new BadRequestException('Adjusted quantity cannot be negative');

    row.adjustedQuantity = Number(dto.quantity);
    row.adjustedReason = dto.reason;
    row.adjustedBy = userId;
    row.adjustedAt = new Date();
    row.overriddenBy = userId;
    row.overriddenAt = new Date();
    row.requiredQuantity = Number(dto.quantity);
    row.remainingRequirement = Math.max(
      0,
      Number(dto.quantity) - Number(row.alreadyInProcurement || 0),
    );
    row.updatedBy = userId;
    return this.replenishmentRepo.save(row);
  }

  async defer(id: string, userId: string, dto: { until?: string; reason: string }, companyId?: string) {
    const row = await this.requireRow(id, companyId);
    if (row.cancelled) throw new BadRequestException('Cannot defer a cancelled replenishment');

    row.deferred = true;
    row.deferredUntil = dto.until || null;
    row.deferredReason = dto.reason;
    row.overriddenBy = userId;
    row.overriddenAt = new Date();
    row.updatedBy = userId;
    return this.replenishmentRepo.save(row);
  }

  async cancel(id: string, userId: string, dto: { reason: string }, companyId?: string) {
    const row = await this.requireRow(id, companyId);
    if (row.cancelled) throw new BadRequestException('Replenishment already cancelled');

    row.cancelled = true;
    row.cancelledAt = new Date();
    row.cancelledBy = userId;
    row.cancelReason = dto.reason;
    row.overriddenBy = userId;
    row.overriddenAt = new Date();
    row.updatedBy = userId;
    return this.replenishmentRepo.save(row);
  }

  async unreview(id: string, userId: string, companyId?: string) {
    const row = await this.requireRow(id, companyId);
    row.deferred = false;
    row.deferredUntil = null;
    row.deferredReason = null;
    row.cancelled = false;
    row.cancelledAt = null;
    row.cancelledBy = null;
    row.cancelReason = null;
    row.overriddenBy = userId;
    row.overriddenAt = new Date();
    row.updatedBy = userId;
    return this.replenishmentRepo.save(row);
  }

  async createMr(id: string, userId: string, companyId?: string) {
    const row = await this.requireRow(id, companyId);
    if (row.cancelled) throw new BadRequestException('Cannot create a request for a cancelled replenishment');
    if (row.materialRequestId) {
      throw new BadRequestException(`Material request ${row.materialRequestNumber} already exists for this item`);
    }

    const activeMr = await this.findActiveMr(row.companyId, row.storeId, row.itemId);
    if (activeMr) {
      throw new BadRequestException(`An active material request (${activeMr.request_number}) already exists for this item`);
    }

    const effectiveRequired = Number(row.adjustedQuantity ?? row.requiredQuantity ?? 0);
    const qty = Math.max(0, effectiveRequired - Number(row.alreadyInProcurement || 0));
    if (qty <= 0) {
      throw new BadRequestException('No remaining requirement to request');
    }

    let uomId = row.uomId;
    if (!uomId) {
      const itemRow = await this.dataSource.query<{ base_uom_id: string | null }[]>(
        `SELECT base_uom_id FROM items WHERE id = $1`,
        [row.itemId],
      );
      uomId = itemRow[0]?.base_uom_id || null;
    }

    const requestNumber = await this.nextRequestNumber(row.companyId);
    const created = await this.storeService.createMaterialRequest(
      {
        divisionId: row.divisionId || undefined,
        sectionId: row.sectionId || undefined,
        departmentId: row.departmentId || undefined,
        requestNumber,
        requestDate: this.todayIso(),
        requiredDate: this.addDays(this.todayIso(), 7),
        storeId: row.storeId,
        purpose: `Automatic replenishment - item ${row.itemId}`,
        referenceDocument: `REPLENISH-${row.id.slice(0, 8)}`,
        priority: 'NORMAL',
        lines: [
          {
            itemId: row.itemId,
            requestedQuantity: qty,
            uomId: uomId || undefined,
            requiredDate: this.addDays(this.todayIso(), 7),
            availableStock: Number(row.available || 0),
            minimumStock: Number(row.minimumStock || 0),
            maximumStock: Number(row.maximumStock || 0),
            currentShortage: Math.max(0, Number(row.minimumStock || 0) - Number(row.available || 0)),
            remarks: `Auto-created from replenishment queue (${row.source})`,
          },
        ],
      } as any,
      userId,
    );

    row.materialRequestId = created.id;
    row.materialRequestNumber = created.requestNumber;
    row.status = 'PR_PENDING';
    row.updatedBy = userId;
    await this.replenishmentRepo.save(row);

    return { ...row, createdRequest: { id: created.id, requestNumber: created.requestNumber, status: created.status } };
  }

  async convertToPr(id: string, userId: string, companyId: string, lineQuantities?: { lineId: string; quantity: number; estimatedUnitPrice?: number }[]) {
    const row = await this.requireRow(id, companyId);
    if (!row.materialRequestId) {
      throw new BadRequestException('No material request exists yet for this replenishment');
    }

    const request = await this.materialRequestRepo.findOne({ where: { id: row.materialRequestId } });
    if (!request) throw new BadRequestException('Linked material request not found');
    if (request.cancelledAt) throw new BadRequestException('Linked material request is cancelled');
    if (request.rejectedAt) throw new BadRequestException('Linked material request is rejected');

    // Strict approval gate — this endpoint must NOT fabricate approval. If the
    // linked material request has not cleared every required approval step, the
    // conversion is rejected with a business error naming the missing step.
    // Only a genuinely manager-approved AND GM-approved request can be converted.
    if (request.status === 'DRAFT') {
      throw new BadRequestException(
        `Material request ${request.requestNumber} is still DRAFT. Submit it for approval before converting to PR.`,
      );
    }
    if (request.status === 'SUBMITTED') {
      throw new BadRequestException(
        `Material request ${request.requestNumber} is awaiting manager approval. Convert to PR requires manager approval.`,
      );
    }
    if (request.status === 'APPROVED' && !request.gmApprovedAt) {
      throw new BadRequestException(
        `Material request ${request.requestNumber} is manager-approved but is awaiting GM approval. Convert to PR requires GM approval.`,
      );
    }
    if (request.status !== 'APPROVED' || !request.gmApprovedAt) {
      throw new BadRequestException(
        `Material request ${request.requestNumber} cannot be converted to PR in its current status (${request.status}).`,
      );
    }

    await this.storeService.convertRequestToPr(request.id, userId, companyId, { lineQuantities });

    const updated = await this.storeService.findMaterialRequestById(request.id);
    row.prId = updated.prId;
    row.prNumber = updated.prNumber;
    row.poId = updated.poId;
    row.poNumber = updated.poNumber;
    row.status = 'PR_PENDING';
    row.updatedBy = userId;
    await this.replenishmentRepo.save(row);

    return { id: row.id, prId: row.prId, prNumber: row.prNumber, materialRequestNumber: row.materialRequestNumber };
  }

  // ==================== INTERNAL ====================

  /**
   * Resolve the dedicated system/service actor used by the scheduled
   * (non-interactive) replenishment processor. The account is created by
   * migration 00057 and MUST NOT be the current user, a random uuid, or a
   * hardcoded user id — it is a legitimate, stable service identity whose ERP
   * user id is looked up at runtime. Returns null when the account is missing
   * so automatic creation is safely skipped instead of storing an invalid id.
   */
  private async resolveSystemActor(): Promise<string | null> {
    const rows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM erp_users WHERE username = $1 AND status = 'ACTIVE' LIMIT 1`,
      [SYSTEM_ACTOR_USERNAME],
    );
    return rows[0]?.id || null;
  }

  private async requireRow(id: string, companyId?: string): Promise<StoreReplenishment> {
    const row = await this.replenishmentRepo.findOne({ where: { id } });
    if (!row) throw new BadRequestException(`Replenishment row '${id}' not found`);
    if (companyId && row.companyId !== companyId) {
      throw new ForbiddenException(`Replenishment row '${id}' belongs to a different company`);
    }
    return row;
  }

  private async checkStoreItem(
    companyId: string,
    store: Store,
    storeItem: StoreItem,
    opts: { userId: string | null; runReference: string; autoCreateMr: boolean },
  ): Promise<boolean> {
    const pipeline = await this.computePipeline(companyId, store, storeItem);

    const existing = await this.replenishmentRepo.findOne({
      where: { companyId, storeId: store.id, itemId: storeItem.itemId },
    });

    // Effective required quantity honors an audited manual adjustment.
    const autoRequired = Math.max(0, Number(storeItem.maximumStock || 0) - pipeline.available);
    const requiredQuantity =
      existing?.adjustedQuantity != null ? Number(existing.adjustedQuantity) : autoRequired;

    let reorderQuantity: number | null = null;
    if (Number(storeItem.maximumStock) > Number(storeItem.reorderLevel)) {
      reorderQuantity = Math.max(0, Number(storeItem.maximumStock) - Number(storeItem.reorderLevel));
    } else if (Number(storeItem.reorderLevel) > 0) {
      reorderQuantity = Math.max(0, Number(storeItem.reorderLevel) - pipeline.available);
    }

    const alreadyInProcurement = pipeline.pendingMrQty + pipeline.prOutstanding + pipeline.poOutstanding;
    const remainingRequirement = Math.max(0, requiredQuantity - alreadyInProcurement);

    const deferredActive = existing?.deferred === true && (!existing.deferredUntil || existing.deferredUntil >= this.todayIso());

    const now = new Date();
    const base: Partial<StoreReplenishment> = {
      storeItemId: storeItem.id,
      warehouseId: store.warehouseId,
      divisionId: store.divisionId,
      sectionId: store.sectionId,
      departmentId: store.departmentId,
      uomId: pipeline.uomId || null,
      onHand: pipeline.onHand,
      reserved: pipeline.reserved,
      available: pipeline.available,
      minimumStock: Number(storeItem.minimumStock || 0),
      reorderLevel: Number(storeItem.reorderLevel || 0),
      maximumStock: Number(storeItem.maximumStock || 0),
      reorderQuantity,
      requiredQuantity,
      alreadyInProcurement,
      pendingReceipt: pipeline.pendingReceipt,
      remainingRequirement,
      lastCheckedAt: now,
      runReference: opts.runReference,
      updatedBy: opts.userId || undefined,
    };

    const mrRef = pipeline.mr;
    if (mrRef) {
      base.materialRequestId = mrRef.id;
      base.materialRequestNumber = mrRef.requestNumber;
      base.prId = mrRef.prId;
      base.prNumber = mrRef.prNumber;
      base.poId = mrRef.poId;
      base.poNumber = mrRef.poNumber;
      base.expectedDeliveryDate = mrRef.poExpectedDelivery || mrRef.expectedDeliveryDate;
    }
    if (pipeline.po) {
      base.poId = pipeline.po.id;
      base.poNumber = pipeline.po.code;
      base.expectedDeliveryDate = pipeline.po.expectedDeliveryDate || base.expectedDeliveryDate;
    }

    const status = this.deriveStatus({
      cancelled: existing?.cancelled === true,
      deferredActive,
      available: pipeline.available,
      minimumStock: Number(storeItem.minimumStock || 0),
      reorderLevel: Number(storeItem.reorderLevel || 0),
      poOutstanding: pipeline.poOutstanding,
      pendingReceipt: pipeline.pendingReceipt,
      prOutstanding: pipeline.prOutstanding,
      mr: pipeline.mr,
      postedReceiptCount: pipeline.postedReceiptCount,
    });

    base.status = status;
    if (status === 'OVERDUE' && !existing?.overdueSince) {
      base.overdueSince = this.todayIso();
    } else if (status !== 'OVERDUE' && existing?.overdueSince) {
      base.overdueSince = null;
    }

    let row: StoreReplenishment;
    if (existing) {
      Object.assign(existing, base);
      row = await this.replenishmentRepo.save(existing);
    } else {
      row = this.replenishmentRepo.create({
        ...(base as StoreReplenishment),
        companyId,
        storeId: store.id,
        itemId: storeItem.itemId,
        source: 'AUTOMATIC',
        autoCreateMr: true,
        createdBy: opts.userId || null,
      });
      row = await this.replenishmentRepo.save(row);
    }

    // Idempotent auto MR creation - only when nothing is already in the pipeline
    // and the row is not suppressed (cancelled / deferred).
    let autoCreated = false;
    if (
      opts.autoCreateMr &&
      row.autoCreateMr &&
      !row.cancelled &&
      !deferredActive &&
      !row.materialRequestId &&
      !pipeline.hasActiveMr &&
      row.remainingRequirement > 0 &&
      ['LOW_STOCK', 'REORDER_REQUIRED'].includes(row.status)
    ) {
      if (!opts.userId) {
        this.logger.warn(
          `Skipping auto MR creation for store=${store.id} item=${storeItem.itemId}: ` +
            `no authenticated user and the system service actor ('${SYSTEM_ACTOR_USERNAME}') is unavailable`,
        );
      } else {
        await this.createMr(row.id, opts.userId);
        autoCreated = true;
      }
    }

    return autoCreated;
  }

  private async computePipeline(companyId: string, store: Store, storeItem: StoreItem): Promise<PipelineResult> {
    const itemId = storeItem.itemId;
    const storeId = store.id;
    const warehouseId = store.warehouseId;

    // 1. Real stock from inventory_balances
    let onHand = 0;
    let reserved = 0;
    let available = 0;
    let uomId: string | null = null;

    if (warehouseId) {
      const balance = await this.balanceService.findByItemWarehouse(companyId, itemId, warehouseId);
      if (balance) {
        onHand = Number(balance.onHand || 0);
        reserved = Number(balance.reserved || 0);
        available = onHand - reserved;
        uomId = balance.uomId || null;
      }
    } else {
      const row = await this.dataSource.query<{ on_hand: number; reserved: number; available: number; uom_id: string | null }[]>(
        `SELECT COALESCE(SUM(b.on_hand), 0) AS on_hand,
                COALESCE(SUM(b.reserved), 0) AS reserved,
                COALESCE(SUM(b.on_hand - b.reserved), 0) AS available,
                MIN(b.uom_id) AS uom_id
           FROM inventory_balances b
          WHERE b.company_id = $1 AND b.item_id = $2 AND b.status = 'ACTIVE'`,
        [companyId, itemId],
      );
      onHand = Number(row[0]?.on_hand || 0);
      reserved = Number(row[0]?.reserved || 0);
      available = Number(row[0]?.available || 0);
      uomId = row[0]?.uom_id || null;
    }

    // 2. Active material requests for this store + item
    const activeMrs = await this.dataSource.query<any[]>(
      `SELECT mr.id, mr.request_number AS "requestNumber", mr.status,
              mr.gm_approved_at AS "gmApprovedAt", mr.pr_id AS "prId",
              mr.pr_number AS "prNumber", mr.po_id AS "poId", mr.po_number AS "poNumber",
              mr.expected_delivery_date AS "expectedDeliveryDate",
              COALESCE(mrl.requested_quantity, 0) AS "requestedQuantity",
              COALESCE(mrl.pr_created_qty, 0) AS "prCreatedQty",
              COALESCE(mrl.issued_quantity, 0) AS "issuedQuantity"
         FROM material_requests mr
         JOIN material_request_lines mrl ON mrl.request_id = mr.id
        WHERE mr.company_id = $1 AND mr.store_id = $2 AND mrl.item_id = $3
          AND mr.status = ANY($4)
          AND mr.rejected_at IS NULL AND mr.cancelled_at IS NULL`,
      [companyId, storeId, itemId, ACTIVE_MR_STATUSES],
    );

    const pendingMrQty = activeMrs.reduce(
      (sum, m) => sum + Math.max(0, Number(m.requestedQuantity || 0) - Number(m.prCreatedQty || 0) - Number(m.issuedQuantity || 0)),
      0,
    );

    // 3. Collect linked PR ids; find PO lines for those PRs (or via MR.poNumber direct)
    const prIds = Array.from(new Set<string>(activeMrs.map((m) => m.prId).filter((pid): pid is string => !!pid)));

    let prOutstanding = 0;
    let prNumbers: string[] = [];
    let poRows: any[] = [];

    if (prIds.length) {
      const prRows = await this.dataSource.query<any[]>(
        `SELECT pr.id, pr.requisition_code AS "code", pr.status,
                COALESCE(prl.quantity, 0) AS "qty"
           FROM purchase_requisitions pr
           JOIN purchase_requisition_lines prl ON prl.requisition_id = pr.id
          WHERE pr.id = ANY($1) AND prl.item_id = $2
            AND pr.status = ANY($3)
            AND pr.status NOT IN ('CANCELLED', 'REJECTED')`,
        [prIds, itemId, ACTIVE_PR_STATUSES],
      );
      poRows = await this.dataSource.query<any[]>(
        `SELECT pol.po_id AS "poId", pol.quantity, pol.received_quantity AS "receivedQuantity",
                po.po_code AS "poCode", po.status AS "poStatus",
                po.expected_delivery_date AS "expectedDeliveryDate"
           FROM purchase_order_lines pol
           JOIN purchase_orders po ON po.id = pol.po_id
          WHERE po.requisition_id = ANY($1) AND pol.item_id = $2
            AND po.status = ANY($3)
            AND po.cancelled_at IS NULL`,
        [prIds, itemId, OPEN_PO_STATUSES],
      );

      const prPlanned = prRows.reduce((sum, p) => sum + Number(p.qty || 0), 0);
      const poOrdered = poRows.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
      prOutstanding = Math.max(0, prPlanned - poOrdered);
      prNumbers = Array.from(new Set<string>(prRows.map((p) => p.code)));
    } else {
      // Direct POs attached via MR.po_number without a PR requisition_id link
      const mrPoNumbers = Array.from(new Set(
        activeMrs.map((m) => m.poNumber).filter((n): n is string => !!n).map((n) => n.toLowerCase()),
      ));
      if (mrPoNumbers.length) {
        poRows = await this.dataSource.query<any[]>(
          `SELECT pol.po_id AS "poId", pol.quantity, pol.received_quantity AS "receivedQuantity",
                  po.po_code AS "poCode", po.status AS "poStatus",
                  po.expected_delivery_date AS "expectedDeliveryDate"
             FROM purchase_order_lines pol
             JOIN purchase_orders po ON po.id = pol.po_id
            WHERE pol.item_id = $1
              AND po.company_id = $2
              AND po.requisition_id IS NULL
              AND po.status = ANY($3)
              AND po.cancelled_at IS NULL`,
          [itemId, companyId, OPEN_PO_STATUSES],
        );
        poRows = poRows.filter((p) => mrPoNumbers.includes(String(p.poCode || '').toLowerCase()));
      }
    }

    // 4. Pending receipts (received but not posted to stock)
    const pendingReceiptRows = await this.dataSource.query<{ pending: number }[]>(
      `SELECT COALESCE(SUM(COALESCE(grl.quantity_received, 0) - COALESCE(grl.quantity_rejected, 0)), 0) AS pending
         FROM goods_receipt_lines grl
         JOIN goods_receipts gr ON gr.id = grl.receipt_id
        WHERE grl.item_id = $1
          AND gr.status = ANY($2)
          ${warehouseId ? 'AND gr.warehouse_id = $3' : ''}`,
      warehouseId ? [itemId, PENDING_RECEIPT_GRN_STATUSES, warehouseId] : [itemId, PENDING_RECEIPT_GRN_STATUSES],
    );
    const pendingReceipt = Number(pendingReceiptRows[0]?.pending || 0);

    // 5. Posted receipts (already received / received → inspect → accept → posted)
    const postedRows = await this.dataSource.query<{ cnt: number }[]>(
      `SELECT COUNT(*)::int AS cnt
         FROM goods_receipts gr
         JOIN goods_receipt_lines grl ON grl.receipt_id = gr.id
        WHERE grl.item_id = $1 AND gr.status = 'POSTED'
          ${warehouseId ? 'AND gr.warehouse_id = $2' : ''}`,
      warehouseId ? [itemId, warehouseId] : [itemId],
    );
    const postedReceiptCount = Number(postedRows[0]?.cnt || 0);

    // 6. Best MR for status derivation
    const bestMr = activeMrs.length
      ? activeMrs.sort((a: any, b: any) => this.rankMr(b) - this.rankMr(a))[0]
      : null;

    // 7. PO outstanding
    const poOutstanding = poRows.reduce(
      (sum: number, p: any) => sum + Math.max(0, Number(p.quantity || 0) - Number(p.receivedQuantity || 0)),
      0,
    );

    const po = poRows.length
      ? { id: String(poRows[0].poId), code: String(poRows[0].poCode), expectedDeliveryDate: (poRows[0].expectedDeliveryDate as string) || null }
      : null;

    return {
      onHand, reserved, available, uomId,
      pendingMrQty, prOutstanding, poOutstanding,
      pendingReceipt, postedReceiptCount,
      hasActiveMr: activeMrs.length > 0,
      prIds, prNumbers,
      mr: bestMr
        ? {
            id: bestMr.id as string,
            status: bestMr.status as string,
            hasGmApproval: !!bestMr.gmApprovedAt,
            expectedDeliveryDate: bestMr.expectedDeliveryDate || null,
            poNumber: bestMr.poNumber || null,
            requestNumber: bestMr.requestNumber as string,
            prId: bestMr.prId || null,
            prNumber: bestMr.prNumber || null,
            poId: bestMr.poId || null,
            poExpectedDelivery: po?.expectedDeliveryDate || null,
          }
        : null,
      po,
    };
  }

  private rankMr(m: any): number {
    if (m.prId || ['PARTIALLY_CONVERTED', 'FULLY_CONVERTED'].includes(m.status)) return 5;
    if (m.status === 'APPROVED' && m.gmApprovedAt) return 4;
    if (m.status === 'APPROVED') return 3;
    if (m.status === 'SUBMITTED') return 2;
    return 1;
  }

  private deriveStatus(ctx: {
    cancelled: boolean;
    deferredActive: boolean;
    available: number;
    minimumStock: number;
    reorderLevel: number;
    poOutstanding: number;
    pendingReceipt: number;
    prOutstanding: number;
    mr: PipelineResult['mr'];
    postedReceiptCount: number;
  }): string {
    if (ctx.cancelled) return 'CANCELLED';
    if (ctx.deferredActive) return 'DEFERRED';

    if (ctx.poOutstanding > 0) {
      if (ctx.mr?.poExpectedDelivery && ctx.mr.poExpectedDelivery < this.todayIso()) return 'OVERDUE';
      if (ctx.pendingReceipt > 0) return 'PARTIALLY_RECEIVED';
      return 'ORDERED';
    }

    if (ctx.prOutstanding > 0) return 'PR_PENDING';

    const mr = ctx.mr;
    if (mr) {
      if (mr.prId || ['PARTIALLY_CONVERTED', 'FULLY_CONVERTED'].includes(mr.status)) {
        if (mr.expectedDeliveryDate && mr.expectedDeliveryDate < this.todayIso()) return 'OVERDUE';
        return 'PR_PENDING';
      }
      if (mr.status === 'SUBMITTED') return 'MANAGER_APPROVAL';
      if (mr.status === 'APPROVED') return mr.hasGmApproval ? 'PR_PENDING' : 'GM_APPROVAL';
      return 'PR_PENDING'; // DRAFT / other
    }

    if (ctx.available <= ctx.minimumStock) return 'LOW_STOCK';
    if (ctx.available <= ctx.reorderLevel) return 'REORDER_REQUIRED';
    if (ctx.postedReceiptCount > 0) return 'RECEIVED';
    return 'NORMAL';
  }

  private async findActiveMr(companyId: string, storeId: string, itemId: string): Promise<{ request_number: string } | null> {
    const rows = await this.dataSource.query<{ id: string; request_number: string }[]>(
      `SELECT DISTINCT mr.id, mr.request_number
         FROM material_requests mr
         JOIN material_request_lines mrl ON mrl.request_id = mr.id
        WHERE mr.company_id = $1 AND mr.store_id = $2 AND mrl.item_id = $3
          AND mr.status = ANY($4)
          AND mr.rejected_at IS NULL AND mr.cancelled_at IS NULL
        LIMIT 1`,
      [companyId, storeId, itemId, ACTIVE_MR_STATUSES],
    );
    return rows[0] || null;
  }

  private async nextRequestNumber(companyId: string): Promise<string> {
    const prefix = `RMR-${this.compactDate()}`;
    const rows = await this.dataSource.query<{ cnt: number }[]>(
      `SELECT COUNT(*)::int AS cnt
         FROM material_requests
        WHERE company_id = $1 AND request_number LIKE $2`,
      [companyId, `${prefix}%`],
    );
    const seq = (Number(rows[0]?.cnt) || 0) + 1;
    return `${prefix}-${String(seq).padStart(3, '0')}`;
  }

  private todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private compactDate(): string {
    return this.todayIso().replace(/-/g, '');
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
}