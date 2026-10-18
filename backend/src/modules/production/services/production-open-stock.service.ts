import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Item, ItemType, Uom } from '../../item/entities';
import { Warehouse, Department, Division } from '../../organization/entities';
import { StockLedger, InventoryBalance } from '../../inventory/entities';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { applyDivisionScopeFilter } from '../../../common/division-scope.util';
import { REVERSAL_ORIGIN_PATTERN } from '../../../common/stock-movement.classifier';
import { PostProductionOpenStockDto, PostProductionStockAdjustmentDto } from '../dto/production-open-stock.dto';

const PRODUCTION_ITEM_TYPES = [
  ItemType.RAW_MATERIAL,
  ItemType.WORK_IN_PROGRESS,
  ItemType.SEMI_FINISHED,
  ItemType.FINISHED_GOOD,
  'FINISHED_GOODS',
  ItemType.CONSUMABLE,
];

/** Stable key for a (warehouse, item) pair — used by the reconciliation report. */
const pairKey = (warehouseId: string, itemId: string): string => `${warehouseId}|${itemId}`;

@Injectable()
export class ProductionOpenStockService {
  private readonly logger = new Logger(ProductionOpenStockService.name);

  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
    @InjectRepository(StockLedger)
    private readonly ledgerRepo: Repository<StockLedger>,
    @InjectRepository(InventoryBalance)
    private readonly balanceRepo: Repository<InventoryBalance>,
    private readonly stockLedgerService: StockLedgerService,
    private readonly inventoryBalanceService: InventoryBalanceService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Get production-relevant items (RM, WIP, Semi-Finished, FG) scoped by division/department
   * and optionally annotated with current balance for a specified warehouse.
   */
  async getProductionItems(
    companyId: string,
    filter: {
      divisionId?: string;
      departmentId?: string;
      itemType?: string;
      search?: string;
      warehouseId?: string;
      allowedDivisionIds?: string[];
    },
  ) {
    const qb = this.itemRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.baseUom', 'baseUom')
      .leftJoinAndSelect('item.division', 'division')
      .leftJoinAndSelect('item.department', 'department')
      .leftJoinAndSelect('item.category', 'category')
      .where('item.companyId = :companyId', { companyId })
      .andWhere('item.status = :activeStatus', { activeStatus: 'ACTIVE' });

    if (filter.itemType && filter.itemType !== 'ALL') {
      qb.andWhere('item.itemType = :itemType', { itemType: filter.itemType });
    } else {
      qb.andWhere('item.itemType IN (:...prodTypes)', { prodTypes: PRODUCTION_ITEM_TYPES });
    }

    if (filter.divisionId) {
      qb.andWhere('item.divisionId = :divisionId', { divisionId: filter.divisionId });
    }
    applyDivisionScopeFilter(qb, 'item.divisionId', filter.allowedDivisionIds);

    if (filter.departmentId) {
      qb.andWhere('item.departmentId = :departmentId', { departmentId: filter.departmentId });
    }

    if (filter.search) {
      const s = filter.search.trim();
      qb.andWhere(
        '(item.itemCode ILIKE :s OR item.name ILIKE :s OR item.sku ILIKE :s)',
        { s: `%${s}%` },
      );
    }

    qb.orderBy('item.itemCode', 'ASC');
    const items = await qb.getMany();

    // If warehouseId is provided, pull real balances for these items
    let balanceMap = new Map<string, number>();
    if (filter.warehouseId && items.length > 0) {
      const itemIds = items.map((i) => i.id);
      const balances = await this.balanceRepo.find({
        where: {
          companyId,
          warehouseId: filter.warehouseId,
          itemId: In(itemIds),
          status: 'ACTIVE',
        },
      });
      balances.forEach((b) => {
        balanceMap.set(b.itemId, Number(b.onHand) || 0);
      });
    }

    return items.map((item) => {
      let weightPerPiece: number | null = null;
      if (item.weightPerPiece && Number(item.weightPerPiece) > 0) {
        weightPerPiece = Number(Number(item.weightPerPiece).toFixed(6));
      } else if (item.piecesPerKg && Number(item.piecesPerKg) > 0) {
        weightPerPiece = Number((1 / Number(item.piecesPerKg)).toFixed(6));
      }

      let weightPerMeter: number | null = null;
      if (item.weightPerMeter && Number(item.weightPerMeter) > 0) {
        weightPerMeter = Number(Number(item.weightPerMeter).toFixed(6));
      }

      return {
        id: item.id,
        itemCode: item.itemCode,
        name: item.name,
        itemName: item.name,
        sku: item.sku,
        itemType: item.itemType,
        costPrice: Number(item.costPrice) || 0,
        unitCost: Number(item.costPrice) || 0,
        weightPerPiece,
        piecesPerKg: item.piecesPerKg ? Number(item.piecesPerKg) : null,
        weightPerMeter,
        lengthPerPiece: item.lengthPerPiece ? Number(item.lengthPerPiece) : null,
        baseUomId: item.baseUomId,
        uomId: item.baseUomId,
        uomCode: item.baseUom?.code || item.baseUom?.symbol || 'PCS',
        baseUom: item.baseUom ? { id: item.baseUom.id, code: item.baseUom.code, symbol: item.baseUom.symbol } : null,
        divisionId: item.divisionId,
        divisionName: item.division?.name || null,
        departmentId: item.departmentId,
        departmentName: item.department?.name || null,
        currentBalance: balanceMap.get(item.id) ?? 0,
      };
    });
  }

