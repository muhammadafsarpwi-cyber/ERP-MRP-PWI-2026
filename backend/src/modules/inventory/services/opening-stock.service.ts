import { Injectable, BadRequestException, NotFoundException, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryBalanceService } from './inventory-balance.service';
import { BatchService } from './batch.service';
import { PostOpeningStockDto } from '../dto';

@Injectable()
export class OpeningStockService implements OnModuleInit {
  private readonly logger = new Logger(OpeningStockService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ledgerService: StockLedgerService,
    private readonly balanceService: InventoryBalanceService,
    private readonly batchService: BatchService,
  ) {}

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

      this.logger.log('Verified inventory costing columns and backfilled recoverable unit costs.');
    } catch (err: any) {
      this.logger.warn(`Cost schema init/backfill skipped: ${err?.message || err}`);
    }
  }

  async postOpeningStock(
    dto: PostOpeningStockDto,
    userId?: string,
  ): Promise<{ posted: number; lines: any[] }> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('Opening stock must have at least one line');
    }

    const companyId = dto.companyId || '7725aa04-a270-4314-9e82-90949cbe7791';
    const results: any[] = [];

    for (const line of dto.lines) {
      let batchId = line.batchId || undefined;

      if (line.batchNumber && !batchId) {
        const batch = await this.batchService.create({
          companyId,
          itemId: line.itemId,
          warehouseId: dto.warehouseId,
          batchNumber: line.batchNumber,
          quantity: line.quantity,
        }, userId);
        batchId = batch.id;
      }

      const prevBalRows: Array<{ prev_qty: string | number }> = await this.dataSource.query(
        `SELECT COALESCE(SUM(on_hand), 0) AS prev_qty
           FROM inventory_balances
          WHERE company_id = $1 AND item_id = $2 AND warehouse_id = $3 AND status = 'ACTIVE'`,
        [companyId, line.itemId, dto.warehouseId],
      );
      const prevOnHand = Number(prevBalRows?.[0]?.prev_qty || 0);

      const enteredCost =
        line.unitCost !== undefined && line.unitCost !== null && Number(line.unitCost) > 0
          ? Number(line.unitCost)
          : null;

      const ledgerEntry = await this.ledgerService.create({
        companyId,
        transactionType: 'OPENING',
        transactionDate: dto.transactionDate || new Date(),
        itemId: line.itemId,
        warehouseId: dto.warehouseId,
        locationId: line.locationId,
        quantity: line.quantity,
        unitCost: enteredCost,
        totalCost: enteredCost !== null ? Number((Number(line.quantity) * enteredCost).toFixed(4)) : null,
        uomId: line.uomId,
        direction: 'IN',
        referenceType: 'OPENING_STOCK',
        referenceNumber: dto.referenceNumber,
        batchId,
        serialNumber: line.serialNumber || undefined,
        notes: line.notes || undefined,
        createdBy: userId,
      });

      await this.balanceService.updateBalance(
        companyId,
        line.itemId,
        dto.warehouseId,
        line.locationId || null,
        batchId || null,
        line.uomId,
        line.quantity,
        'IN',
      );

      if (enteredCost !== null && enteredCost > 0) {
        await this.balanceService.updateWeightedAverageCost(
          companyId,
          line.itemId,
          dto.warehouseId,
          line.quantity,
          enteredCost,
          prevOnHand,
        );
        await this.dataSource.query(
          `UPDATE items
              SET cost_price = $1
            WHERE id = $2 AND company_id = $3 AND (cost_price IS NULL OR cost_price = 0)`,
          [enteredCost, line.itemId, companyId],
        );
        await this.dataSource.query(
          `UPDATE machine_components
              SET unit_cost = $1
            WHERE item_id = $2 AND company_id = $3 AND is_active = true AND (unit_cost IS NULL OR unit_cost = 0)`,
          [enteredCost, line.itemId, companyId],
        );
      }

      results.push({
        ledgerId: ledgerEntry.id,
        itemId: line.itemId,
        quantity: line.quantity,
        unitCost: enteredCost,
        batchId: batchId || null,
      });

      this.logger.log(
        `Opening stock posted: ${line.quantity} of item ${line.itemId} (unitCost=${enteredCost ?? 'none'}) in warehouse ${dto.warehouseId}`,
      );
    }

    return { posted: results.length, lines: results };
  }

  async getHistory(
    companyId: string,
    filters?: { warehouseId?: string; search?: string },
  ) {
    const params: any[] = [companyId];
    const conds: string[] = [
      'sl.company_id = $1',
      "(UPPER(sl.transaction_type) = 'OPENING' OR UPPER(COALESCE(sl.reference_type, '')) = 'OPENING_STOCK')",
    ];

    if (filters?.warehouseId) {
      params.push(filters.warehouseId);
      conds.push(`sl.warehouse_id = $${params.length}`);
    }

    if (filters?.search?.trim()) {
      params.push(`%${filters.search.trim()}%`);
      const p = `$${params.length}`;
      conds.push(`(sl.reference_number ILIKE ${p} OR i.item_code ILIKE ${p} OR i.name ILIKE ${p} OR w.name ILIKE ${p})`);
    }

    const rows = await this.dataSource.query(
      `SELECT
         sl.id AS ledger_id,
         sl.reference_number,
         sl.transaction_date,
         sl.warehouse_id,
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

    const batches = new Map<string, any>();
    for (const r of rows) {
      const ref = r.reference_number || 'OPN-UNREF';
      const key = `${ref}::${r.warehouse_id || ''}`;
      if (!batches.has(key)) {
        batches.set(key, {
          key,
          referenceNumber: ref,
          transactionDate: r.transaction_date,
          warehouseId: r.warehouse_id,
          warehouseCode: r.warehouse_code || '',
          warehouseName: r.warehouse_name || 'Unknown Warehouse',
          divisionName: r.division_name || '',
          createdByName: r.created_by_name || 'System',
          lineCount: 0,
          totalQuantity: 0,
          totalValue: 0,
          lines: [],
        });
      }
      const batch = batches.get(key)!;
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

    return Array.from(batches.values());
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

    const rows = await this.dataSource.query(
      `SELECT * FROM stock_ledger
       WHERE id = $1 AND company_id = $2
         AND (UPPER(transaction_type) = 'OPENING' OR UPPER(COALESCE(reference_type, '')) = 'OPENING_STOCK')`,
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

    await this.dataSource.query(
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

    if (nextUnitCost !== null && nextUnitCost > 0) {
      await this.dataSource.query(
        `UPDATE inventory_balances
            SET unit_cost = $1,
                average_cost = COALESCE(NULLIF(average_cost, 0), $1)
          WHERE company_id = $2 AND item_id = $3 AND warehouse_id = $4 AND status = 'ACTIVE'`,
        [nextUnitCost, companyId, existing.item_id, existing.warehouse_id],
      );
      await this.dataSource.query(
        `UPDATE items
            SET cost_price = $1
          WHERE id = $2 AND company_id = $3`,
        [nextUnitCost, existing.item_id, companyId],
      );
      await this.dataSource.query(
        `UPDATE machine_components
            SET unit_cost = $1
          WHERE item_id = $2 AND company_id = $3 AND is_active = true AND (unit_cost IS NULL OR unit_cost = 0)`,
        [nextUnitCost, existing.item_id, companyId],
      );
      await this.dataSource.query(
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
  }

  async deleteLine(companyId: string, ledgerId: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM stock_ledger
       WHERE id = $1 AND company_id = $2
         AND (UPPER(transaction_type) = 'OPENING' OR UPPER(COALESCE(reference_type, '')) = 'OPENING_STOCK')`,
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
      );
    }

    await this.dataSource.query(
      `DELETE FROM stock_ledger WHERE id = $1 AND company_id = $2`,
      [ledgerId, companyId],
    );

    return { deleted: true, ledgerId };
  }

  async deleteBatch(companyId: string, referenceNumber: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM stock_ledger
       WHERE company_id = $1 AND reference_number = $2
         AND (UPPER(transaction_type) = 'OPENING' OR UPPER(COALESCE(reference_type, '')) = 'OPENING_STOCK')`,
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
        );
      }
    }

    await this.dataSource.query(
      `DELETE FROM stock_ledger
       WHERE company_id = $1 AND reference_number = $2
         AND (UPPER(transaction_type) = 'OPENING' OR UPPER(COALESCE(reference_type, '')) = 'OPENING_STOCK')`,
      [companyId, referenceNumber],
    );

    return { deleted: true, referenceNumber, deletedLines: rows.length };
  }
}
