import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, In, IsNull } from 'typeorm';
import { InventoryBalance, InventoryPolicy } from '../entities';

@Injectable()
export class InventoryBalanceService {
  private readonly logger = new Logger(InventoryBalanceService.name);

  constructor(
    @InjectRepository(InventoryBalance)
    private readonly repo: Repository<InventoryBalance>,
    @InjectRepository(InventoryPolicy)
    private readonly policyRepo: Repository<InventoryPolicy>,
  ) {}

  async findByItemWarehouse(
    companyId: string,
    itemId: string,
    warehouseId: string,
    locationId?: string,
    batchId?: string | null,
    manager?: EntityManager,
  ): Promise<InventoryBalance | null> {
    const repo = manager ? manager.getRepository(InventoryBalance) : this.repo;
    const where: Record<string, any> = { companyId, itemId, warehouseId };
    if (locationId) where.locationId = locationId;
    if (batchId !== undefined) {
      where.batchId = batchId === null ? IsNull() : batchId;
    }
    return repo.findOne({
      where,
      relations: ['item', 'warehouse', 'location', 'batch', 'uom'],
      order: { onHand: 'DESC' },
    });
  }

  /**
   * Bulk, company-scoped, read-only balance lookup for many item/warehouse
   * pairs in a SINGLE query. Used by Inventory View on a multi-line receipt so
   * we never issue N separate balance requests (and never load the whole
   * company's inventory). Missing pairs simply have no row in the result —
   * that is a "no balance record" state, not a fabricated zero.
   */
  async findBalancesForItemWarehousePairs(
    companyId: string,
    pairs: Array<{ itemId: string; warehouseId: string }>,
  ): Promise<InventoryBalance[]> {
    if (!pairs.length) return [];
    const itemIds = [...new Set(pairs.map((p) => p.itemId).filter(Boolean))];
    const warehouseIds = [...new Set(pairs.map((p) => p.warehouseId).filter(Boolean))];
    if (!itemIds.length || !warehouseIds.length) return [];

    const balances = await this.repo.find({
      where: {
        companyId,
        status: 'ACTIVE',
        itemId: In(itemIds),
        warehouseId: In(warehouseIds),
      },
      relations: ['item', 'warehouse', 'uom'],
    });
    return this.enrichDynamicReservations(balances, companyId);
  }

  async findAll(filter: {
    page?: number;
    limit?: number;
    companyId?: string;
    itemId?: string;
    warehouseId?: string;
    divisionId?: string;
    consolidate?: boolean | string;
  }): Promise<{ data: InventoryBalance[]; total: number }> {
    const { page = 1, limit = 20, companyId, itemId, warehouseId, divisionId, consolidate } = filter;
    const isConsolidated = consolidate === true || consolidate === 'true' || consolidate === '1';

    const qb = this.repo
      .createQueryBuilder('balance')
      .leftJoinAndSelect('balance.item', 'item')
      .leftJoinAndSelect('balance.warehouse', 'warehouse')
      .leftJoinAndSelect('balance.location', 'location')
      .leftJoinAndSelect('balance.batch', 'batch')
      .leftJoinAndSelect('balance.uom', 'uom');

    if (companyId) qb.andWhere('balance.companyId = :companyId', { companyId });
    if (itemId) qb.andWhere('balance.itemId = :itemId', { itemId });
    if (warehouseId) qb.andWhere('balance.warehouseId = :warehouseId', { warehouseId });
    if (divisionId) qb.andWhere('warehouse.divisionId = :divisionId', { divisionId });

    qb.orderBy('item.itemCode', 'ASC')
      .addOrderBy('balance.createdAt', 'DESC');

    if (isConsolidated) {
      // For stock summary reports: return clean, 1-row-per-item-in-warehouse records
      const rawData = await qb.getMany();
      const enriched = await this.enrichDynamicReservations(rawData, companyId);

      const consolidatedMap = new Map<string, InventoryBalance>();
      for (const b of enriched) {
        const key = `${b.itemId}_${b.warehouseId}`;
        if (!consolidatedMap.has(key)) {
          consolidatedMap.set(key, {
            ...b,
            id: key,
            batchId: null as any,
            batch: null as any,
            locationId: null as any,
            location: null as any,
            onHand: Number(b.onHand || 0),
            reserved: Number(b.reserved || 0),
            available: Number(b.available || 0),
          });
        } else {
          const ex = consolidatedMap.get(key)!;
          // Sum up distinct batch slices without duplicating onHand
          const newOnHand = Math.round((ex.onHand + Number(b.onHand || 0)) * 10000) / 10000;
          const newReserved = Math.round((ex.reserved + Number(b.reserved || 0)) * 10000) / 10000;
          const newAvailable = Math.max(0, Math.round((newOnHand - newReserved) * 10000) / 10000);
          ex.onHand = newOnHand;
          ex.reserved = newReserved;
          ex.available = newAvailable;
        }
      }

      const allConsolidated = Array.from(consolidatedMap.values());
      const total = allConsolidated.length;
      const paginated = allConsolidated.slice((page - 1) * limit, page * limit);
      return { data: paginated, total };
    }

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const enriched = await this.enrichDynamicReservations(data, companyId);
    return { data: enriched, total };
  }