  /**
   * Get production-relevant floor warehouses (e.g. FT, SP, PVC, ST, SW, PL, CCD Warehouse, SPI Warehouse)
   */
  async getProductionWarehouses(
    companyId: string,
    filter: { divisionId?: string; allowedDivisionIds?: string[] } = {},
  ) {
    const qb = this.warehouseRepo
      .createQueryBuilder('wh')
      .where('wh.companyId = :companyId', { companyId })
      .andWhere('wh.status = :status', { status: 'ACTIVE' });

    const warehouses = await qb.orderBy('wh.warehouseCode', 'ASC').getMany();

    // Annotate warehouse with division association heuristic if relevant
    return warehouses.map((w) => {
      const code = (w.warehouseCode || '').toUpperCase();
      const name = (w.name || '').toUpperCase();
      let inferredDivision: 'CCD' | 'SPI' | 'GENERAL' = 'GENERAL';
      if (code.includes('CCD') || name.includes('CCD') || code.includes('FT') || code.includes('PVC')) {
        inferredDivision = 'CCD';
      } else if (code.includes('SPI') || name.includes('SPI') || code.includes('ST') || code.includes('SW') || code.includes('PL')) {
        inferredDivision = 'SPI';
      }

      return {
        id: w.id,
        warehouseCode: w.warehouseCode,
        name: w.name,
        warehouseType: w.warehouseType,
        inferredDivision,
      };
    });
  }

