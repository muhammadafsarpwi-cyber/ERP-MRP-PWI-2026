import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Item, ItemType, Uom } from '../../item/entities';
import { Warehouse, Department, Division } from '../../organization/entities';
import { StockLedger, InventoryBalance } from '../../inventory/entities';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { applyDivisionScopeFilter } from '../../../common/division-scope.util';
import { PostProductionOpenStockDto, PostProductionStockAdjustmentDto } from '../dto/production-open-stock.dto';

const PRODUCTION_ITEM_TYPES = [
  ItemType.RAW_MATERIAL,
  ItemType.WORK_IN_PROGRESS,
  ItemType.SEMI_FINISHED,
  ItemType.FINISHED_GOOD,
  'FINISHED_GOODS',
  ItemType.CONSUMABLE,
];

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
   * Post Stock Adjustment (کمی بیشی / ایڈجسٹمنٹ) for production items.
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

    // 3. Adjustment summary (Surplus vs Shortage / کمی بیشی)
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
      const balance = await manager.findOne(InventoryBalance, {
        where: {
          companyId,
          itemId: entry.itemId,
          warehouseId: entry.warehouseId,
        },
      });

      if (balance) {
        if (entry.direction === 'IN') {
          balance.onHand = Math.max(0, Number(balance.onHand) - Number(entry.quantity));
        } else if (entry.direction === 'OUT') {
          balance.onHand = Number(balance.onHand) + Number(entry.quantity);
        }
        balance.available = balance.onHand;
        await manager.save(InventoryBalance, balance);
      }

      await manager.remove(StockLedger, entry);

      return {
        success: true,
        message: `Transaction ${entry.referenceNumber || entry.id} reversed successfully.`,
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
        let totalValuation = 0;

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

          const unitCost = Number((it as any).unitCost ?? it.costPrice ?? 0);
          const lineValuation = convertedWeightKg > 0 ? convertedWeightKg * unitCost : convertedPieces * unitCost;

          totalWeightKg += convertedWeightKg;
          totalPieces += convertedPieces;
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
          summary: {
            totalItems: items.length,
            totalWeightKg: Math.round(totalWeightKg * 100) / 100,
            totalPieces,
            totalValuation: Math.round(totalValuation * 100) / 100,
          },
          items,
        };
      })
      .filter(Boolean);

    return rows;
  }
}