  async findOne(id: string): Promise<InventoryBalance> {
    const balance = await this.repo.findOne({
      where: { id },
      relations: ['item', 'warehouse', 'location', 'batch', 'uom', 'company'],
    });
    if (!balance) throw new NotFoundException(`Inventory balance with ID '${id}' not found`);
    const [enriched] = await this.enrichDynamicReservations([balance], balance.companyId);
    return enriched;
  }

  /**
   * Dynamically computes accurate RESERVED and AVAILABLE quantities from pending
   * Sales Orders, Delivery Orders, and active Inventory Reservations, while respecting
   * unreserved Safety Stock and distributing across batch rows without inflation.
   */
  private async enrichDynamicReservations(
    balances: InventoryBalance[],
    companyId?: string,
  ): Promise<InventoryBalance[]> {
    if (!balances || balances.length === 0) return balances;

    try {
      const fgBalances = balances.filter((b) => {
        const iType = (b.item?.itemType || '').toUpperCase();
        const iCode = (b.item?.itemCode || '').toUpperCase();
        return iType === 'FINISHED_GOOD' || iCode.includes('-FG-');
      });

      // 0. Stock Ledger Single Source of Truth Reconciliation:
      // Stock Ledger records every physical movement (+IN / -OUT). When inventory_balances
      // diverges (e.g. from historical direct consumption posts), reconcile onHand with the ledger.
      const allItemIds = Array.from(new Set(balances.map((b) => b.itemId).filter(Boolean)));
      if (allItemIds.length > 0) {
        try {
          const [ledgerSums, ledgerBatchSums]: [
            Array<{ item_id: string; warehouse_id: string; net_balance: string | number }>,
            Array<{ item_id: string; warehouse_id: string; batch_id: string | null; net_balance: string | number }>,
          ] = await Promise.all([
            this.repo.manager.query(
              `SELECT sl.item_id, sl.warehouse_id,
                      COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE -sl.quantity END), 0) AS net_balance
               FROM public.stock_ledger sl
               WHERE sl.transaction_type <> 'PRODUCTION_SCRAP'
                 AND sl.item_id = ANY($1)
                 ${companyId ? 'AND sl.company_id = $2' : ''}
               GROUP BY sl.item_id, sl.warehouse_id`,
              companyId ? [allItemIds, companyId] : [allItemIds],
            ),
            this.repo.manager.query(
              `SELECT sl.item_id, sl.warehouse_id, sl.batch_id,
                      COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE -sl.quantity END), 0) AS net_balance
               FROM public.stock_ledger sl
               WHERE sl.transaction_type <> 'PRODUCTION_SCRAP'
                 AND sl.item_id = ANY($1)
                 ${companyId ? 'AND sl.company_id = $2' : ''}
               GROUP BY sl.item_id, sl.warehouse_id, sl.batch_id`,
              companyId ? [allItemIds, companyId] : [allItemIds],
            ),
          ]);

          const ledgerMap = new Map<string, number>();
          for (const row of ledgerSums) {
            ledgerMap.set(`${row.item_id}_${row.warehouse_id}`, Number(row.net_balance || 0));
          }

          const ledgerBatchMap = new Map<string, number>();
          for (const row of ledgerBatchSums) {
            const bKey = `${row.item_id}_${row.warehouse_id}_${row.batch_id || 'null'}`;
            ledgerBatchMap.set(bKey, Number(row.net_balance || 0));
          }

          // Count balance rows per (item_id, warehouse_id)
          const rowsPerKey = new Map<string, number>();
          for (const b of balances) {
            const key = `${b.itemId}_${b.warehouseId}`;
            rowsPerKey.set(key, (rowsPerKey.get(key) || 0) + 1);
          }

          for (const b of balances) {
            const key = `${b.itemId}_${b.warehouseId}`;
            const count = rowsPerKey.get(key) || 1;

            let liveNet = 0;
            if (count === 1) {
              liveNet = ledgerMap.get(key) ?? Number(b.onHand || 0);
            } else {
              // Multiple batch rows: reconcile each batch row with its own ledger batch
              const bKey = `${b.itemId}_${b.warehouseId}_${b.batchId || 'null'}`;
              liveNet = ledgerBatchMap.has(bKey) ? ledgerBatchMap.get(bKey)! : 0;
            }

            const roundedNet = Math.round(liveNet * 10000) / 10000;
            if (Math.abs(Number(b.onHand || 0) - roundedNet) > 0.001) {
              b.onHand = roundedNet;
              // Asynchronously heal the static table row in the DB
              void this.repo.update({ id: b.id }, { onHand: roundedNet });
            }
          }
        } catch (ledgerErr) {
          this.logger.warn(`Could not reconcile balances with stock_ledger: ${(ledgerErr as any)?.message}`);
        }
      }

      // Normalize non-FG rows so reserved never exceeds onHand and available = onHand - reserved
      for (const b of balances) {
        const iType = (b.item?.itemType || '').toUpperCase();
        const iCode = (b.item?.itemCode || '').toUpperCase();
        const isFg = iType === 'FINISHED_GOOD' || iCode.includes('-FG-');
        if (!isFg) {
          const onHand = Number(b.onHand || 0);
          const reserved = Math.min(Math.max(0, onHand), Math.max(0, Number(b.reserved || 0)));
          b.reserved = Number(reserved.toFixed(4));
          b.available = Number((onHand - reserved).toFixed(4));
        }
      }

      if (fgBalances.length === 0) return balances;

      const fgItemIds = Array.from(new Set(fgBalances.map((b) => b.itemId).filter(Boolean)));
      const fgWarehouseIds = Array.from(new Set(fgBalances.map((b) => b.warehouseId).filter(Boolean)));
      if (fgItemIds.length === 0 || fgWarehouseIds.length === 0) return balances;

      // 1. Fetch confirmed/shipped/delivered Delivery Note lines for these FG items
      //    and resolve multi-SOC tags ([SOC: SOC-...]) in line descriptions
      const dnRows: Array<{
        item_id: string;
        quantity: string | number;
        description: string | null;
        header_soc: string | null;
        uom_code: string | null;
      }> = await this.repo.manager.query(
        `SELECT sdl.item_id, sdl.quantity, sdl.description, so.order_number AS header_soc,
                u.code AS uom_code
         FROM erp_sales.sales_delivery_lines sdl
         JOIN erp_sales.sales_deliveries sd ON sd.id = sdl.delivery_id
         LEFT JOIN erp_sales.sales_orders so ON so.id = sd.sales_order_id
         LEFT JOIN public.uoms u ON u.id = sdl.uom_id
         WHERE sd.deleted_at IS NULL
           AND UPPER(sd.status) IN ('CONFIRMED', 'DELIVERED', 'SHIPPED')
           AND sdl.item_id = ANY($1)`,
        [fgItemIds],
      );

      const deliveredBySocAndItem = new Map<string, number>();
      for (const r of dnRows) {
        const socMatch = r.description?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
        const soc = (socMatch ? socMatch[1] : r.header_soc || '').trim();
        if (!soc) continue;
        const key = `${soc}_${r.item_id}`;
        const qty = Number(r.quantity || 0);
        deliveredBySocAndItem.set(key, (deliveredBySocAndItem.get(key) || 0) + qty);
      }

      // 2. Fetch open Sales Order items for these FG items
      const openSoRows: Array<{
        item_id: string;
        quantity: string | number;
        shipped_quantity: string | number;
        order_number: string | null;
        uom_code: string | null;
        base_uom_code: string | null;
      }> = await this.repo.manager.query(
        `SELECT soi.item_id, soi.quantity, COALESCE(soi.shipped_quantity, 0) AS shipped_quantity,
                so.order_number, u.code AS uom_code, bu.code AS base_uom_code
         FROM erp_sales.sales_order_items soi
         JOIN erp_sales.sales_orders so ON so.id = soi.sales_order_id
         LEFT JOIN public.uoms u ON u.id = soi.uom_id
         LEFT JOIN public.items i ON i.id = soi.item_id
         LEFT JOIN public.uoms bu ON bu.id = i.base_uom_id
         WHERE so.deleted_at IS NULL
           AND UPPER(so.status) NOT IN ('DELIVERED', 'CLOSED', 'CANCELLED')
           AND UPPER(COALESCE(soi.status, '')) != 'DELIVERED'
           AND soi.item_id = ANY($1)
           ${companyId ? 'AND so.company_id = $2' : ''}`,
        companyId ? [fgItemIds, companyId] : [fgItemIds],
      );

      const openOrderDemandPcsByItem = new Map<string, number>();
      const openSocNumbers = new Set<string>();

      for (const r of openSoRows) {
        const soc = (r.order_number || '').trim();
        if (soc) openSocNumbers.add(soc);
        const orderQty = Number(r.quantity || 0);
        const shippedCol = Number(r.shipped_quantity || 0);
        const deliveredDn = soc ? deliveredBySocAndItem.get(`${soc}_${r.item_id}`) || 0 : 0;
        const effectiveShipped = Math.max(shippedCol, deliveredDn);
        const remQty = Math.max(0, orderQty - effectiveShipped);
        if (remQty <= 0) continue;

        const uomCode = (r.uom_code || 'GRS').toUpperCase();
        const baseUomCode = (r.base_uom_code || 'PCS').toUpperCase();
        const remPcs = uomCode === 'GRS' && baseUomCode === 'PCS' ? remQty * 144 : remQty;
        openOrderDemandPcsByItem.set(r.item_id, (openOrderDemandPcsByItem.get(r.item_id) || 0) + remPcs);
      }

      // 3. Also check standalone DRAFT Delivery Orders not already tied to an open Sales Order
      const draftDnRows: Array<{
        item_id: string;
        warehouse_id: string | null;
        quantity: string | number;
        description: string | null;
        header_soc: string | null;
        uom_code: string | null;
      }> = await this.repo.manager.query(
        `SELECT sdl.item_id, COALESCE(sdl.warehouse_id, sd.warehouse_id) AS warehouse_id,
                sdl.quantity, sdl.description, so.order_number AS header_soc, u.code AS uom_code
         FROM erp_sales.sales_delivery_lines sdl
         JOIN erp_sales.sales_deliveries sd ON sd.id = sdl.delivery_id
         LEFT JOIN erp_sales.sales_orders so ON so.id = sd.sales_order_id
         LEFT JOIN public.uoms u ON u.id = sdl.uom_id
         WHERE sd.deleted_at IS NULL
           AND UPPER(sd.status) = 'DRAFT'
           AND sdl.item_id = ANY($1)`,
        [fgItemIds],
      );

      for (const r of draftDnRows) {
        const socMatch = r.description?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
        const soc = (socMatch ? socMatch[1] : r.header_soc || '').trim();
        // Skip if already counted via open Sales Order demand
        if (soc && openSocNumbers.has(soc)) continue;
        const qty = Number(r.quantity || 0);
        if (qty <= 0) continue;
        const uomCode = (r.uom_code || 'GRS').toUpperCase();
        const qtyPcs = uomCode === 'GRS' ? qty * 144 : qty;
        openOrderDemandPcsByItem.set(r.item_id, (openOrderDemandPcsByItem.get(r.item_id) || 0) + qtyPcs);
      }

      // 4. Fetch unreserved Safety Stock produced for SAFETY-STOCK (excluding stock shifted to a customer SOC)
      const safetyRows: Array<{
        item_id: string;
        warehouse_id: string;
        safety_pcs: string | number;
      }> = await this.repo.manager.query(
        `SELECT sl.item_id, sl.warehouse_id,
                COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE -sl.quantity END), 0) AS safety_pcs
         FROM public.stock_ledger sl
         LEFT JOIN public.production_entries pe
           ON pe.id = sl.reference_id AND sl.reference_type = 'PRODUCTION_ENTRY'
         WHERE sl.item_id = ANY($1)
           AND sl.warehouse_id = ANY($2)
           AND (
             sl.notes ~* 'SOC:\\s*(SAFETY-STOCK|SAFETY)'
             OR pe.remarks ~* 'SOC:\\s*(SAFETY-STOCK|SAFETY)'
           )
           AND COALESCE(sl.notes, '') NOT ILIKE '%SHIFTED FROM SAFETY STOCK%'
         GROUP BY sl.item_id, sl.warehouse_id`,
        [fgItemIds, fgWarehouseIds],
      );

      const safetyByItemWh = new Map<string, number>();
      for (const r of safetyRows) {
        const key = `${r.item_id}_${r.warehouse_id}`;
        safetyByItemWh.set(key, Math.max(0, Number(r.safety_pcs || 0)));
      }

      // 5. Group FG balance rows by (itemId, warehouseId) so batch rows never duplicate reservations
      const groupMap = new Map<string, InventoryBalance[]>();
      for (const b of fgBalances) {
        const key = `${b.itemId}_${b.warehouseId}`;
        const list = groupMap.get(key) || [];
        list.push(b);
        groupMap.set(key, list);
      }

      // Group keys by itemId so demand is allocated cleanly across warehouses without double-counting
      const groupsByItem = new Map<string, Array<{ key: string; rows: InventoryBalance[]; totalOnHand: number }>>();
      for (const [key, rows] of groupMap.entries()) {
        const itemId = rows[0].itemId;
        const totalOnHand = rows.reduce((sum, r) => sum + Math.max(0, Number(r.onHand || 0)), 0);
        const itemGroups = groupsByItem.get(itemId) || [];
        itemGroups.push({ key, rows, totalOnHand });
        groupsByItem.set(itemId, itemGroups);
      }

      for (const [itemId, itemGroups] of groupsByItem.entries()) {
        // Sort warehouse groups by highest onHand first
        itemGroups.sort((a, b) => b.totalOnHand - a.totalOnHand);
        let remainingItemDemandPcs = openOrderDemandPcsByItem.get(itemId) || 0;

        for (const grp of itemGroups) {
          const safetyPcs = safetyByItemWh.get(grp.key) || 0;
          const customerAllocatablePcs = Math.max(0, grp.totalOnHand - safetyPcs);
          const groupReservedPcs = Math.min(grp.totalOnHand, Math.min(customerAllocatablePcs, remainingItemDemandPcs));
          remainingItemDemandPcs = Math.max(0, remainingItemDemandPcs - groupReservedPcs);

          // Distribute groupReservedPcs across individual batch/unbatched balance rows
          // Prefer unbatched row first, then batched rows descending by onHand
          const sortedRows = [...grp.rows].sort((a, b) => {
            if (a.batchId == null && b.batchId != null) return -1;
            if (a.batchId != null && b.batchId == null) return 1;
            return Number(b.onHand || 0) - Number(a.onHand || 0);
          });

          let remRowReserve = groupReservedPcs;
          for (const row of sortedRows) {
            const rowOnHand = Number(row.onHand || 0);
            if (rowOnHand > 0 && remRowReserve > 0) {
              const rQty = Math.min(rowOnHand, remRowReserve);
              row.reserved = Number(rQty.toFixed(4));
              row.available = Number((rowOnHand - rQty).toFixed(4));
              remRowReserve = Math.max(0, Number((remRowReserve - rQty).toFixed(4)));
            } else {
              row.reserved = 0;
              row.available = Number(rowOnHand.toFixed(4));
            }
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to enrich dynamic reservations: ${err?.message || err}`);
    }

    return balances;
  }

  async getAvailableStock(
    companyId?: string,
    itemId?: string,
    warehouseId?: string,
    locationId?: string,
    batchId?: string,
    manager?: EntityManager,
    excludeEntryId?: string,
  ): Promise<number> {
    if (!companyId || !itemId) return 0;

    let available = 0;
    const repo = manager ? manager.getRepository(InventoryBalance) : this.repo;

    // Specific location and/or batch balance: exact on-hand − reserved in that warehouse/location/batch.
    if (locationId || batchId) {
      const balance = await this.findByItemWarehouse(companyId, itemId, warehouseId || '', locationId, batchId, manager);
      if (balance) {
        available = Number(balance.onHand) - Number(balance.reserved);
      }
    } else {
      // Warehouse-level or company-wide balance:
      // Aggregate across ALL active balance rows (both batched and unbatched) in that warehouse/company,
      // so items with multiple batches (e.g. batch-tracked raw materials) reflect true total available stock.
      const qb = repo
        .createQueryBuilder('balance')
        .select('COALESCE(SUM(balance.on_hand - balance.reserved), 0)', 'available')
        .where('balance.companyId = :companyId', { companyId })
        .andWhere('balance.itemId = :itemId', { itemId })
        .andWhere('balance.status = :status', { status: 'ACTIVE' });
      if (warehouseId) qb.andWhere('balance.warehouseId = :warehouseId', { warehouseId });
      const row = await qb.getRawOne();
      available = Number(row?.available) || 0;
    }

    // When calculating available stock in EDIT mode for an existing entry:
    // exclude the entry's own posted stock ledger impact (add back OUT consumed, subtract IN produced)
    if (excludeEntryId) {
      try {
        const mgr = manager || this.repo.manager;
        const qb = mgr
          .createQueryBuilder()
          .select('sl.direction', 'direction')
          .addSelect('sl.quantity', 'quantity')
          .from('stock_ledger', 'sl')
          .where('sl.company_id = :companyId', { companyId })
          .andWhere('sl.reference_type = :refType', { refType: 'PRODUCTION_ENTRY' })
          .andWhere('sl.reference_id = :refId', { refId: excludeEntryId })
          .andWhere('sl.item_id = :itemId', { itemId });
        if (warehouseId) {
          qb.andWhere('sl.warehouse_id = :warehouseId', { warehouseId });
        }
        const ledgerRows = await qb.getRawMany();
        for (const row of ledgerRows) {
          const q = Number(row.quantity) || 0;
          if (row.direction === 'OUT') {
            available += q; // Add back consumed raw material
          } else if (row.direction === 'IN') {
            available = Math.max(0, available - q); // Subtract produced stock
          }
        }
      } catch (e) {
        this.logger.warn(`Failed to exclude entry ${excludeEntryId} from available stock: ${e}`);
      }
    }

    return available;
  }

  async updateBalance(
    companyId: string,
    itemId: string,
    warehouseId: string,
    locationId: string | null,
    batchId: string | null,
    uomId: string,
    quantityChange: number,
    direction: 'IN' | 'OUT',
    manager?: EntityManager,
    allowNegative: boolean = false,
  ): Promise<InventoryBalance> {
    const repo = manager ? manager.getRepository(InventoryBalance) : this.repo;
    const policyRepo = manager ? manager.getRepository(InventoryPolicy) : this.policyRepo;

    // Handle general (unbatched) warehouse consumption across all active balance rows in that warehouse
    if (direction === 'OUT' && !batchId) {
      const rows = await repo.find({
        where: {
          companyId,
          itemId,
          warehouseId,
          ...(locationId ? { locationId } : {}),
          status: 'ACTIVE',
        },
        order: { onHand: 'DESC' },
      });

      const totalOnHand = rows.reduce((s, r) => s + Number(r.onHand), 0);

      if (totalOnHand < quantityChange && !allowNegative) {
        const policy = await policyRepo.findOne({
          where: { companyId, itemId, warehouseId },
        });
        if (!policy || !policy.allowNegativeStock) {
          throw new BadRequestException(
            `Insufficient stock. On hand: ${totalOnHand}, requested: ${quantityChange}`,
          );
        }
      }

      let remaining = quantityChange;
      let primaryBalance: InventoryBalance | null = null;

      // Prefer unbatched row if it has positive stock, then positive batched rows
      const unbatchedRow = rows.find((r) => r.batchId == null);
      const batchedRows = rows.filter((r) => r.batchId != null);
      const candidates = [
        ...(unbatchedRow && Number(unbatchedRow.onHand) > 0 ? [unbatchedRow] : []),
        ...batchedRows.filter((r) => Number(r.onHand) > 0),
        ...(unbatchedRow && Number(unbatchedRow.onHand) <= 0 ? [unbatchedRow] : []),
        ...batchedRows.filter((r) => Number(r.onHand) <= 0),
      ];

      for (const b of candidates) {
        if (remaining <= 0) break;
        const currentOnHand = Number(b.onHand);
        if (currentOnHand > 0) {
          const deduct = Math.min(currentOnHand, remaining);
          const nextOnHand = Number((currentOnHand - deduct).toFixed(4));
          const nextReserved = Math.min(nextOnHand, Math.max(0, Number(b.reserved || 0)));
          b.onHand = nextOnHand;
          b.reserved = Number(nextReserved.toFixed(4));
          b.available = Number((nextOnHand - nextReserved).toFixed(4));
          remaining = Number((remaining - deduct).toFixed(4));
          const saved = await repo.save(b);
          if (!primaryBalance) primaryBalance = saved;
        }
      }

      // If any remaining (e.g. when allowNegative is enabled or rows had 0/negative balance)
      if (remaining > 0) {
        let target = unbatchedRow || rows[0];
        if (!target) {
          target = repo.create({
            companyId,
            itemId,
            warehouseId,
            locationId: locationId || null,
            batchId: null,
            uomId,
            onHand: 0,
            reserved: 0,
            available: 0,
            status: 'ACTIVE',
          });
        }
        target.onHand = Number((Number(target.onHand) - remaining).toFixed(4));
        target.reserved = Math.max(0, Math.min(Math.max(0, target.onHand), Number(target.reserved || 0)));
        target.available = Number((target.onHand - target.reserved).toFixed(4));
        const saved = await repo.save(target);
        if (!primaryBalance) primaryBalance = saved;
      }

      return primaryBalance || rows[0] || repo.create({
        companyId,
        itemId,
        warehouseId,
        locationId: locationId || null,
        batchId: null,
        uomId,
        onHand: 0,
        reserved: 0,
        available: 0,
        status: 'ACTIVE',
      });
    }

    let balance = await this.findByItemWarehouse(
      companyId,
      itemId,
      warehouseId,
      locationId || undefined,
      batchId !== undefined ? batchId : undefined,
      manager,
    );

    if (!balance) {
      balance = repo.create({
        companyId,
        itemId,
        warehouseId,
        locationId: locationId || null,
        batchId: batchId || null,
        uomId,
        onHand: 0,
        reserved: 0,
        available: 0,
        status: 'ACTIVE',
      });
    }

    if (direction === 'IN') {
      balance.onHand = Number((Number(balance.onHand) + quantityChange).toFixed(4));
      balance.available = Number((balance.onHand - Number(balance.reserved || 0)).toFixed(4));
    } else {
      const newOnHand = Number((Number(balance.onHand) - quantityChange).toFixed(4));

      if (newOnHand < 0 && !allowNegative) {
        const policy = await policyRepo.findOne({
          where: { companyId, itemId, warehouseId },
        });
        if (!policy || !policy.allowNegativeStock) {
          throw new BadRequestException(
            `Insufficient stock. Available: ${balance.onHand}, requested: ${quantityChange}`,
          );
        }
      }

      balance.onHand = newOnHand;
      balance.reserved = Math.max(0, Math.min(Math.max(0, newOnHand), Number(balance.reserved || 0)));
      balance.available = Number((newOnHand - balance.reserved).toFixed(4));
    }

    return repo.save(balance);
  }

  async reserveStock(
    companyId: string,
    itemId: string,
    warehouseId: string,
    locationId: string | null,
    batchId: string | null,
    uomId: string,
    quantity: number,
  ): Promise<InventoryBalance> {
    const balance = await this.findByItemWarehouse(companyId, itemId, warehouseId, locationId || undefined, batchId || undefined);
    if (!balance) {
      throw new BadRequestException(`No inventory balance found for this item in this warehouse`);
    }

    if (Number(balance.available) < quantity) {
      throw new BadRequestException(
        `Insufficient available stock. Available: ${balance.available}, requested: ${quantity}`,
      );
    }

    balance.reserved = Number(balance.reserved) + quantity;
    balance.available = Number(balance.available) - quantity;
    return this.repo.save(balance);
  }

  async releaseReservation(
    companyId: string,
    itemId: string,
    warehouseId: string,
    locationId: string | null,
    batchId: string | null,
    uomId: string,
    quantity: number,
  ): Promise<InventoryBalance> {
    const balance = await this.findByItemWarehouse(companyId, itemId, warehouseId, locationId || undefined, batchId || undefined);
    if (!balance) {
      throw new BadRequestException(`No inventory balance found for this item in this warehouse`);
    }

    balance.reserved = Number(balance.reserved) - quantity;
    balance.available = Number(balance.available) + quantity;
    return this.repo.save(balance);
  }
}