  /**
   * Post Opening Stock specifically for production items & floor warehouses.
   */
  async postOpeningStock(
    companyId: string,
    dto: PostProductionOpenStockDto,
    userId?: string,
  ): Promise<{ posted: number; referenceNumber: string; lines: any[] }> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one item line is required for opening stock');
    }
    if (!dto.warehouseId) {
      throw new BadRequestException('Target warehouse is required');
    }

    const refNumber =
      dto.referenceNumber?.trim() ||
      `PROD-OPN-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const txDateRaw = dto.transactionDate || (dto as any).date;
    const transactionDate = txDateRaw ? new Date(txDateRaw) : new Date();

    return await this.dataSource.transaction(async (manager) => {
      const results: any[] = [];

      for (const line of dto.lines) {
        if (!line.quantity || Number(line.quantity) <= 0) continue;

        let uomId = line.uomId;
        if (!uomId) {
          const it = await manager.getRepository(Item).findOne({ where: { id: line.itemId } });
          uomId = it?.baseUomId || '';
        }

        const ledgerEntry = await this.stockLedgerService.create(
          {
            companyId,
            transactionType: 'OPENING',
            transactionDate,
            itemId: line.itemId,
            warehouseId: dto.warehouseId,
            quantity: Number(line.quantity),
            uomId,
            direction: 'IN',
            referenceType: 'PRODUCTION_ITEM_OPEN_STOCK',
            referenceNumber: refNumber,
            divisionId: dto.divisionId || null,
            sectionId: dto.sectionId || null,
            departmentId: dto.departmentId || null,
            notes: line.notes || dto.notes || `Production Item Open Stock (${refNumber})`,
            createdBy: userId,
          },
          manager,
        );

        await this.inventoryBalanceService.updateBalance(
          companyId,
          line.itemId,
          dto.warehouseId,
          null,
          null,
          uomId,
          Number(line.quantity),
          'IN',
          manager,
        );

        results.push({
          ledgerId: ledgerEntry.id,
          itemId: line.itemId,
          quantity: Number(line.quantity),
        });
      }

      this.logger.log(
        `Production Item Open Stock posted: ${results.length} lines in warehouse ${dto.warehouseId} [Ref: ${refNumber}]`,
      );

      return {
        posted: results.length,
        referenceNumber: refNumber,
        lines: results,
      };
    });
  }

  /**
   * Post Stock Adjustment (Surplus / Shortage) for production items.
   * Handles physical count vs book stock variances with Surplus (IN) or Shortage (OUT).
   */
  async postStockAdjustment(
    companyId: string,
    dto: PostProductionStockAdjustmentDto,
    userId?: string,
  ): Promise<{ adjusted: number; referenceNumber: string; lines: any[] }> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one item line is required for stock adjustment');
    }
    if (!dto.warehouseId) {
      throw new BadRequestException('Warehouse is required for adjustment');
    }

    const refNumber =
      dto.referenceNumber?.trim() ||
      `PROD-ADJ-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    const txDateRaw = dto.transactionDate || (dto as any).date;
    const transactionDate = txDateRaw ? new Date(txDateRaw) : new Date();

    return await this.dataSource.transaction(async (manager) => {
      const results: any[] = [];

      for (const line of dto.lines) {
        const physical = Number(line.physicalStock ?? (line as any).physicalQuantity ?? 0);
        const current = Number(line.currentStock ?? (line as any).systemQuantity ?? 0);
        const variance = physical - current;

        if (Math.abs(variance) < 0.0001) {
          // No difference, skip
          continue;
        }

        let uomId = line.uomId;
        if (!uomId) {
          const it = await manager.getRepository(Item).findOne({ where: { id: line.itemId } });
          uomId = it?.baseUomId || '';
        }

        const direction: 'IN' | 'OUT' = variance > 0 ? 'IN' : 'OUT';
        let absQty = Math.abs(variance);
        const reasonText =
          line.reason || dto.adjustmentReason || dto.reason || (variance > 0 ? 'Physical Surplus' : 'Physical Shortfall');

        if (direction === 'OUT') {
          const currentBal = await this.inventoryBalanceService.findByItemWarehouse(
            companyId,
            line.itemId,
            dto.warehouseId,
            undefined,
            undefined,
            manager,
          );
          const currentOnHand = Number(currentBal?.onHand || 0);
          if (currentOnHand < absQty && Math.abs(currentOnHand - absQty) < 0.05) {
            absQty = currentOnHand;
          }
          if (absQty <= 0) {
            continue;
          }
        }

        const ledgerEntry = await this.stockLedgerService.create(
          {
            companyId,
            transactionType: direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
            transactionDate,
            itemId: line.itemId,
            warehouseId: dto.warehouseId,
            quantity: absQty,
            uomId,
            direction,
            referenceType: 'PRODUCTION_STOCK_ADJUSTMENT',
            referenceNumber: refNumber,
            divisionId: dto.divisionId || null,
            sectionId: dto.sectionId || null,
            departmentId: dto.departmentId || null,
            notes: `${reasonText} [Diff: ${variance > 0 ? '+' : ''}${variance.toFixed(2)}] - ${line.notes || ''}`.trim(),
            createdBy: userId,
          },
          manager,
        );

        await this.inventoryBalanceService.updateBalance(
          companyId,
          line.itemId,
          dto.warehouseId,
          null,
          null,
          uomId,
          absQty,
          direction,
          manager,
        );

        results.push({
          ledgerId: ledgerEntry.id,
          itemId: line.itemId,
          variance,
          direction,
          quantity: absQty,
          newBalance: physical,
        });
      }

      this.logger.log(
        `Production Stock Adjustment posted: ${results.length} lines in warehouse ${dto.warehouseId} [Ref: ${refNumber}]`,
      );

      return {
        adjusted: results.length,
        referenceNumber: refNumber,
        lines: results,
      };
    });
  }

  /**
   * Analytics and distribution charts data for Production Item Open Stock & Adjustments
   */
  async getStats(
    companyId: string,
    filter: { divisionId?: string; warehouseId?: string; allowedDivisionIds?: string[] } = {},
  ) {
    // 1. Stock by Item Type in active balances
    const balanceQb = this.balanceRepo
      .createQueryBuilder('b')
      .innerJoin('b.item', 'item')
      .leftJoin('b.warehouse', 'wh')
      .select('item.itemType', 'itemType')
      .addSelect('COUNT(DISTINCT item.id)', 'itemCount')
      .addSelect('SUM(b.onHand)', 'totalQty')
      .where('b.companyId = :companyId', { companyId })
      .andWhere('b.status = :status', { status: 'ACTIVE' })
      .andWhere('b.onHand > 0');

    if (filter.warehouseId) {
      balanceQb.andWhere('b.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
    }
    if (filter.divisionId) {
      balanceQb.andWhere('item.divisionId = :divisionId', { divisionId: filter.divisionId });
    }
    applyDivisionScopeFilter(balanceQb, 'item.divisionId', filter.allowedDivisionIds);

    balanceQb.groupBy('item.itemType');
    const rawTypeStats = await balanceQb.getRawMany();

    // 2. Stock by Warehouse Breakdown
    const whQb = this.balanceRepo
      .createQueryBuilder('b')
      .innerJoin('b.warehouse', 'wh')
      .innerJoin('b.item', 'item')
      .select('wh.id', 'warehouseId')
      .addSelect('wh.name', 'warehouseName')
      .addSelect('wh.warehouseCode', 'warehouseCode')
      .addSelect('COUNT(DISTINCT b.itemId)', 'itemCount')
      .addSelect('SUM(b.onHand)', 'totalQty')
      .where('b.companyId = :companyId', { companyId })
      .andWhere('b.status = :status', { status: 'ACTIVE' })
      .andWhere('b.onHand > 0');

    if (filter.divisionId) {
      whQb.andWhere('item.divisionId = :divisionId', { divisionId: filter.divisionId });
    }
    applyDivisionScopeFilter(whQb, 'item.divisionId', filter.allowedDivisionIds);

    whQb.groupBy('wh.id, wh.name, wh.warehouseCode');
    const rawWhStats = await whQb.getRawMany();

    // 3. Adjustment summary (Surplus vs Shortage)
    const adjQb = this.ledgerRepo
      .createQueryBuilder('sl')
      .innerJoin('sl.item', 'item')
      .select('sl.direction', 'direction')
      .addSelect('COUNT(sl.id)', 'count')
      .addSelect('SUM(sl.quantity)', 'totalQty')
      .where('sl.companyId = :companyId', { companyId })
      .andWhere("sl.referenceType = 'PRODUCTION_STOCK_ADJUSTMENT'");

    if (filter.warehouseId) {
      adjQb.andWhere('sl.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
    }
    if (filter.divisionId) {
      adjQb.andWhere('item.divisionId = :divisionId', { divisionId: filter.divisionId });
    }
    applyDivisionScopeFilter(adjQb, 'item.divisionId', filter.allowedDivisionIds);

    adjQb.groupBy('sl.direction');
    const rawAdjStats = await adjQb.getRawMany();

    let surplusCount = 0;
    let surplusQty = 0;
    let shortageCount = 0;
    let shortageQty = 0;

    rawAdjStats.forEach((r) => {
      if (r.direction === 'IN') {
        surplusCount = Number(r.count) || 0;
        surplusQty = Number(r.totalQty) || 0;
      } else if (r.direction === 'OUT') {
        shortageCount = Number(r.count) || 0;
        shortageQty = Number(r.totalQty) || 0;
      }
    });

    const totalQty = rawTypeStats.reduce((sum, r) => sum + (Number(r.totalQty) || 0), 0);
    const totalItems = rawTypeStats.reduce((sum, r) => sum + (Number(r.itemCount) || 0), 0);

    return {
      summary: {
        totalStockQty: totalQty,
        totalItems,
        surplusCount,
        surplusQty,
        shortageCount,
        shortageQty,
        netVarianceQty: surplusQty - shortageQty,
      },
      itemTypes: rawTypeStats.map((r) => ({
        type: r.itemType,
        count: Number(r.itemCount) || 0,
        qty: Number(r.totalQty) || 0,
        percentage: totalQty > 0 ? Math.round(((Number(r.totalQty) || 0) / totalQty) * 1000) / 10 : 0,
      })),
      warehouses: rawWhStats.map((r) => ({
        id: r.warehouseId,
        code: r.warehouseCode,
        name: r.warehouseName,
        itemCount: Number(r.itemCount) || 0,
        qty: Number(r.totalQty) || 0,
      })),
      adjustments: {
        surplusCount,
        surplusQty,
        shortageCount,
        shortageQty,
      },
    };
  }

  /**
   * Historical record of Production Open Stock and Stock Adjustment transactions
   */
  async getHistory(
    companyId: string,
    filter: {
      divisionId?: string;
      departmentId?: string;
      warehouseId?: string;
      transactionType?: string;
      search?: string;
      page?: number;
      limit?: number;
      allowedDivisionIds?: string[];
    },
  ) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));

    const qb = this.ledgerRepo
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.item', 'item')
      .leftJoinAndSelect('sl.uom', 'uom')
      .leftJoinAndSelect('sl.warehouse', 'wh')
      .leftJoinAndSelect('sl.department', 'dept')
      .leftJoinAndSelect('sl.division', 'div')
      .where('sl.companyId = :companyId', { companyId })
      .andWhere(
        "sl.referenceType IN ('PRODUCTION_ITEM_OPEN_STOCK', 'PRODUCTION_STOCK_ADJUSTMENT', 'OPENING_STOCK')",
      );

    if (filter.transactionType) {
      qb.andWhere('sl.transactionType = :txType', { txType: filter.transactionType });
    }
    if (filter.warehouseId) {
      qb.andWhere('sl.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
    }
    if (filter.departmentId) {
      qb.andWhere('sl.departmentId = :departmentId', { departmentId: filter.departmentId });
    }
    if (filter.divisionId) {
      qb.andWhere('item.divisionId = :divisionId', { divisionId: filter.divisionId });
    }
    applyDivisionScopeFilter(qb, 'item.divisionId', filter.allowedDivisionIds);

    if (filter.search) {
      const s = filter.search.trim();
      qb.andWhere(
        '(sl.referenceNumber ILIKE :s OR item.itemCode ILIKE :s OR item.name ILIKE :s OR sl.notes ILIKE :s)',
        { s: `%${s}%` },
      );
    }

    qb.orderBy('sl.transactionDate', 'DESC');
    qb.addOrderBy('sl.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((d) => {
        let parsedRate = 0;
        if (d.notes) {
          const match = d.notes.match(/@\s*([\d.]+)\s*Rs/);
          if (match && match[1]) parsedRate = parseFloat(match[1]);
        }
        return {
          id: d.id,
          transactionDate: d.transactionDate,
          transactionType: d.transactionType,
          referenceType: d.referenceType,
          referenceNumber: d.referenceNumber,
          direction: d.direction,
          quantity: Number(d.quantity) || 0,
          itemId: d.itemId,
          itemCode: d.item?.itemCode || '—',
          itemName: d.item?.name || '—',
          itemType: d.item?.itemType || '—',
          unitCost: parsedRate,
          totalCost: parsedRate * (Number(d.quantity) || 0),
          balanceAfter: Number(d.quantity) || 0,
          uomSymbol: d.uom?.symbol || d.uom?.code || 'PCS',
          warehouseId: d.warehouseId,
          warehouseName: d.warehouse?.name || d.warehouse?.warehouseCode || '—',
          warehouseCode: d.warehouse?.warehouseCode || '—',
          departmentName: d.department?.name || '—',
          divisionName: d.division?.name || '—',
          notes: d.notes,
          createdAt: d.createdAt,
          item: {
            id: d.item?.id || d.itemId,
            itemCode: d.item?.itemCode || '—',
            name: d.item?.name || '—',
            itemName: d.item?.name || '—',
            itemType: d.item?.itemType || '—',
          },
          warehouse: {
            id: d.warehouse?.id || d.warehouseId,
            warehouseCode: d.warehouse?.warehouseCode || '—',
            warehouseName: d.warehouse?.name || '—',
            name: d.warehouse?.name || '—',
          },
        };
      }),
      total,
      page,
      limit,
    };
  }

  /**
   * Reverse/Delete a posted opening stock or adjustment transaction by its ledger ID
   *
   * APPEND-ONLY. This used to `manager.remove(StockLedger, entry)` — deleting
   * the journal row outright and clamping the balance at zero with
   * `Math.max(0, …)`. Both were silent data loss: the journal lost the
   * movement it was supposed to be the permanent record of, and the clamp
   * discarded a genuine negative so the ledger and `inventory_balances` could
   * drift apart with nothing to show for it. A reversal row is written instead,
   * and the balance is allowed to go where the arithmetic actually puts it.
   */
  async reverseTransaction(companyId: string, id: string, userId?: string) {
    const entry = await this.ledgerRepo.findOne({
      where: { id, companyId },
      relations: ['item', 'warehouse'],
    });
    if (!entry) {
      throw new BadRequestException('Transaction record not found.');
    }

    return await this.dataSource.transaction(async (manager) => {
      // The family this row belongs to decides how the reversal is worded:
      // a reversal row must name the family it undoes, or it is unreadable to
      // every consumer that parses `Reversal of <FAMILY>`.
      const family = entry.transactionType === 'PRODUCTION_REVERSAL'
        ? (REVERSAL_ORIGIN_PATTERN.exec(String(entry.notes ?? ''))?.[1] ?? null)
        : entry.transactionType;

      const reversal = await this.stockLedgerService.create(
        {
          companyId,
          transactionType: 'PRODUCTION_REVERSAL',
          transactionDate: new Date(),
          itemId: entry.itemId,
          warehouseId: entry.warehouseId,
          locationId: entry.locationId ?? undefined,
          batchId: entry.batchId ?? undefined,
          quantity: Number(entry.quantity),
          uomId: entry.uomId,
          // Opposite of the original: an IN comes back OUT, and vice versa.
          direction: entry.direction === 'IN' ? 'OUT' : 'IN',
          referenceType: entry.referenceType ?? undefined,
          referenceId: entry.referenceId ?? undefined,
          referenceNumber: entry.referenceNumber ?? undefined,
          notes: family
            ? `Reversal of ${family} for transaction ${entry.referenceNumber || entry.id}`
            : `Reversal of transaction ${entry.referenceNumber || entry.id}`,
          createdBy: userId ?? undefined,
          divisionId: entry.divisionId,
        },
        manager,
      );

      const balance = await manager.findOne(InventoryBalance, {
        where: {
          companyId,
          itemId: entry.itemId,
          warehouseId: entry.warehouseId,
        },
      });

      if (balance) {
        // NO `Math.max(0, …)`. If the balance cannot absorb the reversal that
        // is a real, reportable condition — clamping it made the number look
        // tidy while leaving the ledger permanently ahead of the books.
        const delta = entry.direction === 'IN' ? -Number(entry.quantity) : Number(entry.quantity);
        balance.onHand = Number(balance.onHand) + delta;
        balance.available = Number(balance.available) + delta;
        if (Number(balance.onHand) < 0) {
          this.logger.warn(
            `Reversing ledger row ${id} drove ${entry.itemId}@${entry.warehouseId} to ` +
              `${balance.onHand} on-hand — the balance was already overstated.`,
          );
        }
        await manager.save(InventoryBalance, balance);
      }

      return {
        success: true,
        message: `Transaction ${entry.referenceNumber || entry.id} reversed successfully.`,
        // The original row is left in place (the journal is append-only); the
        // id returned is the reversal row that neutralises it.
        reversedLedgerId: reversal?.id,
        // Surfaced so the UI can warn instead of leaving a negative to be
        // discovered on a report later.
        balanceAdjusted: !!balance,
      };
    });
  }

  /**
   * Permanently delete a posted opening stock or adjustment ledger entry
   * and revert its impact on inventory_balances.
   */
  async deleteTransaction(companyId: string, id: string, userId?: string) {
    const entry = await this.ledgerRepo.findOne({
      where: { id, companyId },
      relations: ['item', 'warehouse'],
    });
    if (!entry) {
      throw new BadRequestException('Transaction record not found.');
    }

    return await this.dataSource.transaction(async (manager) => {
      const balance = await manager.findOne(InventoryBalance, {
        where: {
          companyId,
          itemId: entry.itemId,
          warehouseId: entry.warehouseId,
        },
      });

      if (balance) {
        // If entry was IN, deleting it removes qty from balance (-qty)
        // If entry was OUT, deleting it restores qty back to balance (+qty)
        const delta = entry.direction === 'IN' ? -Number(entry.quantity) : Number(entry.quantity);
        balance.onHand = Number(balance.onHand) + delta;
        balance.available = Number(balance.available) + delta;
        await manager.save(InventoryBalance, balance);
      }

      await manager.remove(StockLedger, entry);

      this.logger.log(
        `Deleted stock ledger entry ${entry.referenceNumber || entry.id} (${entry.transactionType}, ${entry.quantity} ${entry.direction}) and reverted inventory balance.`,
      );

      return {
        success: true,
        message: `Transaction ${entry.referenceNumber || entry.id} deleted and stock balance updated successfully.`,
        deletedLedgerId: id,
        balanceAdjusted: !!balance,
      };
    });
  }


  /**
   * Dedicated Department Stock Breakdown & Hierarchy Matrix (Tab 5)
   * Groups items by department/warehouse with dual-unit (KG & PCS) conversion and division annotations.
   */
  async getDepartmentStockMatrix(
    companyId: string,
    filter: {
      divisionId?: string;
      search?: string;
      allowedDivisionIds?: string[];
    } = {},
  ) {
    // 1. Get all active warehouses for this company
    const whQb = this.warehouseRepo
      .createQueryBuilder('wh')
      .where('wh.companyId = :companyId', { companyId })
      .andWhere('wh.status = :status', { status: 'ACTIVE' });

    const warehouses = await whQb.orderBy('wh.warehouseCode', 'ASC').getMany();

    // 2. Query active inventory balances with onHand > 0, joining item and baseUom
    const balQb = this.balanceRepo
      .createQueryBuilder('b')
      .innerJoinAndSelect('b.item', 'item')
      .leftJoinAndSelect('item.baseUom', 'baseUom')
      .leftJoinAndSelect('item.division', 'division')
      .innerJoinAndSelect('b.warehouse', 'wh')
      .where('b.companyId = :companyId', { companyId })
      .andWhere('b.status = :status', { status: 'ACTIVE' })
      .andWhere('b.onHand > 0');

    if (filter.divisionId && filter.divisionId !== 'ALL') {
      balQb.andWhere('item.divisionId = :divisionId', { divisionId: filter.divisionId });
    }
    applyDivisionScopeFilter(balQb, 'item.divisionId', filter.allowedDivisionIds);

    if (filter.search) {
      const s = filter.search.trim().toLowerCase();
      balQb.andWhere(
        '(LOWER(wh.name) LIKE :s OR LOWER(wh.warehouseCode) LIKE :s OR LOWER(item.name) LIKE :s OR LOWER(item.itemCode) LIKE :s)',
        { s: `%${s}%` },
      );
    }

    balQb.orderBy('wh.warehouseCode', 'ASC').addOrderBy('item.itemCode', 'ASC');
    const balances = await balQb.getMany();

    // 3. Group balances by warehouseId
    const whMap = new Map<string, typeof balances>();
    for (const b of balances) {
      if (!whMap.has(b.warehouseId)) {
        whMap.set(b.warehouseId, []);
      }
      whMap.get(b.warehouseId)!.push(b);
    }

    // 4. Transform warehouses and their items
    const rows = warehouses
      .map((wh) => {
        const code = (wh.warehouseCode || '').toUpperCase();
        const name = (wh.name || '').toUpperCase();
        let inferredDivision: 'SPI' | 'CCD' | 'GENERAL' = 'GENERAL';
        let divisionCode = 'DIV-GEN';
        let divisionName = 'General Division';

        if (code.includes('CCD') || name.includes('CCD') || code.includes('FT') || code.includes('PVC')) {
          inferredDivision = 'CCD';
          divisionCode = 'DIV-CCD';
          divisionName = 'Control Cable Division';
        } else if (
          code.includes('SPI') ||
          name.includes('SPI') ||
          code.includes('ST') ||
          code.includes('SW') ||
          code.includes('PL') ||
          code.includes('SP')
        ) {
          inferredDivision = 'SPI';
          divisionCode = 'DIV-SPD';
          divisionName = 'Spoke Division';
        } else if (code.includes('MAIN')) {
          divisionCode = 'DIV-PWI';
          divisionName = 'Main Division E-51';
        }

        const balList = whMap.get(wh.id) || [];

        // If filtering by divisionId, check if warehouse matches inferred or if it has items of that division
        if (filter.divisionId && filter.divisionId !== 'ALL') {
          const hasMatchingItems = balList.length > 0;
          const matchesInferred =
            (filter.divisionId === 'd1000000-0000-0000-0000-000000000001' && inferredDivision === 'SPI') ||
            (filter.divisionId === 'd1000000-0000-0000-0000-000000000002' && inferredDivision === 'CCD');

          if (!hasMatchingItems && !matchesInferred) {
            return null;
          }
        }

        let totalWeightKg = 0;
        let totalPieces = 0;
        let totalGross = 0;
        let totalCartons = 0;
        let totalValuation = 0;

        const isFgWarehouse =
          (wh.warehouseCode || '').toUpperCase().includes('FGDW') ||
          (wh.name || '').toUpperCase().includes('DISPATCH') ||
          (wh.warehouseType || '').toUpperCase().includes('FINISHED') ||
          (wh.name || '').toUpperCase().includes('FG');

        const isNippleWarehouse =
          (wh.warehouseCode || '').toUpperCase().includes('WH-002') ||
          (wh.name || '').toLowerCase().includes('nipple') ||
          (wh.warehouseCode || '').toUpperCase().includes('NIP');

        const items = balList.map((b) => {
          const it = b.item;
          const uomCode = (it.baseUom?.code || (it as any).uomCode || 'PCS').toUpperCase();
          const isKg = uomCode === 'KG';
          const qty = Number(b.onHand) || 0;
          const weightPerPiece = it.weightPerPiece ? Number(it.weightPerPiece) : 0;

          // KG <-> PCS Bidirectional Conversion
          let convertedWeightKg = 0;
          let convertedPieces = 0;

          if (isKg) {
            convertedWeightKg = qty;
            convertedPieces = weightPerPiece > 0 ? Math.round(qty / weightPerPiece) : 0;
          } else {
            convertedPieces = qty;
            convertedWeightKg = weightPerPiece > 0 ? Number((qty * weightPerPiece).toFixed(4)) : 0;
          }

          // Gross Calculation (144 Pieces = 1 Gross for Spoke / Nipple / Finished Goods)
          const isSpokeOrNippleOrFg =
            inferredDivision === 'SPI' ||
            isNippleWarehouse ||
            isFgWarehouse ||
            it.itemType === 'FINISHED_GOOD' ||
            (it.itemCode || '').toUpperCase().includes('NP') ||
            (it.itemCode || '').toUpperCase().includes('SPK') ||
            (it.name || '').toLowerCase().includes('nipple') ||
            (it.name || '').toLowerCase().includes('spoke');

          const convertedGross =
            isSpokeOrNippleOrFg && convertedPieces > 0
              ? Number((convertedPieces / 144).toFixed(2))
              : 0;

          // Carton Calculation (CTN) - 1 Carton = 10 GRS (1,440 PCS) standard or 10.556 GRS (1,520 PCS) for CS
          const itemPkgSize = Number(it.packagingSize) || 0;
          const isCS =
            (it.itemCode || '').toUpperCase().includes('011') ||
            (it.itemCode || '').toUpperCase().includes('012') ||
            (it.name || '').toUpperCase().includes('(CS)') ||
            (it.name || '').toUpperCase().includes('CS');
          const grossPerCarton = itemPkgSize > 0 ? itemPkgSize : isCS ? 10.555556 : 10;

          let convertedCartons = 0;
          if (
            (isFgWarehouse || it.itemType === 'FINISHED_GOOD' || itemPkgSize > 0) &&
            convertedGross > 0 &&
            grossPerCarton > 0
          ) {
            convertedCartons = Number((convertedGross / grossPerCarton).toFixed(2));
          }

          const unitCost = Number((it as any).unitCost ?? it.costPrice ?? 0);
          const lineValuation = convertedWeightKg > 0 ? convertedWeightKg * unitCost : convertedPieces * unitCost;

          totalWeightKg += convertedWeightKg;
          totalPieces += convertedPieces;
          totalGross += convertedGross;
          totalCartons += convertedCartons;
          totalValuation += lineValuation;

          return {
            itemId: it.id,
            itemCode: it.itemCode,
            itemName: it.name || (it as any).itemName,
            itemType: it.itemType,
            uomId: it.baseUomId,
            uomCode,
            baseUomSymbol: it.baseUom?.symbol || uomCode,
            primaryStock: qty,
            isKg,
            weightPerPiece,
            convertedWeightKg,
            convertedPieces,
            convertedGross,
            convertedCartons,
            grossPerCarton,
            packagingSize: itemPkgSize,
            packagingUnit: it.packagingUnit || 'Carton',
            unitCost,
            totalValuation: Math.round(lineValuation * 100) / 100,
          };
        });

        return {
          warehouseId: wh.id,
          warehouseCode: wh.warehouseCode,
          warehouseName: wh.name,
          warehouseType: wh.warehouseType,
          inferredDivision,
          divisionCode,
          divisionName,
          isFgWarehouse,
          isNippleWarehouse,
          summary: {
            totalItems: items.length,
            totalWeightKg: Math.round(totalWeightKg * 100) / 100,
            totalPieces,
            totalGross: Math.round(totalGross * 100) / 100,
            totalCartons: Math.round(totalCartons * 100) / 100,
            totalValuation: Math.round(totalValuation * 100) / 100,
          },
          items,
        };
      })
      .filter(Boolean);

    return rows;
  }

  // ─── Reconciliation ─────────────────────────────────────────────────────────

  /**
   * Report drift between `stock_ledger` and `inventory_balances`.
   *
   * WHY THIS EXISTS. `getDepartmentStockMatrix` above reads
   * `inventory_balances` and presents it as "SYSTEM BOOK STOCK". That number
   * is a SNAPSHOT, and a snapshot can only ever be as correct as the last
   * write that touched it. Three separate code paths wrote the ledger without
   * updating the balance (or updated the balance without leaving the ledger
   * row), so for a while the snapshot quietly stopped meaning anything — and
   * because it was never checked against its own source, nothing surfaced the
   * drift until someone noticed the screen disagreed with the database.
   *
   * This is that check. For every (warehouse, item) pair it compares:
   *
   *   ledger net  = Σ over stock_ledger of the signed movement
   *   balance     = inventory_balances.on_hand
   *
   * and reports the difference. It is the detector for the whole class of
   * defect, not just the three instances known today.
   *
   * REPORT-ONLY BY DEFAULT, AND DELIBERATELY SO. Blindly reconciling in
   * either direction is unsafe here, because the two sides are wrong by
   * DIFFERENT amounts and in DIFFERENT directions: balances are overstated by
   * stock that was never reversed off them, while the ledger is understated by
   * rows that were hard-deleted. Picking either side as "the truth" and
   * forcing the other to match would push several warehouses negative. The
   * safe default is therefore to measure and report; writing is opt-in per
   * call and requires an explicit flag in the request, so no scheduled job,
   * no retry and no accidental double-submit can ever move a balance.
   *
   * `minAbsDrift` filters out float noise — a 0.0001 rounding artefact is not
   * drift and reporting it buries the real findings.
   */
  async reconcileBalances(
    companyId: string,
    filter: {
      divisionId?: string;
      warehouseId?: string;
      itemId?: string;
      allowedDivisionIds?: string[];
      minAbsDrift?: number;
      /** MUST be the literal string 'APPLY'. Anything else is a report. */
      apply?: string;
    } = {},
  ): Promise<{
    applied: boolean;
    scannedPairs: number;
    driftPairs: number;
    totalDrift: number;
    negativeAfterApply: number;
    rows: Array<Record<string, any>>;
  }> {
    const minAbsDrift = Number.isFinite(Number(filter.minAbsDrift)) ? Math.abs(Number(filter.minAbsDrift)) : 0.0001;
    // The write path is armed by an explicit, unambiguous confirmation string
    // rather than a boolean, because `?apply=true` is easy to send by accident
    // and impossible to send by accident THIS way.
    const applied = filter.apply === 'APPLY';

    // Ledger net per (warehouse, item). `ledgerBalanceDelta` is the single
    // rule set for "did this row move the balance, and which way?" — scrap is
    // an audit row and contributes nothing, which is exactly what keeps this
    // report honest against rows the balance never saw.
    const params: any[] = [companyId];
    let scopeSql = '';
    if (filter.warehouseId) {
      params.push(filter.warehouseId);
      scopeSql += ` AND sl.warehouse_id = $${params.length}`;
    }
    if (filter.itemId) {
      params.push(filter.itemId);
      scopeSql += ` AND sl.item_id = $${params.length}`;
    }
    if (filter.divisionId && filter.divisionId !== 'ALL') {
      params.push(filter.divisionId);
      scopeSql += ` AND item.division_id = $${params.length}`;
    }
    if (filter.allowedDivisionIds !== undefined) {
      // An EMPTY effective scope must match nothing, never everything.
      params.push(filter.allowedDivisionIds);
      scopeSql += filter.allowedDivisionIds.length
        ? ` AND item.division_id = ANY($${params.length}::uuid[])`
        : ' AND 1 = 0';
    }

    const ledgerRows: Array<Record<string, any>> = await this.dataSource.query(
      `SELECT sl.warehouse_id, sl.item_id,
              SUM(CASE
                    WHEN sl.transaction_type = 'PRODUCTION_SCRAP' THEN 0
                    WHEN sl.transaction_type = 'PRODUCTION_REVERSAL'
                         AND COALESCE(sl.notes, '') ~ '^Reversal of PRODUCTION_SCRAP' THEN 0
                    WHEN sl.direction = 'OUT' THEN -sl.quantity
                    ELSE sl.quantity
                  END) AS ledger_net,
              COUNT(*)::int AS ledger_rows
         FROM stock_ledger sl
         JOIN items item ON item.id = sl.item_id
        WHERE sl.company_id = $1${scopeSql}
        GROUP BY sl.warehouse_id, sl.item_id`,
      params,
    );

    const balanceParams: any[] = [companyId];
    let balanceScope = '';
    if (filter.warehouseId) {
      balanceParams.push(filter.warehouseId);
      balanceScope += ` AND ib.warehouse_id = $${balanceParams.length}`;
    }
    if (filter.itemId) {
      balanceParams.push(filter.itemId);
      balanceScope += ` AND ib.item_id = $${balanceParams.length}`;
    }
    if (filter.divisionId && filter.divisionId !== 'ALL') {
      balanceParams.push(filter.divisionId);
      balanceScope += ` AND item.division_id = $${balanceParams.length}`;
    }
    if (filter.allowedDivisionIds !== undefined) {
      balanceParams.push(filter.allowedDivisionIds);
      balanceScope += filter.allowedDivisionIds.length
        ? ` AND item.division_id = ANY($${balanceParams.length}::uuid[])`
        : ' AND 1 = 0';
    }

    const balanceRows: Array<Record<string, any>> = await this.dataSource.query(
      `SELECT ib.warehouse_id, ib.item_id, ib.on_hand, ib.status, ib.uom_id,
              (SELECT COUNT(*)::int FROM inventory_balances dup
                WHERE dup.company_id = ib.company_id
                  AND dup.item_id = ib.item_id
                  AND dup.warehouse_id = ib.warehouse_id) AS balance_rows
         FROM inventory_balances ib
         JOIN items item ON item.id = ib.item_id
        WHERE ib.company_id = $1${balanceScope}`,
      balanceParams,
    );

    const byKey = new Map<string, Record<string, any>>();

    for (const r of ledgerRows) {
      byKey.set(pairKey(r.warehouse_id, r.item_id), {
        warehouseId: r.warehouse_id,
        itemId: r.item_id,
        ledgerNet: Number(r.ledger_net) || 0,
        ledgerRows: r.ledger_rows,
        balanceOnHand: 0,
        balanceRows: 0,
        // The balance row's OWN uom, not the item's base UOM: the correction
        // has to be written in the unit the row was already tracked in, or it
        // forks the quantity rather than fixing it.
        uomId: null as string | null,
      });
    }
    for (const r of balanceRows) {
      const k = pairKey(r.warehouse_id, r.item_id);
      const existing = byKey.get(k);
      const onHand = Number(r.on_hand) || 0;
      if (existing) {
        existing.balanceOnHand += onHand;
        existing.balanceRows = r.balance_rows;
        existing.uomId = existing.uomId ?? r.uom_id ?? null;
      } else {
        // A balance with NO ledger behind it is the tell-tale of the defect:
        // stock on the books with no movement that can justify it.
        byKey.set(k, {
          warehouseId: r.warehouse_id,
          itemId: r.item_id,
          ledgerNet: 0,
          ledgerRows: 0,
          balanceOnHand: onHand,
          balanceRows: r.balance_rows,
          uomId: r.uom_id ?? null,
        });
      }
    }

    const detail = await this.loadReconcileDetail(
      companyId,
      [...byKey.values()].map((e) => ({ warehouseId: e.warehouseId, itemId: e.itemId })),
    );

    const rows: Array<Record<string, any>> = [];
    let totalDrift = 0;
    let driftPairs = 0;
    let negativeAfterApply = 0;
    let scannedPairs = 0;

    for (const entry of byKey.values()) {
      const drift = Number((entry.balanceOnHand - entry.ledgerNet).toFixed(4));
      if (Math.abs(drift) < minAbsDrift) continue;

      scannedPairs += 1;
      driftPairs += 1;
      totalDrift += drift;

      const meta: { itemCode?: string | null; itemName?: string | null; warehouseCode?: string | null; warehouseName?: string | null; uomId?: string | null } =
        detail.get(pairKey(entry.warehouseId, entry.itemId)) ?? {};
      rows.push({
        ...entry,
        ...meta,
        drift,
        // Two distinct root causes, and they need different repairs:
        //  - positive drift: the balance is ahead of the journal (unreversed
        //    delete, or a balance write with no ledger row);
        //  - negative drift: the journal is ahead of the balance (hard-deleted
        //    ledger rows, or a clamp that discarded a negative).
        direction: drift > 0 ? 'BALANCE_OVERSTATED' : 'LEDGER_OVERSTATED',
      });

      // Applying needs exactly one balance row (otherwise "the balance" is
      // ambiguous and the fix would have to pick one) and a UOM to write in.
      // Both are reported rather than assumed.
      if (applied && entry.balanceRows === 1 && entry.uomId) {
        const after = Number((entry.balanceOnHand - drift).toFixed(4));
        if (after < 0) negativeAfterApply += 1;
        await this.inventoryBalanceService.updateBalance(
          companyId,
          entry.itemId,
          entry.warehouseId,
          null,
          null,
          entry.uomId,
          Math.abs(drift),
          drift > 0 ? 'OUT' : 'IN',
          undefined,
          true,
        );
      }
    }

    rows.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

    if (applied && driftPairs) {
      this.logger.warn(
        `Reconciliation APPLIED to ${driftPairs} pair(s) for company ${companyId} ` +
          `(net ${totalDrift}). ${negativeAfterApply} went negative — investigate before ` +
          'trusting any report built on these balances.',
      );
    }

    return { applied, scannedPairs, driftPairs, totalDrift, negativeAfterApply, rows };
  }

  /**
   * Human-readable context for a set of (warehouse, item) pairs, so a drift
   * row names the item and warehouse rather than leaving two UUIDs to be
   * looked up by hand — which is how a drift report ends up never being read.
   *
   * Also surfaces duplicate balance rows, which are their own defect: the
   * report sums them, so a pair showing `balanceRows > 1` will drift for a
   * reason that has nothing to do with the ledger.
   */
  private async loadReconcileDetail(
    companyId: string,
    pairs: Array<{ warehouseId: string; itemId: string }>,
  ): Promise<Map<string, { itemCode: string; itemName: string; warehouseCode: string; warehouseName: string; uomId: string }>> {
    const out = new Map<
      string,
      { itemCode: string; itemName: string; warehouseCode: string; warehouseName: string; uomId: string }
    >();
    if (!pairs.length) return out;

    const itemIds = [...new Set(pairs.map((p) => p.itemId))];
    const warehouseIds = [...new Set(pairs.map((p) => p.warehouseId))];

    const items = await this.itemRepo
      .createQueryBuilder('i')
      .select(['i.id AS id', 'i.item_code AS "itemCode"', 'i.name AS "itemName"', 'i.base_uom_id AS "uomId"'])
      .where('i.company_id = :companyId', { companyId })
      .andWhere('i.id = ANY(:ids)', { ids: itemIds })
      .getRawMany();
    const warehouses = await this.warehouseRepo
      .createQueryBuilder('w')
      .select(['w.id AS id', 'w.warehouse_code AS "warehouseCode"', 'w.name AS "warehouseName"'])
      .where('w.company_id = :companyId', { companyId })
      .andWhere('w.id = ANY(:ids)', { ids: warehouseIds })
      .getRawMany();

    const itemById = new Map(items.map((i: any) => [i.id, i]));
    const whById = new Map(warehouses.map((w: any) => [w.id, w]));

    for (const p of pairs) {
      const i = itemById.get(p.itemId) ?? {};
      const w = whById.get(p.warehouseId) ?? {};
      out.set(pairKey(p.warehouseId, p.itemId), {
        itemCode: i.itemCode ?? null,
        itemName: i.itemName ?? null,
        warehouseCode: w.warehouseCode ?? null,
        warehouseName: w.warehouseName ?? null,
        uomId: i.uomId ?? null,
      });
    }
    return out;
  }
}
