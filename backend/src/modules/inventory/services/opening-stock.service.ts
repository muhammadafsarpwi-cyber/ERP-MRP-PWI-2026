import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryBalanceService } from './inventory-balance.service';
import { BatchService } from './batch.service';
import { PostOpeningStockDto } from '../dto';

@Injectable()
export class OpeningStockService {
  private readonly logger = new Logger(OpeningStockService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ledgerService: StockLedgerService,
    private readonly balanceService: InventoryBalanceService,
    private readonly batchService: BatchService,
  ) {}

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

      const ledgerEntry = await this.ledgerService.create({
        companyId,
        transactionType: 'OPENING',
        transactionDate: dto.transactionDate || new Date(),
        itemId: line.itemId,
        warehouseId: dto.warehouseId,
        locationId: line.locationId,
        quantity: line.quantity,
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

      results.push({
        ledgerId: ledgerEntry.id,
        itemId: line.itemId,
        quantity: line.quantity,
        batchId: batchId || null,
      });

      this.logger.log(
        `Opening stock posted: ${line.quantity} of item ${line.itemId} in warehouse ${dto.warehouseId}`,
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
          lines: [],
        });
      }
      const batch = batches.get(key)!;
      const qty = Number(r.quantity || 0);
      batch.lineCount += 1;
      batch.totalQuantity += qty;
      batch.lines.push({
        ledgerId: r.ledger_id,
        itemId: r.item_id,
        itemCode: r.item_code || '',
        itemName: r.item_name || '',
        itemType: r.item_type || '',
        uomId: r.uom_id,
        uomCode: r.uom_code || '',
        quantity: qty,
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
    body: { quantity: number; notes?: string },
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

    await this.dataSource.query(
      `UPDATE stock_ledger
       SET quantity = $1,
           notes = COALESCE($2, notes)
       WHERE id = $3 AND company_id = $4`,
      [newQty, body.notes !== undefined ? body.notes : null, ledgerId, companyId],
    );

    return { ledgerId, quantity: newQty, delta };
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
