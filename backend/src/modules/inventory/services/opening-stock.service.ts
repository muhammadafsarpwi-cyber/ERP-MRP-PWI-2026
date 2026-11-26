import { Injectable, BadRequestException, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryBalanceService } from './inventory-balance.service';
import { BatchService } from './batch.service';
import { PostOpeningStockDto } from '../dto';

const DEFAULT_COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';

@Injectable()
export class OpeningStockService implements OnModuleInit {
  private readonly logger = new Logger(OpeningStockService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ledgerService: StockLedgerService,
    private readonly balanceService: InventoryBalanceService,
    private readonly batchService: BatchService,
  ) {}

  private async runInTransaction<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    if (typeof this.dataSource?.transaction === 'function') {
      return this.dataSource.transaction(fn);
    }
    return fn(this.dataSource as unknown as EntityManager);
  }

  private async resolveErpUserId(manager: EntityManager, rawUserId?: string): Promise<string | null> {
    if (!rawUserId) return null;
    try {
      const rows: Array<{ id: string }> = await manager.query(
        `SELECT id FROM erp_users WHERE id = $1 OR auth_user_id = $1 LIMIT 1`,
        [rawUserId],
      );
      return rows?.[0]?.id || rawUserId;
    } catch {
      return rawUserId;
    }
  }

  async onModuleInit(): Promise<void> {
    try {
      if (typeof this.dataSource?.query !== 'function') return;

      await this.dataSource.query(`
        ALTER TABLE stock_ledger
          ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(19, 4) NULL,
          ADD COLUMN IF NOT EXISTS total_cost NUMERIC(19, 4) NULL
      `);
      await this.dataSource.query(`
        ALTER TABLE inventory_balances
          ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(19, 4) NULL,
          ADD COLUMN IF NOT EXISTS average_cost NUMERIC(19, 4) NULL
      `);
      await this.dataSource.query(`
        ALTER TABLE material_issue_lines
          ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(19, 4) NULL,
          ADD COLUMN IF NOT EXISTS total_cost NUMERIC(19, 4) NULL
      `);
      await this.dataSource.query(`
        ALTER TABLE component_changes
          ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(19, 4) NULL
      `);

      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS opening_stock_batches (
          id UUID PRIMARY KEY,
          company_id UUID NOT NULL,
          reference_number VARCHAR(100) NOT NULL,
          warehouse_id UUID NOT NULL,
          division_id UUID NULL,
          transaction_date TIMESTAMPTZ NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'POSTED',
          line_count INT NOT NULL DEFAULT 0,
          total_quantity NUMERIC(19, 4) NOT NULL DEFAULT 0,
          total_value NUMERIC(19, 4) NOT NULL DEFAULT 0,
          source VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
          notes TEXT NULL,
          created_by UUID NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          reversed_by UUID NULL,
          reversed_at TIMESTAMPTZ NULL,
          restored_by UUID NULL,
          restored_at TIMESTAMPTZ NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (company_id, reference_number, warehouse_id)
        )
      `);

      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS opening_stock_batch_lines (
          id UUID PRIMARY KEY,
          batch_row_id UUID NOT NULL REFERENCES opening_stock_batches(id) ON DELETE CASCADE,
          line_no INT NOT NULL,
          ledger_id UUID NULL,
          item_id UUID NOT NULL,
          uom_id UUID NOT NULL,
          quantity NUMERIC(19, 4) NOT NULL,
          unit_cost NUMERIC(19, 4) NOT NULL DEFAULT 0,
          total_cost NUMERIC(19, 4) NOT NULL DEFAULT 0,
          batch_id UUID NULL,
          batch_number VARCHAR(100) NULL,
          serial_number VARCHAR(100) NULL,
          notes TEXT NULL
        )
      `);

      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_opening_stock_batches_company_date
          ON opening_stock_batches (company_id, transaction_date DESC, created_at DESC)
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_opening_stock_batch_lines_batch
          ON opening_stock_batch_lines (batch_row_id, line_no)
      `);

      // Recover & sync existing costs across items, inventory_balances, stock_ledger (OPENING/RECEIPT), and uncosted component_changes
      await this.dataSource.query(`
        UPDATE items i
           SET cost_price = mc.unit_cost
          FROM (
            SELECT DISTINCT ON (item_id) item_id, unit_cost
              FROM machine_components
             WHERE item_id IS NOT NULL AND is_active = true AND COALESCE(unit_cost, 0) > 0
             ORDER BY item_id, updated_at DESC
          ) mc
         WHERE i.id = mc.item_id
           AND (i.cost_price IS NULL OR i.cost_price = 0)
      `);

      await this.dataSource.query(`
        UPDATE items i
           SET cost_price = grn.unit_price
          FROM (
            SELECT DISTINCT ON (grl.item_id) grl.item_id, grl.unit_price
              FROM goods_receipt_lines grl
              INNER JOIN goods_receipts gr ON gr.id = grl.receipt_id
             WHERE gr.is_active = true AND grl.is_active = true AND grl.unit_price > 0
             ORDER BY grl.item_id, COALESCE(gr.receipt_date, gr.created_at) DESC, grl.created_at DESC
          ) grn
         WHERE i.id = grn.item_id
           AND (i.cost_price IS NULL OR i.cost_price = 0)
      `);

      await this.dataSource.query(`
        UPDATE inventory_balances ib
           SET unit_cost = COALESCE(NULLIF(ib.unit_cost, 0), i.cost_price),
               average_cost = COALESCE(NULLIF(ib.average_cost, 0), i.cost_price)
          FROM items i
         WHERE i.id = ib.item_id
           AND COALESCE(i.cost_price, 0) > 0
           AND (ib.unit_cost IS NULL OR ib.unit_cost = 0 OR ib.average_cost IS NULL OR ib.average_cost = 0)
      `);

      await this.dataSource.query(`
        UPDATE stock_ledger sl
           SET unit_cost = i.cost_price,
               total_cost = ROUND((sl.quantity * i.cost_price)::numeric, 4)
          FROM items i
         WHERE i.id = sl.item_id
           AND UPPER(sl.transaction_type) = 'OPENING'
           AND (sl.unit_cost IS NULL OR sl.unit_cost = 0)
           AND COALESCE(i.cost_price, 0) > 0
      `);

      await this.dataSource.query(`
        UPDATE component_changes cc
           SET unit_cost = COALESCE(NULLIF(mc.unit_cost, 0), NULLIF(i.cost_price, 0))
          FROM machine_components mc
          LEFT JOIN items i ON i.id = mc.item_id
         WHERE cc.component_id = mc.id
           AND cc.unit_cost IS NULL
           AND COALESCE(NULLIF(mc.unit_cost, 0), NULLIF(i.cost_price, 0), 0) > 0
      `);

      this.logger.log('Verified opening stock batch tables, costing columns, and unit cost sync.');
    } catch (err: any) {
      this.logger.warn(`Cost schema init/backfill skipped: ${err?.message || err}`);
    }
  }

  async postOpeningStock(
    dto: PostOpeningStockDto,
    userId?: string,
  ): Promise<{
    batchId: string;
    referenceNumber: string;
    warehouseId: string;
    status: string;
    posted: number;
    totalQuantity: number;
    totalValue: number;
    lines: any[];
  }> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Opening stock must have at least one line');
    }

    const companyId = dto.companyId || DEFAULT_COMPANY_ID;
    const txDate = dto.transactionDate ? new Date(dto.transactionDate) : new Date();
    const source = (dto.source || (dto.lines.length > 5 ? 'IMPORT' : 'MANUAL')).toUpperCase().slice(0, 30);

    return this.runInTransaction(async (manager) => {
      const resolvedUserId = await this.resolveErpUserId(manager, userId);
      const whRows: Array<{ id: string; name: string; division_id: string | null }> = await manager.query(
        `SELECT id, name, division_id FROM warehouses WHERE id = $1 AND company_id = $2 LIMIT 1`,
        [dto.warehouseId, companyId],
      );
      const warehouseRow = whRows?.[0] || null;
      const divisionId = warehouseRow?.division_id || null;

      // Check existing batch header for same (company, referenceNumber, warehouse)
      const existingBatchRows: Array<{
        id: string;
        status: string;
        line_count: number;
        total_quantity: string | number;
        total_value: string | number;
      }> = await manager.query(
        `SELECT id, status, line_count, total_quantity, total_value
           FROM opening_stock_batches
          WHERE company_id = $1 AND reference_number = $2 AND warehouse_id = $3
          LIMIT 1`,
        [companyId, dto.referenceNumber, dto.warehouseId],
      );

      if (existingBatchRows?.[0]?.status === 'REVERSED') {
        throw new BadRequestException(
          `Reference '${dto.referenceNumber}' already exists as REVERSED for this warehouse. Use a new reference number or restore that batch from Opening Stock History.`,
        );
      }

      // Preload existing on-hand quantities for all distinct items in 1 query
      const uniqueItemIds = Array.from(new Set(dto.lines.map((l) => l.itemId).filter(Boolean)));
      const onHandByItem = new Map<string, number>();
      if (uniqueItemIds.length > 0) {
        const prevRows: Array<{ item_id: string; prev_qty: string | number }> = await manager.query(
          `SELECT item_id, COALESCE(SUM(on_hand), 0) AS prev_qty
             FROM inventory_balances
            WHERE company_id = $1 AND warehouse_id = $2 AND status = 'ACTIVE' AND item_id = ANY($3::uuid[])
            GROUP BY item_id`,
          [companyId, dto.warehouseId, uniqueItemIds],
        );
        for (const r of prevRows || []) {
          onHandByItem.set(r.item_id, Number(r.prev_qty || 0));
        }
      }

      const batchRowId = existingBatchRows?.[0]?.id || randomUUID();
      const baseLineNo = Number(existingBatchRows?.[0]?.line_count || 0);
      let addedQty = 0;
      let addedVal = 0;

      if (!existingBatchRows?.[0]) {
        await manager.query(
          `INSERT INTO opening_stock_batches (
             id, company_id, reference_number, warehouse_id, division_id, transaction_date,
             status, line_count, total_quantity, total_value, source, notes, created_by
           ) VALUES ($1, $2, $3, $4, $5, $6, 'POSTED', 0, 0, 0, $7, $8, $9)`,
          [
            batchRowId,
            companyId,
            dto.referenceNumber,
            dto.warehouseId,
            divisionId,
            txDate,
            source,
            dto.notes || null,
            resolvedUserId,
          ],
        );
      }

      const results: any[] = [];
      const costUpdates: Array<{ itemId: string; cost: number }> = [];

      for (let i = 0; i < dto.lines.length; i++) {
        const line = dto.lines[i];
        const qty = Number(line.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new BadRequestException(`Line #${i + 1}: Opening quantity must be greater than 0.`);
        }

        let batchId = line.batchId || undefined;
        if (line.batchNumber && !batchId) {
          const existingLot: Array<{ id: string }> = await manager.query(
            `SELECT id FROM batches WHERE company_id = $1 AND item_id = $2 AND batch_number = $3 LIMIT 1`,
            [companyId, line.itemId, line.batchNumber],
          );
          if (existingLot?.[0]?.id) {
            batchId = existingLot[0].id;
          } else {
            const batch = await this.batchService.create(
              {
                companyId,
                itemId: line.itemId,
                warehouseId: dto.warehouseId,
                batchNumber: line.batchNumber,
                quantity: qty,
              },
              userId,
            );
            batchId = batch.id;
          }
        }

        const prevOnHand = onHandByItem.get(line.itemId) || 0;
        const enteredCost =
          line.unitCost !== undefined && line.unitCost !== null && Number(line.unitCost) > 0
            ? Number(line.unitCost)
            : null;
        const lineTotalCost =
          enteredCost !== null ? Number((qty * enteredCost).toFixed(4)) : 0;

        const ledgerEntry = await this.ledgerService.create(
          {
            companyId,
            transactionType: 'OPENING',
            transactionDate: txDate,
            itemId: line.itemId,
            warehouseId: dto.warehouseId,
            locationId: line.locationId,
            quantity: qty,
            unitCost: enteredCost,
            totalCost: enteredCost !== null ? lineTotalCost : null,
            uomId: line.uomId,
            direction: 'IN',
            referenceType: 'OPENING_STOCK',
            referenceId: batchRowId,
            referenceNumber: dto.referenceNumber,
            batchId,
            serialNumber: line.serialNumber || undefined,
            notes: line.notes || undefined,
            divisionId,
            createdBy: resolvedUserId || undefined,
          },
          manager,
        );

        await this.balanceService.updateBalance(
          companyId,
          line.itemId,
          dto.warehouseId,
          line.locationId || null,
          batchId || null,
          line.uomId,
          qty,
          'IN',
          manager,
        );

        if (enteredCost !== null && enteredCost > 0) {
          await this.balanceService.updateWeightedAverageCost(
            companyId,
            line.itemId,
            dto.warehouseId,
            qty,
            enteredCost,
            prevOnHand,
            manager,
          );
          costUpdates.push({ itemId: line.itemId, cost: enteredCost });
        }

        onHandByItem.set(line.itemId, prevOnHand + qty);
        addedQty += qty;
        addedVal += lineTotalCost;

        await manager.query(
          `INSERT INTO opening_stock_batch_lines (
             id, batch_row_id, line_no, ledger_id, item_id, uom_id,
             quantity, unit_cost, total_cost, batch_id, batch_number, serial_number, notes
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            randomUUID(),
            batchRowId,
            baseLineNo + i + 1,
            ledgerEntry.id,
            line.itemId,
            line.uomId,
            qty,
            enteredCost ?? 0,
            lineTotalCost,
            batchId || null,
            line.batchNumber || null,
            line.serialNumber || null,
            line.notes || null,
          ],
        );

        results.push({
          ledgerId: ledgerEntry.id,
          itemId: line.itemId,
          quantity: qty,
          unitCost: enteredCost,
          totalCost: lineTotalCost,
          batchId: batchId || null,
        });
      }

      for (const cu of costUpdates) {
        await manager.query(
          `UPDATE items
              SET cost_price = $1
            WHERE id = $2 AND company_id = $3 AND (cost_price IS NULL OR cost_price = 0)`,
          [cu.cost, cu.itemId, companyId],
        );
        await manager.query(
          `UPDATE machine_components
              SET unit_cost = $1
            WHERE item_id = $2 AND company_id = $3 AND is_active = true AND (unit_cost IS NULL OR unit_cost = 0)`,
          [cu.cost, cu.itemId, companyId],
        );
      }

      const nextLineCount = baseLineNo + results.length;
      const nextTotalQty = Number((Number(existingBatchRows?.[0]?.total_quantity || 0) + addedQty).toFixed(4));
      const nextTotalVal = Number((Number(existingBatchRows?.[0]?.total_value || 0) + addedVal).toFixed(4));

      await manager.query(
        `UPDATE opening_stock_batches
            SET line_count = $1,
                total_quantity = $2,
                total_value = $3,
                updated_at = NOW()
          WHERE id = $4`,
        [nextLineCount, nextTotalQty, nextTotalVal, batchRowId],
      );

      this.logger.log(
        `Opening stock batch ${dto.referenceNumber} (${source}) posted: ${results.length} lines, qty=${addedQty}, value=${addedVal}`,
      );

      return {
        batchId: batchRowId,
        referenceNumber: dto.referenceNumber,
        warehouseId: dto.warehouseId,
        status: 'POSTED',
        posted: results.length,
        totalQuantity: addedQty,
        totalValue: Number(addedVal.toFixed(2)),
        lines: results,
      };
    });
  }

  async getHistory(
    companyId: string,
    filters?: { warehouseId?: string; divisionId?: string; status?: string; search?: string },
  ) {
    const statusFilter = filters?.status ? String(filters.status).toUpperCase() : 'ALL';
    const searchTerm = filters?.search?.trim() ? `%${filters.search.trim()}%` : null;

    // 1. Query tracked batches from opening_stock_batches
    const batchParams: any[] = [companyId];
    const batchConds: string[] = ['osb.company_id = $1'];

    if (filters?.warehouseId) {
      batchParams.push(filters.warehouseId);
      batchConds.push(`osb.warehouse_id = $${batchParams.length}`);
    }
    if (filters?.divisionId) {
      batchParams.push(filters.divisionId);
      batchConds.push(`COALESCE(osb.division_id, w.division_id) = $${batchParams.length}`);
    }
    if (statusFilter === 'POSTED' || statusFilter === 'REVERSED') {
      batchParams.push(statusFilter);
      batchConds.push(`osb.status = $${batchParams.length}`);
    }
    if (searchTerm) {
      batchParams.push(searchTerm);
      const p = `$${batchParams.length}`;
      batchConds.push(`(
        osb.reference_number ILIKE ${p}
        OR w.name ILIKE ${p}
        OR d.name ILIKE ${p}
        OR EXISTS (
          SELECT 1
            FROM opening_stock_batch_lines obl
            JOIN items it ON it.id = obl.item_id
           WHERE obl.batch_row_id = osb.id
             AND (it.item_code ILIKE ${p} OR it.name ILIKE ${p})
        )
      )`);
    }

    let trackedBatches: any[] = [];
    try {
      trackedBatches = await this.dataSource.query(
        `SELECT
           osb.id,
           osb.reference_number,
           osb.transaction_date,
           osb.warehouse_id,
           COALESCE(osb.division_id, w.division_id) AS division_id,
           osb.status,
           osb.line_count,
           osb.total_quantity,
           osb.total_value,
           osb.source,
           osb.notes,
           osb.created_at,
           osb.reversed_at,
           osb.restored_at,
           w.warehouse_code,
           w.name AS warehouse_name,
           d.name AS division_name,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(cu.first_name, ''), ' ', COALESCE(cu.last_name, ''))), ''), cu.username, 'System') AS created_by_name,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(ru.first_name, ''), ' ', COALESCE(ru.last_name, ''))), ''), ru.username, NULL) AS reversed_by_name,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(rsu.first_name, ''), ' ', COALESCE(rsu.last_name, ''))), ''), rsu.username, NULL) AS restored_by_name
         FROM opening_stock_batches osb
         LEFT JOIN warehouses w ON w.id = osb.warehouse_id
         LEFT JOIN divisions d ON d.id = COALESCE(osb.division_id, w.division_id)
         LEFT JOIN erp_users cu ON cu.id = osb.created_by
         LEFT JOIN erp_users ru ON ru.id = osb.reversed_by
         LEFT JOIN erp_users rsu ON rsu.id = osb.restored_by
         WHERE ${batchConds.join(' AND ')}
         ORDER BY osb.transaction_date DESC, osb.created_at DESC
         LIMIT 500`,
        batchParams,
      );
    } catch (err: any) {
      this.logger.warn(`Tracked batch query fallback: ${err?.message || err}`);
      trackedBatches = [];
    }

    const trackedIds = trackedBatches.map((b) => b.id);
    const trackedKeySet = new Set<string>(
      trackedBatches.map((b) => `${b.reference_number || 'OPN-UNREF'}::${b.warehouse_id || ''}`),
    );

    const linesByBatchId = new Map<string, any[]>();
    if (trackedIds.length > 0) {
      const batchLineRows = await this.dataSource.query(
        `SELECT
           obl.id,
           obl.batch_row_id,
           obl.line_no,
           obl.ledger_id,
           obl.item_id,
           obl.uom_id,
           obl.quantity,
           COALESCE(NULLIF(obl.unit_cost, 0), NULLIF(i.cost_price, 0), 0) AS unit_cost,
           obl.total_cost,
           obl.batch_id,
           COALESCE(obl.batch_number, b.batch_number) AS batch_number,
           obl.serial_number,
           obl.notes,
           i.item_code,
           i.name AS item_name,
           i.item_type,
           u.code AS uom_code
         FROM opening_stock_batch_lines obl
         LEFT JOIN items i ON i.id = obl.item_id
         LEFT JOIN uoms u ON u.id = obl.uom_id
         LEFT JOIN batches b ON b.id = obl.batch_id
         WHERE obl.batch_row_id = ANY($1::uuid[])
         ORDER BY obl.line_no ASC, i.item_code ASC`,
        [trackedIds],
      );
      for (const ln of batchLineRows || []) {
        const list = linesByBatchId.get(ln.batch_row_id) || [];
        const qty = Number(ln.quantity || 0);
        const unitCost = Number(ln.unit_cost || 0);
        list.push({
          ledgerId: ln.ledger_id || ln.id,
          itemId: ln.item_id,
          itemCode: ln.item_code || '',
          itemName: ln.item_name || '',
          itemType: ln.item_type || '',
          uomId: ln.uom_id,
          uomCode: ln.uom_code || '',
          quantity: qty,
          unitCost,
          totalCost: Number((qty * unitCost).toFixed(2)),
          batchNumber: ln.batch_number || null,
          serialNumber: ln.serial_number || null,
          notes: ln.notes || null,
          createdAt: null,
        });
        linesByBatchId.set(ln.batch_row_id, list);
      }
    }

    const resultList: any[] = trackedBatches.map((b) => {
      const ref = b.reference_number || 'OPN-UNREF';
      const lines = linesByBatchId.get(b.id) || [];
      const lineSumQty = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
      const lineSumVal = Number(lines.reduce((s, l) => s + Number(l.totalCost || 0), 0).toFixed(2));
      return {
        key: `${ref}::${b.warehouse_id || ''}`,
        batchId: b.id,
        referenceNumber: ref,
        transactionDate: b.transaction_date,
        warehouseId: b.warehouse_id,
        warehouseCode: b.warehouse_code || '',
        warehouseName: b.warehouse_name || 'Unknown Warehouse',
        divisionId: b.division_id || null,
        divisionName: b.division_name || '',
        status: b.status || 'POSTED',
        source: b.source || 'MANUAL',
        createdByName: b.created_by_name || 'System',
        createdAt: b.created_at,
        reversedAt: b.reversed_at || null,
        reversedByName: b.reversed_by_name || null,
        restoredAt: b.restored_at || null,
        restoredByName: b.restored_by_name || null,
        lineCount: lines.length > 0 ? lines.length : Number(b.line_count || 0),
        totalQuantity: lines.length > 0 ? lineSumQty : Number(b.total_quantity || 0),
        totalValue: lines.length > 0 ? lineSumVal : Number(b.total_value || 0),
        lines,
      };
    });

    // 2. Include historical un-tracked stock_ledger IN opening rows unless status filter is strictly REVERSED
    if (statusFilter !== 'REVERSED') {
      const params: any[] = [companyId];
      const conds: string[] = [
        'sl.company_id = $1',
        "sl.direction = 'IN'",
        "UPPER(COALESCE(sl.reference_type, '')) <> 'OPENING_REVERSAL'",
        "(UPPER(sl.transaction_type) = 'OPENING' OR UPPER(COALESCE(sl.reference_type, '')) IN ('OPENING', 'OPENING_STOCK', 'PRODUCTION_ITEM_OPEN_STOCK', 'OPENING_RESTORE'))",
      ];

      if (filters?.warehouseId) {
        params.push(filters.warehouseId);
        conds.push(`sl.warehouse_id = $${params.length}`);
      }
      if (filters?.divisionId) {
        params.push(filters.divisionId);
        conds.push(`w.division_id = $${params.length}`);
      }
      if (searchTerm) {
        params.push(searchTerm);
        const p = `$${params.length}`;
        conds.push(`(sl.reference_number ILIKE ${p} OR i.item_code ILIKE ${p} OR i.name ILIKE ${p} OR w.name ILIKE ${p} OR d.name ILIKE ${p})`);
      }

      const rows = await this.dataSource.query(
        `SELECT
           sl.id AS ledger_id,
           sl.reference_number,
           sl.transaction_date,
           sl.warehouse_id,
           w.division_id,
           sl.item_id,
           sl.uom_id,
           sl.quantity,
           COALESCE(NULLIF(sl.unit_cost, 0), NULLIF(i.cost_price, 0), 0) AS unit_cost,
           sl.serial_number,
           sl.notes,
           sl.created_at,
           i.item_code,
           i.name AS item_name,
           i.item_type,
           u.code AS uom_code,
           w.warehouse_code AS warehouse_code,
           w.name AS warehouse_name,
           d.name AS division_name,
           b.batch_number,
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(usr.first_name, ''), ' ', COALESCE(usr.last_name, ''))), ''), usr.username, 'System') AS created_by_name
         FROM stock_ledger sl
         LEFT JOIN items i ON i.id = sl.item_id
         LEFT JOIN uoms u ON u.id = sl.uom_id
         LEFT JOIN warehouses w ON w.id = sl.warehouse_id
         LEFT JOIN divisions d ON d.id = w.division_id
         LEFT JOIN batches b ON b.id = sl.batch_id
         LEFT JOIN erp_users usr ON usr.id = sl.created_by
         WHERE ${conds.join(' AND ')}
         ORDER BY sl.transaction_date DESC, sl.created_at DESC, i.item_code ASC
         LIMIT 1000`,
        params,
      );

      const legacyBatches = new Map<string, any>();
      for (const r of rows || []) {
        const ref = r.reference_number || 'OPN-UNREF';
        const key = `${ref}::${r.warehouse_id || ''}`;
        if (trackedKeySet.has(key)) continue;
        if (!legacyBatches.has(key)) {
          legacyBatches.set(key, {
            key,
            batchId: null,
            referenceNumber: ref,
            transactionDate: r.transaction_date,
            warehouseId: r.warehouse_id,
            warehouseCode: r.warehouse_code || '',
            warehouseName: r.warehouse_name || 'Unknown Warehouse',
            divisionId: r.division_id || null,
            divisionName: r.division_name || '',
            status: 'POSTED',
            source: 'LEGACY',
            createdByName: r.created_by_name || 'System',
            createdAt: r.created_at,
            reversedAt: null,
            reversedByName: null,
            restoredAt: null,
            restoredByName: null,
            lineCount: 0,
            totalQuantity: 0,
            totalValue: 0,
            lines: [],
          });
        }
        const batch = legacyBatches.get(key)!;
        const qty = Number(r.quantity || 0);
        const unitCost = Number(r.unit_cost || 0);
        batch.lineCount += 1;
        batch.totalQuantity += qty;
        batch.totalValue = Number((batch.totalValue + qty * unitCost).toFixed(2));
        batch.lines.push({
          ledgerId: r.ledger_id,
          itemId: r.item_id,
          itemCode: r.item_code || '',
          itemName: r.item_name || '',
          itemType: r.item_type || '',
          uomId: r.uom_id,
          uomCode: r.uom_code || '',
          quantity: qty,
          unitCost,
          totalCost: Number((qty * unitCost).toFixed(2)),
          batchNumber: r.batch_number || null,
          serialNumber: r.serial_number || null,
          notes: r.notes || null,
          createdAt: r.created_at,
        });
      }

      for (const lb of legacyBatches.values()) {
        resultList.push(lb);
      }
    }

    resultList.sort((a, b) => {
      const da = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
      const db = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
      if (db !== da) return db - da;
      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return cb - ca;
    });

    return resultList;
  }

  /** Ensure a batch exists in `opening_stock_batches` + `opening_stock_batch_lines` (backfilling legacy batches on demand). */
  private async resolveOrSnapshotBatch(
    manager: EntityManager,
    companyId: string,
    referenceNumber: string,
    warehouseId?: string,
  ): Promise<{
    id: string;
    company_id: string;
    reference_number: string;
    warehouse_id: string;
    division_id: string | null;
    transaction_date: Date;
    status: string;
    line_count: number;
    total_quantity: number;
    total_value: number;
  }> {
    const params: any[] = [companyId, referenceNumber];
    let whClause = '';
    if (warehouseId) {
      params.push(warehouseId);
      whClause = `AND warehouse_id = $${params.length}`;
    }

    const found = await manager.query(
      `SELECT * FROM opening_stock_batches
        WHERE company_id = $1 AND reference_number = $2 ${whClause}
        ORDER BY created_at DESC`,
      params,
    );
    if (found.length > 1) {
      throw new BadRequestException(
        `Multiple warehouses share batch reference '${referenceNumber}'. Please specify warehouseId.`,
      );
    }
    if (found.length === 1) {
      return found[0];
    }

    // Backfill from historical stock_ledger rows
    const ledgerRows = await manager.query(
      `SELECT sl.*, w.division_id AS wh_division_id, b.batch_number
         FROM stock_ledger sl
         LEFT JOIN warehouses w ON w.id = sl.warehouse_id
         LEFT JOIN batches b ON b.id = sl.batch_id
        WHERE sl.company_id = $1 AND sl.reference_number = $2 ${warehouseId ? 'AND sl.warehouse_id = $3' : ''}
          AND sl.direction = 'IN'
          AND UPPER(COALESCE(sl.reference_type, '')) <> 'OPENING_REVERSAL'
          AND (UPPER(sl.transaction_type) = 'OPENING' OR UPPER(COALESCE(sl.reference_type, '')) IN ('OPENING', 'OPENING_STOCK', 'PRODUCTION_ITEM_OPEN_STOCK', 'OPENING_RESTORE'))
        ORDER BY sl.created_at ASC`,
      params,
    );
    if (!ledgerRows.length) {
      throw new NotFoundException(`Opening stock batch '${referenceNumber}' not found`);
    }

    const distinctWhIds = new Set(ledgerRows.map((r: any) => r.warehouse_id));
    if (distinctWhIds.size > 1 && !warehouseId) {
      throw new BadRequestException(
        `Multiple warehouses share batch reference '${referenceNumber}'. Please specify warehouseId.`,
      );
    }

    const first = ledgerRows[0];
    const batchRowId = randomUUID();
    const totalQty = ledgerRows.reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
    const totalVal = Number(
      ledgerRows
        .reduce((s: number, r: any) => s + Number(r.quantity || 0) * Number(r.unit_cost || 0), 0)
        .toFixed(4),
    );

    await manager.query(
      `INSERT INTO opening_stock_batches (
         id, company_id, reference_number, warehouse_id, division_id, transaction_date,
         status, line_count, total_quantity, total_value, source, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, 'POSTED', $7, $8, $9, 'LEGACY', $10)`,
      [
        batchRowId,
        companyId,
        referenceNumber,
        first.warehouse_id,
        first.division_id || first.wh_division_id || null,
        first.transaction_date || new Date(),
        ledgerRows.length,
        totalQty,
        totalVal,
        first.created_by || null,
      ],
    );

    for (let i = 0; i < ledgerRows.length; i++) {
      const r = ledgerRows[i];
      const qty = Number(r.quantity || 0);
      const uCost = Number(r.unit_cost || 0);
      await manager.query(
        `INSERT INTO opening_stock_batch_lines (
           id, batch_row_id, line_no, ledger_id, item_id, uom_id,
           quantity, unit_cost, total_cost, batch_id, batch_number, serial_number, notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          randomUUID(),
          batchRowId,
          i + 1,
          r.id,
          r.item_id,
          r.uom_id,
          qty,
          uCost,
          Number((qty * uCost).toFixed(4)),
          r.batch_id || null,
          r.batch_number || null,
          r.serial_number || null,
          r.notes || null,
        ],
      );
    }

    return {
      id: batchRowId,
      company_id: companyId,
      reference_number: referenceNumber,
      warehouse_id: first.warehouse_id,
      division_id: first.division_id || first.wh_division_id || null,
      transaction_date: first.transaction_date || new Date(),
      status: 'POSTED',
      line_count: ledgerRows.length,
      total_quantity: totalQty,
      total_value: totalVal,
    };
  }

  /**
   * Safely undo / reverse a posted Opening Stock batch:
   * - Prevents negative stock if quantities were already consumed (unless warehouse/item policy allows negative stock)
   * - Posts exact reversing OUT ledger entries (transactionType='OPENING', direction='OUT', referenceType='OPENING_REVERSAL')
   * - Deducts batch quantities from inventory_balances atomically
   * - Retains preserved lines under status='REVERSED' so it can be restored later in 1 click
   */
  async reverseBatch(
    companyId: string,
    referenceNumber: string,
    warehouseId?: string,
    userId?: string,
  ) {
    return this.runInTransaction(async (manager) => {
      const resolvedUserId = await this.resolveErpUserId(manager, userId);
      const batch = await this.resolveOrSnapshotBatch(manager, companyId, referenceNumber, warehouseId);
      if (batch.status === 'REVERSED') {
        throw new BadRequestException(`Opening stock batch '${referenceNumber}' is already reversed.`);
      }

      const lines: Array<{
        id: string;
        item_id: string;
        uom_id: string;
        quantity: string | number;
        unit_cost: string | number;
        total_cost: string | number;
        batch_id: string | null;
        batch_number: string | null;
        serial_number: string | null;
        notes: string | null;
        item_code: string | null;
        item_name: string | null;
      }> = await manager.query(
        `SELECT obl.*, i.item_code, i.name AS item_name
           FROM opening_stock_batch_lines obl
           LEFT JOIN items i ON i.id = obl.item_id
          WHERE obl.batch_row_id = $1
          ORDER BY obl.line_no ASC`,
        [batch.id],
      );

      if (!lines.length) {
        throw new BadRequestException(`Opening stock batch '${referenceNumber}' has no lines to reverse.`);
      }

      const whRows: Array<{ name: string }> = await manager.query(
        `SELECT name FROM warehouses WHERE id = $1 LIMIT 1`,
        [batch.warehouse_id],
      );
      const warehouseName = whRows?.[0]?.name || 'this warehouse';

      // Pre-validate on-hand quantities across batch lines to give crystal-clear item-level errors before deducting
      const requiredByKey = new Map<string, { itemId: string; batchId: string | null; itemLabel: string; required: number }>();
      for (const ln of lines) {
        const q = Number(ln.quantity || 0);
        if (q <= 0) continue;
        const k = `${ln.item_id}::${ln.batch_id || ''}`;
        const existing = requiredByKey.get(k);
        if (existing) {
          existing.required += q;
        } else {
          requiredByKey.set(k, {
            itemId: ln.item_id,
            batchId: ln.batch_id || null,
            itemLabel: ln.item_code ? `${ln.item_code} (${ln.item_name || ''})` : ln.item_id,
            required: q,
          });
        }
      }

      for (const check of requiredByKey.values()) {
        const policyRows: Array<{ allow_negative_stock: boolean }> = await manager.query(
          `SELECT allow_negative_stock FROM inventory_policies WHERE company_id = $1 AND item_id = $2 AND warehouse_id = $3 LIMIT 1`,
          [companyId, check.itemId, batch.warehouse_id],
        );
        const allowNeg = Boolean(policyRows?.[0]?.allow_negative_stock);
        if (!allowNeg) {
          const balQuery = check.batchId
            ? `SELECT COALESCE(SUM(on_hand), 0) AS on_hand FROM inventory_balances WHERE company_id = $1 AND item_id = $2 AND warehouse_id = $3 AND batch_id = $4 AND status = 'ACTIVE'`
            : `SELECT COALESCE(SUM(on_hand), 0) AS on_hand FROM inventory_balances WHERE company_id = $1 AND item_id = $2 AND warehouse_id = $3 AND status = 'ACTIVE'`;
          const balParams = check.batchId
            ? [companyId, check.itemId, batch.warehouse_id, check.batchId]
            : [companyId, check.itemId, batch.warehouse_id];
          const balRows: Array<{ on_hand: string | number }> = await manager.query(balQuery, balParams);
          const onHand = Number(balRows?.[0]?.on_hand || 0);
          if (onHand + 0.0001 < check.required) {
            throw new BadRequestException(
              `Cannot reverse batch '${referenceNumber}': Item ${check.itemLabel} only has ${onHand} on hand in ${warehouseName}, but reversal requires ${check.required}. Stock may have already been issued or consumed.`,
            );
          }
        }
      }

      for (const ln of lines) {
        const qty = Number(ln.quantity || 0);
        if (qty <= 0) continue;

        await this.balanceService.updateBalance(
          companyId,
          ln.item_id,
          batch.warehouse_id,
          null,
          ln.batch_id || null,
          ln.uom_id,
          qty,
          'OUT',
          manager,
          false,
        );

        const unitCost = Number(ln.unit_cost || 0);
        await this.ledgerService.create(
          {
            companyId,
            transactionType: 'OPENING',
            transactionDate: new Date(),
            itemId: ln.item_id,
            warehouseId: batch.warehouse_id,
            quantity: qty,
            unitCost: unitCost > 0 ? unitCost : null,
            totalCost: unitCost > 0 ? Number((qty * unitCost).toFixed(4)) : null,
            uomId: ln.uom_id,
            direction: 'OUT',
            referenceType: 'OPENING_REVERSAL',
            referenceId: batch.id,
            referenceNumber: batch.reference_number,
            batchId: ln.batch_id || undefined,
            serialNumber: ln.serial_number || undefined,
            divisionId: batch.division_id || null,
            notes: `Reversal of Opening Stock batch ${batch.reference_number}`,
            createdBy: resolvedUserId || undefined,
          },
          manager,
        );
      }

      await manager.query(
        `UPDATE opening_stock_batches
            SET status = 'REVERSED',
                reversed_by = $1,
                reversed_at = NOW(),
                updated_at = NOW()
          WHERE id = $2`,
        [resolvedUserId, batch.id],
      );

      this.logger.log(`Reversed Opening Stock batch ${referenceNumber} (${lines.length} lines)`);

      return {
        reversed: true,
        batchId: batch.id,
        referenceNumber: batch.reference_number,
        warehouseId: batch.warehouse_id,
        status: 'REVERSED',
        lineCount: lines.length,
        totalQuantity: Number(batch.total_quantity || 0),
        totalValue: Number(batch.total_value || 0),
      };
    });
  }

  /**
   * Restore / Re-Post a previously reversed Opening Stock batch atomically.
   */
  async restoreBatch(
    companyId: string,
    referenceNumber: string,
    warehouseId?: string,
    userId?: string,
  ) {
    return this.runInTransaction(async (manager) => {
      const resolvedUserId = await this.resolveErpUserId(manager, userId);
      const params: any[] = [companyId, referenceNumber];
      let whClause = '';
      if (warehouseId) {
        params.push(warehouseId);
        whClause = `AND warehouse_id = $${params.length}`;
      }

      const found = await manager.query(
        `SELECT * FROM opening_stock_batches
          WHERE company_id = $1 AND reference_number = $2 ${whClause}
          ORDER BY created_at DESC`,
        params,
      );
      if (!found || !found.length) {
        throw new NotFoundException(`Opening stock batch '${referenceNumber}' not found`);
      }
      if (found.length > 1) {
        throw new BadRequestException(
          `Multiple warehouses share batch reference '${referenceNumber}'. Please specify warehouseId.`,
        );
      }

      const batch = found[0];
      if (batch.status !== 'REVERSED') {
        throw new BadRequestException(
          `Opening stock batch '${referenceNumber}' is currently '${batch.status}', not REVERSED.`,
        );
      }

      const lines: Array<{
        id: string;
        item_id: string;
        uom_id: string;
        quantity: string | number;
        unit_cost: string | number;
        total_cost: string | number;
        batch_id: string | null;
        batch_number: string | null;
        serial_number: string | null;
        notes: string | null;
      }> = await manager.query(
        `SELECT * FROM opening_stock_batch_lines
          WHERE batch_row_id = $1
          ORDER BY line_no ASC`,
        [batch.id],
      );

      if (!lines.length) {
        throw new BadRequestException(`Opening stock batch '${referenceNumber}' has no preserved lines to restore.`);
      }

      const uniqueItemIds = Array.from(new Set(lines.map((l) => l.item_id).filter(Boolean)));
      const onHandByItem = new Map<string, number>();
      if (uniqueItemIds.length > 0) {
        const prevRows: Array<{ item_id: string; prev_qty: string | number }> = await manager.query(
          `SELECT item_id, COALESCE(SUM(on_hand), 0) AS prev_qty
             FROM inventory_balances
            WHERE company_id = $1 AND warehouse_id = $2 AND status = 'ACTIVE' AND item_id = ANY($3::uuid[])
            GROUP BY item_id`,
          [companyId, batch.warehouse_id, uniqueItemIds],
        );
        for (const r of prevRows || []) {
          onHandByItem.set(r.item_id, Number(r.prev_qty || 0));
        }
      }

      for (const ln of lines) {
        const qty = Number(ln.quantity || 0);
        if (qty <= 0) continue;

        let batchId = ln.batch_id || undefined;
        if (ln.batch_number && !batchId) {
          const existingLot: Array<{ id: string }> = await manager.query(
            `SELECT id FROM batches WHERE company_id = $1 AND item_id = $2 AND batch_number = $3 LIMIT 1`,
            [companyId, ln.item_id, ln.batch_number],
          );
          if (existingLot?.[0]?.id) {
            batchId = existingLot[0].id;
          } else {
            const created = await this.batchService.create(
              {
                companyId,
                itemId: ln.item_id,
                warehouseId: batch.warehouse_id,
                batchNumber: ln.batch_number,
                quantity: qty,
              },
              userId,
            );
            batchId = created.id;
          }
        }

        const prevOnHand = onHandByItem.get(ln.item_id) || 0;
        const unitCost = Number(ln.unit_cost || 0);
        const totalCost = unitCost > 0 ? Number((qty * unitCost).toFixed(4)) : null;

        const ledgerEntry = await this.ledgerService.create(
          {
            companyId,
            transactionType: 'OPENING',
            transactionDate: new Date(),
            itemId: ln.item_id,
            warehouseId: batch.warehouse_id,
            quantity: qty,
            unitCost: unitCost > 0 ? unitCost : null,
            totalCost,
            uomId: ln.uom_id,
            direction: 'IN',
            referenceType: 'OPENING_RESTORE',
            referenceId: batch.id,
            referenceNumber: batch.reference_number,
            batchId,
            serialNumber: ln.serial_number || undefined,
            divisionId: batch.division_id || null,
            notes: `Restore of Opening Stock batch ${batch.reference_number}`,
            createdBy: resolvedUserId || undefined,
          },
          manager,
        );

        await this.balanceService.updateBalance(
          companyId,
          ln.item_id,
          batch.warehouse_id,
          null,
          batchId || null,
          ln.uom_id,
          qty,
          'IN',
          manager,
        );

        if (unitCost > 0) {
          await this.balanceService.updateWeightedAverageCost(
            companyId,
            ln.item_id,
            batch.warehouse_id,
            qty,
            unitCost,
            prevOnHand,
            manager,
          );
        }

        onHandByItem.set(ln.item_id, prevOnHand + qty);

        await manager.query(
          `UPDATE opening_stock_batch_lines SET ledger_id = $1, batch_id = COALESCE($2, batch_id) WHERE id = $3`,
          [ledgerEntry.id, batchId || null, ln.id],
        );
      }

      await manager.query(
        `UPDATE opening_stock_batches
            SET status = 'POSTED',
                restored_by = $1,
                restored_at = NOW(),
                updated_at = NOW()
          WHERE id = $2`,
        [resolvedUserId, batch.id],
      );

      this.logger.log(`Restored Opening Stock batch ${referenceNumber} (${lines.length} lines)`);

      return {
        restored: true,
        batchId: batch.id,
        referenceNumber: batch.reference_number,
        warehouseId: batch.warehouse_id,
        status: 'POSTED',
        lineCount: lines.length,
        totalQuantity: Number(batch.total_quantity || 0),
        totalValue: Number(batch.total_value || 0),
      };
    });
  }

  private async recalculateBatchTotals(manager: EntityManager, batchRowId: string): Promise<void> {
    const agg = await manager.query(
      `SELECT COUNT(*)::int AS cnt,
              COALESCE(SUM(quantity), 0) AS total_qty,
              COALESCE(SUM(total_cost), 0) AS total_val
         FROM opening_stock_batch_lines
        WHERE batch_row_id = $1`,
      [batchRowId],
    );
    const row = agg?.[0];
    if (row) {
      await manager.query(
        `UPDATE opening_stock_batches
            SET line_count = $1,
                total_quantity = $2,
                total_value = $3,
                updated_at = NOW()
          WHERE id = $4`,
        [row.cnt, Number(row.total_qty || 0), Number(row.total_val || 0), batchRowId],
      );
    }
  }

  async updateLine(
    companyId: string,
    ledgerId: string,
    body: { quantity: number; unitCost?: number; notes?: string },
  ) {
    const newQty = Number(body.quantity);
    if (!Number.isFinite(newQty) || newQty < 0) {
      throw new BadRequestException('Quantity must be zero or greater');
    }

    return this.runInTransaction(async (manager) => {
      const reversedCheck = await manager.query(
        `SELECT osb.status, osb.reference_number
           FROM opening_stock_batch_lines obl
           JOIN opening_stock_batches osb ON osb.id = obl.batch_row_id
          WHERE (obl.ledger_id = $1 OR obl.id = $1) AND osb.company_id = $2
          LIMIT 1`,
        [ledgerId, companyId],
      );
      if (reversedCheck?.[0]?.status === 'REVERSED') {
        throw new BadRequestException(
          `Batch '${reversedCheck[0].reference_number}' is currently REVERSED. Restore it first before editing lines.`,
        );
      }

      const rows = await manager.query(
        `SELECT * FROM stock_ledger
         WHERE id = $1 AND company_id = $2
           AND direction = 'IN'
           AND UPPER(COALESCE(reference_type, '')) <> 'OPENING_REVERSAL'
           AND (UPPER(transaction_type) = 'OPENING' OR UPPER(COALESCE(reference_type, '')) IN ('OPENING', 'OPENING_STOCK', 'PRODUCTION_ITEM_OPEN_STOCK', 'OPENING_RESTORE'))`,
        [ledgerId, companyId],
      );
      if (!rows.length) {
        throw new NotFoundException('Opening stock entry line not found');
      }
      const existing = rows[0];
      const oldQty = Number(existing.quantity || 0);
      const delta = newQty - oldQty;

      if (delta !== 0) {
        await this.balanceService.updateBalance(
          companyId,
          existing.item_id,
          existing.warehouse_id,
          existing.location_id || null,
          existing.batch_id || null,
          existing.uom_id,
          Math.abs(delta),
          delta > 0 ? 'IN' : 'OUT',
          manager,
        );
      }

      const nextUnitCost =
        body.unitCost !== undefined && body.unitCost !== null && Number.isFinite(Number(body.unitCost))
          ? Math.max(0, Number(body.unitCost))
          : existing.unit_cost !== null && existing.unit_cost !== undefined
            ? Number(existing.unit_cost)
            : null;
      const nextTotalCost =
        nextUnitCost !== null ? Number((newQty * nextUnitCost).toFixed(4)) : null;

      await manager.query(
        `UPDATE stock_ledger
         SET quantity = $1,
             unit_cost = COALESCE($2, unit_cost),
             total_cost = COALESCE($3, total_cost),
             notes = COALESCE($4, notes)
         WHERE id = $5 AND company_id = $6`,
        [
          newQty,
          nextUnitCost,
          nextTotalCost,
          body.notes !== undefined ? body.notes : null,
          ledgerId,
          companyId,
        ],
      );

      const batchLineRows = await manager.query(
        `UPDATE opening_stock_batch_lines
            SET quantity = $1,
                unit_cost = COALESCE($2, unit_cost),
                total_cost = COALESCE($3, total_cost),
                notes = COALESCE($4, notes)
          WHERE ledger_id = $5
         RETURNING batch_row_id`,
        [
          newQty,
          nextUnitCost,
          nextTotalCost,
          body.notes !== undefined ? body.notes : null,
          ledgerId,
        ],
      );
      if (batchLineRows?.[0]?.batch_row_id) {
        await this.recalculateBatchTotals(manager, batchLineRows[0].batch_row_id);
      }

      if (nextUnitCost !== null && nextUnitCost > 0) {
        await manager.query(
          `UPDATE inventory_balances
              SET unit_cost = $1,
                  average_cost = COALESCE(NULLIF(average_cost, 0), $1)
            WHERE company_id = $2 AND item_id = $3 AND warehouse_id = $4 AND status = 'ACTIVE'`,
          [nextUnitCost, companyId, existing.item_id, existing.warehouse_id],
        );
        await manager.query(
          `UPDATE items
              SET cost_price = $1
            WHERE id = $2 AND company_id = $3`,
          [nextUnitCost, existing.item_id, companyId],
        );
        await manager.query(
          `UPDATE machine_components
              SET unit_cost = $1
            WHERE item_id = $2 AND company_id = $3 AND is_active = true AND (unit_cost IS NULL OR unit_cost = 0)`,
          [nextUnitCost, existing.item_id, companyId],
        );
        await manager.query(
          `UPDATE component_changes cc
              SET unit_cost = $1
             FROM machine_components mc
            WHERE cc.component_id = mc.id
              AND mc.item_id = $2
              AND cc.company_id = $3
              AND (cc.unit_cost IS NULL OR cc.unit_cost = 0)`,
          [nextUnitCost, existing.item_id, companyId],
        );
      }

      return { ledgerId, quantity: newQty, unitCost: nextUnitCost, delta };
    });
  }

  async deleteLine(companyId: string, ledgerId: string) {
    return this.runInTransaction(async (manager) => {
      const reversedCheck = await manager.query(
        `SELECT osb.status, osb.reference_number
           FROM opening_stock_batch_lines obl
           JOIN opening_stock_batches osb ON osb.id = obl.batch_row_id
          WHERE (obl.ledger_id = $1 OR obl.id = $1) AND osb.company_id = $2
          LIMIT 1`,
        [ledgerId, companyId],
      );
      if (reversedCheck?.[0]?.status === 'REVERSED') {
        throw new BadRequestException(
          `Batch '${reversedCheck[0].reference_number}' is already REVERSED. Restore it first or keep it in history.`,
        );
      }

      const rows = await manager.query(
        `SELECT * FROM stock_ledger
         WHERE id = $1 AND company_id = $2
           AND direction = 'IN'
           AND (UPPER(transaction_type) = 'OPENING' OR UPPER(COALESCE(reference_type, '')) IN ('OPENING', 'OPENING_STOCK', 'PRODUCTION_ITEM_OPEN_STOCK', 'OPENING_RESTORE'))`,
        [ledgerId, companyId],
      );
      if (!rows.length) {
        throw new NotFoundException('Opening stock entry line not found');
      }
      const existing = rows[0];
      const qty = Number(existing.quantity || 0);
      if (qty > 0) {
        await this.balanceService.updateBalance(
          companyId,
          existing.item_id,
          existing.warehouse_id,
          existing.location_id || null,
          existing.batch_id || null,
          existing.uom_id,
          qty,
          'OUT',
          manager,
        );
      }

      await manager.query(
        `DELETE FROM stock_ledger WHERE id = $1 AND company_id = $2`,
        [ledgerId, companyId],
      );

      const deletedBatchLine = await manager.query(
        `DELETE FROM opening_stock_batch_lines WHERE ledger_id = $1 RETURNING batch_row_id`,
        [ledgerId],
      );
      if (deletedBatchLine?.[0]?.batch_row_id) {
        const batchRowId = deletedBatchLine[0].batch_row_id;
        await this.recalculateBatchTotals(manager, batchRowId);
        await manager.query(
          `DELETE FROM opening_stock_batches WHERE id = $1 AND line_count = 0`,
          [batchRowId],
        );
      }

      return { deleted: true, ledgerId };
    });
  }

  async deleteBatch(companyId: string, referenceNumber: string) {
    return this.runInTransaction(async (manager) => {
      const rows = await manager.query(
        `SELECT * FROM stock_ledger
         WHERE company_id = $1 AND reference_number = $2
           AND direction = 'IN'
           AND (UPPER(transaction_type) = 'OPENING' OR UPPER(COALESCE(reference_type, '')) IN ('OPENING', 'OPENING_STOCK', 'PRODUCTION_ITEM_OPEN_STOCK', 'OPENING_RESTORE'))`,
        [companyId, referenceNumber],
      );
      if (!rows.length) {
        throw new NotFoundException(`Opening stock batch '${referenceNumber}' not found`);
      }

      for (const existing of rows) {
        const qty = Number(existing.quantity || 0);
        if (qty > 0) {
          await this.balanceService.updateBalance(
            companyId,
            existing.item_id,
            existing.warehouse_id,
            existing.location_id || null,
            existing.batch_id || null,
            existing.uom_id,
            qty,
            'OUT',
            manager,
          );
        }
      }

      await manager.query(
        `DELETE FROM stock_ledger
         WHERE company_id = $1 AND reference_number = $2
           AND (UPPER(transaction_type) = 'OPENING' OR UPPER(COALESCE(reference_type, '')) IN ('OPENING', 'OPENING_STOCK', 'OPENING_REVERSAL', 'OPENING_RESTORE'))`,
        [companyId, referenceNumber],
      );
      await manager.query(
        `DELETE FROM opening_stock_batches WHERE company_id = $1 AND reference_number = $2`,
        [companyId, referenceNumber],
      );

      return { deleted: true, referenceNumber, deletedLines: rows.length };
    });
  }
}
