import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, In } from 'typeorm';
import { StockLedger, InventoryBalance } from '../../inventory/entities';
import { ProductionEntry, ProductionOrder, ProductionOrderOperation } from '../../production/entities';
import { ProductionRouting, RoutingOperation, RoutingStatus } from '../../production-routing/entities';
import { BillOfMaterials, BomLine, BomStatus } from '../../bom/entities';
import { Item, Uom } from '../../item/entities';
import { Division, Section, Department, Warehouse, WarehouseLocation } from '../../organization/entities';
import { TraceabilityQueryDto } from '../dto/traceability.dto';

const n = (v: unknown): number => Number(v) || 0;
const r4 = (v: number): number => Math.round(v * 10000) / 10000;

@Injectable()
export class TraceabilityService {
  constructor(
    @InjectRepository(StockLedger) private readonly ledgerRepo: Repository<StockLedger>,
    @InjectRepository(InventoryBalance) private readonly balanceRepo: Repository<InventoryBalance>,
    @InjectRepository(ProductionEntry) private readonly entryRepo: Repository<ProductionEntry>,
    @InjectRepository(ProductionRouting) private readonly routingRepo: Repository<ProductionRouting>,
    @InjectRepository(RoutingOperation) private readonly opRepo: Repository<RoutingOperation>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(Uom) private readonly uomRepo: Repository<Uom>,
    @InjectRepository(Warehouse) private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Division) private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Section) private readonly sectionRepo: Repository<Section>,
    @InjectRepository(Department) private readonly departmentRepo: Repository<Department>,
    @InjectRepository(BillOfMaterials) private readonly bomRepo: Repository<BillOfMaterials>,
    @InjectRepository(BomLine) private readonly bomLineRepo: Repository<BomLine>,
    @InjectRepository(ProductionOrder) private readonly orderRepo: Repository<ProductionOrder>,
    @InjectRepository(ProductionOrderOperation) private readonly orderOpRepo: Repository<ProductionOrderOperation>,
    @InjectRepository(WarehouseLocation) private readonly locationRepo: Repository<WarehouseLocation>,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async getItem(companyId: string, itemId: string): Promise<Item> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, companyId },
      relations: ['baseUom', 'division', 'section', 'department'],
    });
    if (!item) throw new NotFoundException(`Item with id '${itemId}' not found in this company`);
    return item;
  }

  private itemSummary(item: Item): Record<string, any> {
    return {
      id: item.id,
      itemCode: item.itemCode,
      name: item.name,
      itemType: item.itemType,
      wireSizeMm: item.wireSizeMm,
      thicknessMm: item.thicknessMm,
      widthMm: item.widthMm,
      uom: item.baseUom ? { id: item.baseUom.id, code: item.baseUom.code, name: item.baseUom.name } : null,
      division: item.division ? { id: item.division.id, name: item.division.name } : null,
      section: item.section ? { id: item.section.id, name: item.section.name } : null,
      department: item.department ? { id: item.department.id, name: item.department.name } : null,
      isManufacturable: item.isManufacturable,
      isPurchasable: item.isPurchasable,
      isStockItem: item.isStockItem,
      trackInventory: item.trackInventory,
    };
  }

  private applyLedgerFilters(qb: any, companyId: string, itemId: string, filter: TraceabilityQueryDto): any {
    qb.where('ledger.companyId = :companyId', { companyId });
    qb.andWhere('ledger.itemId = :itemId', { itemId });
    if (filter.warehouseId) qb.andWhere('ledger.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
    if (filter.batchId) qb.andWhere('ledger.batchId = :batchId', { batchId: filter.batchId });
    if (filter.uomId) qb.andWhere('ledger.uomId = :uomId', { uomId: filter.uomId });
    return qb;
  }

  // ─── Item Overview ─────────────────────────────────────────────────────

  async getItemOverview(companyId: string, itemId: string): Promise<Record<string, any>> {
    const item = await this.getItem(companyId, itemId);
    const balances = await this.balanceRepo
      .createQueryBuilder('b')
      .select('COALESCE(SUM(b.onHand),0)', 'onHand')
      .addSelect('COALESCE(SUM(b.reserved),0)', 'reserved')
      .addSelect('COALESCE(SUM(b.available),0)', 'available')
      .where('b.companyId = :companyId', { companyId })
      .andWhere('b.itemId = :itemId', { itemId })
      .getRawOne();
    return { item: this.itemSummary(item), currentBalance: { onHand: n(balances.onHand), reserved: n(balances.reserved), available: n(balances.available) } };
  }

  // ─── Stock Statement ───────────────────────────────────────────────────

  async getItemStatement(companyId: string, itemId: string, filter: TraceabilityQueryDto): Promise<Record<string, any>> {
    const item = await this.getItem(companyId, itemId);
    const dateFrom = filter.dateFrom ? new Date(`${filter.dateFrom}T00:00:00.000Z`) : null;
    const dateTo = filter.dateTo ? new Date(`${filter.dateTo}T23:59:59.999Z`) : null;
    const excludeScrap = "ledger.transactionType <> 'PRODUCTION_SCRAP'";

    const sumQb = (beforeFrom: boolean): any => {
      const qb = this.ledgerRepo.createQueryBuilder('ledger').select([
        "COALESCE(SUM(CASE WHEN ledger.direction = 'IN' THEN ledger.quantity ELSE 0 END),0) AS \"totalIn\"",
        "COALESCE(SUM(CASE WHEN ledger.direction = 'OUT' THEN ledger.quantity ELSE 0 END),0) AS \"totalOut\"",
      ]);
      this.applyLedgerFilters(qb, companyId, itemId, filter);
      qb.andWhere(excludeScrap);
      if (beforeFrom && dateFrom) qb.andWhere('ledger.transactionDate < :dateFrom', { dateFrom });
      if (!beforeFrom && dateFrom) qb.andWhere('ledger.transactionDate >= :dateFrom', { dateFrom });
      if (!beforeFrom && dateTo) qb.andWhere('ledger.transactionDate <= :dateTo', { dateTo });
      return qb;
    };

    // Opening balance (before dateFrom), or ALL-time if no dateFrom
    const openingRow = await sumQb(true).getRawOne();
    const openingBalance = r4(n(openingRow.totalIn) - n(openingRow.totalOut));

    // In-range breakdown by type
    const breakdownQb = this.ledgerRepo.createQueryBuilder('ledger')
      .select(['ledger.transactionType AS "type"', "ledger.direction AS \"dir\"", 'COALESCE(SUM(ledger.quantity),0) AS "qty"'])
      .where('ledger.companyId = :companyId', { companyId })
      .andWhere('ledger.itemId = :itemId', { itemId });
    if (filter.warehouseId) breakdownQb.andWhere('ledger.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
    if (dateFrom) breakdownQb.andWhere('ledger.transactionDate >= :dateFrom', { dateFrom });
    if (dateTo) breakdownQb.andWhere('ledger.transactionDate <= :dateTo', { dateTo });
    breakdownQb.groupBy('ledger.transactionType').addGroupBy('ledger.direction');
    const breakdownRows = await breakdownQb.getRawMany();

    const categories: Record<string, number> = {};
    const typeMap: Record<string, string> = {
      PRODUCTION_RECEIPT: 'productionReceipt', PRODUCTION_CONSUMPTION: 'productionConsumption',
      PRODUCTION_ISSUE: 'productionIssue', RECEIPT: 'purchaseReceipt',
      TRANSFER_IN: 'transferIn', TRANSFER_OUT: 'transferOut',
      ADJUSTMENT_IN: 'adjustmentIn', ADJUSTMENT_OUT: 'adjustmentOut',
      PRODUCTION_SCRAP: 'scrap', SALES_DELIVERY: 'salesDelivery',
      SALES_RETURN: 'salesReturn', RETURN_IN: 'returnIn', RETURN_OUT: 'returnOut',
      OPENING: 'opening',
    };
    for (const r of breakdownRows) {
      const key = typeMap[r.type] || (r.dir === 'IN' ? 'otherIn' : 'otherOut');
      categories[key] = r4((categories[key] || 0) + n(r.qty));
    }

    // In-range net (excluding scrap)
    const inRangeRow = await sumQb(false).getRawOne();
    const inRangeIn = n(inRangeRow.totalIn);
    const inRangeOut = n(inRangeRow.totalOut);
    const closingBalance = r4(openingBalance + inRangeIn - inRangeOut);

    // All-time ledger balance (excluding scrap) for reconciliation
    const allTimeQb = this.ledgerRepo.createQueryBuilder('ledger')
      .select([
        "COALESCE(SUM(CASE WHEN ledger.direction = 'IN' THEN ledger.quantity ELSE 0 END),0) AS \"totalIn\"",
        "COALESCE(SUM(CASE WHEN ledger.direction = 'OUT' THEN ledger.quantity ELSE 0 END),0) AS \"totalOut\"",
      ]);
    this.applyLedgerFilters(allTimeQb, companyId, itemId, filter);
    allTimeQb.andWhere(excludeScrap);
    const allTimeRow = await allTimeQb.getRawOne();
    const ledgerBalance = r4(n(allTimeRow.totalIn) - n(allTimeRow.totalOut));

    // Current inventory balance
    const balanceQb = this.balanceRepo.createQueryBuilder('b')
      .select('COALESCE(SUM(b.onHand),0)', 'onHand')
      .addSelect('COALESCE(SUM(b.reserved),0)', 'reserved')
      .addSelect('COALESCE(SUM(b.available),0)', 'available')
      .where('b.companyId = :companyId', { companyId })
      .andWhere('b.itemId = :itemId', { itemId });
    if (filter.warehouseId) balanceQb.andWhere('b.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
    if (filter.uomId) balanceQb.andWhere('b.uomId = :uomId', { uomId: filter.uomId });
    const balanceRow = await balanceQb.getRawOne();
    const inventoryBalance = n(balanceRow.onHand);
    const diff = r4(inventoryBalance - ledgerBalance);

    return {
      item: this.itemSummary(item),
      filters: { dateFrom: filter.dateFrom, dateTo: filter.dateTo, warehouseId: filter.warehouseId },
      openingBalance,
      categories,
      closingBalance,
      currentBalance: { onHand: inventoryBalance, reserved: n(balanceRow.reserved), available: n(balanceRow.available) },
      reconciliation: { inventoryBalance, ledgerBalance, difference: diff, status: Math.abs(diff) < 0.005 ? 'RECONCILED' : 'MISMATCH' },
    };
  }

  // ─── Stock Ledger Rows (for statement table) ──────────────────────────────

  async getLedgerRows(companyId: string, itemId: string, filter: TraceabilityQueryDto): Promise<{ data: any[]; total: number }> {
    const dateFrom = filter.dateFrom ? new Date(`${filter.dateFrom}T00:00:00.000Z`) : null;
    const dateTo = filter.dateTo ? new Date(`${filter.dateTo}T23:59:59.999Z`) : null;
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(filter.limit) || 100));

    const qb = this.ledgerRepo.createQueryBuilder('ledger')
      .leftJoinAndSelect('ledger.item', 'item')
      .leftJoinAndSelect('ledger.warehouse', 'warehouse')
      .leftJoinAndSelect('ledger.uom', 'uom')
      .leftJoinAndSelect('ledger.batch', 'batch')
      .leftJoinAndSelect('ledger.division', 'division')
      .leftJoinAndSelect('ledger.section', 'section')
      .leftJoinAndSelect('ledger.department', 'department')
      .where('ledger.companyId = :companyId', { companyId })
      .andWhere('ledger.itemId = :itemId', { itemId });
    if (dateFrom) qb.andWhere('ledger.transactionDate >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('ledger.transactionDate <= :dateTo', { dateTo });
    if (filter.warehouseId) qb.andWhere('ledger.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
    qb.orderBy('ledger.transactionDate', 'ASC').addOrderBy('ledger.createdAt', 'ASC');
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    const mapped = data.map((r) => ({
      id: r.id, transactionDate: r.transactionDate, transactionType: r.transactionType,
      direction: r.direction, quantity: n(r.quantity),
      item: r.item ? { id: r.item.id, itemCode: r.item.itemCode, name: r.item.name } : null,
      warehouse: r.warehouse ? { id: r.warehouse.id, warehouseCode: r.warehouse.warehouseCode, name: r.warehouse.name } : null,
      uom: r.uom ? { id: r.uom.id, code: r.uom.code } : null,
      batch: r.batch ? { id: r.batch.id, batchNumber: r.batch.batchNumber } : null,
      division: r.division ? { id: r.division.id, name: r.division.name } : null,
      section: r.section ? { id: r.section.id, name: r.section.name } : null,
      department: r.department ? { id: r.department.id, name: r.department.name } : null,
      referenceType: r.referenceType, referenceId: r.referenceId, referenceNumber: r.referenceNumber,
      notes: r.notes, createdAt: r.createdAt,
    }));
    return { data: mapped, total };
  }

  // ─── Production History ────────────────────────────────────────────────

  async getItemProductionHistory(companyId: string, itemId: string, filter: TraceabilityQueryDto): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(filter.limit) || 50));
    const dateFrom = filter.dateFrom ? new Date(`${filter.dateFrom}T00:00:00.000Z`) : null;
    const dateTo = filter.dateTo ? new Date(`${filter.dateTo}T23:59:59.999Z`) : null;

    const qb = this.entryRepo.createQueryBuilder('pe')
      .leftJoinAndSelect('pe.division', 'division')
      .leftJoinAndSelect('pe.section', 'section')
      .leftJoinAndSelect('pe.department', 'department')
      .leftJoinAndSelect('pe.shift', 'shift')
      .leftJoinAndSelect('pe.item', 'item')
      .leftJoinAndSelect('pe.uom', 'uom')
      .leftJoinAndSelect('pe.machine', 'machine')
      .leftJoinAndSelect('pe.productionOrder', 'productionOrder')
      .where('pe.companyId = :companyId', { companyId })
      .andWhere('pe.itemId = :itemId', { itemId })
      .andWhere('pe.isActive = true');
    if (dateFrom) qb.andWhere('pe.entryDate >= :dateFrom', { dateFrom: filter.dateFrom });
    if (dateTo) qb.andWhere('pe.entryDate <= :dateTo', { dateTo: filter.dateTo });
    qb.orderBy('pe.entryDate', 'DESC').addOrderBy('pe.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();

    const mapped = data.map((e) => ({
      id: e.id, entryDate: e.entryDate,
      item: e.item ? { id: e.item.id, itemCode: e.item.itemCode, name: e.item.name, itemType: e.item.itemType } : null,
      uom: e.uom ? { id: e.uom.id, code: e.uom.code, name: e.uom.name } : null,
      division: e.division ? { id: e.division.id, name: e.division.name } : null,
      section: e.section ? { id: e.section.id, name: e.section.name } : null,
      department: e.department ? { id: e.department.id, name: e.department.name, departmentCode: e.department.departmentCode } : null,
      machine: e.machine ? { id: e.machine.id, machineCode: e.machine.machineCode, name: e.machine.name } : null,
      machineNo: e.machineNo,
      shift: e.shift ? { id: e.shift.id, name: e.shift.name, shiftCode: e.shift.shiftCode } : null,
      operatorName: e.operatorName, supervisorName: e.supervisorName,
      coilSize: e.coilSize,
      targetQuantity: n(e.targetQuantity), actualQuantity: n(e.actualQuantity), scrapQuantity: n(e.scrapQuantity),
      runningHours: n(e.runningHours), downtimeHours: n(e.downtimeHours),
      achievementPercentage: e.achievementPercentage, efficiencyPercentage: e.efficiencyPercentage,
      productionOrder: e.productionOrder ? { id: e.productionOrder.id, orderNumber: e.productionOrder.orderNumber, status: e.productionOrder.status } : null,
      productionOrderOperationId: e.productionOrderOperationId,
      inventoryReferenceId: e.inventoryReferenceId,
      remarks: e.remarks, createdAt: e.createdAt,
    }));

    return { data: mapped, total, page, limit };
  }

  // ─── Traceability Chain ────────────────────────────────────────────────

  async getItemChain(companyId: string, itemId: string): Promise<Record<string, any>> {
    const item = await this.getItem(companyId, itemId);
    // Find ACTIVE routings that involve this item
    const routings = await this.routingRepo.find({
      where: { companyId, status: RoutingStatus.ACTIVE, isActive: true },
      relations: ['product', 'operations', 'operations.inputItem', 'operations.outputItem', 'operations.division', 'operations.section', 'operations.department', 'operations.uom'],
    });

    const matchingRouting = routings.find((r) => {
      if (r.productId === itemId) return true;
      return r.operations?.some((op) => op.inputItemId === itemId || op.outputItemId === itemId);
    });

    if (!matchingRouting) {
      return { item: this.itemSummary(item), hasRouting: false, nodes: [], previousProcess: null, nextProcess: null, routing: null };
    }

    const ops = (matchingRouting.operations || []).sort((a, b) => a.sequenceNo - b.sequenceNo);
    // Build chain: start with the first operation's input item (or the routing's product)
    const startItem = ops[0]?.inputItem || matchingRouting.product;
    const nodes: any[] = [];
    if (startItem) {
      nodes.push({ type: 'item', item: this.itemSummary(startItem), step: 0 });
    }
    for (const op of ops) {
      nodes.push({ type: 'process', step: nodes.length, operation: this.opSummary(op) });
      if (op.outputItem) {
        nodes.push({ type: 'item', step: nodes.length, item: this.itemSummary(op.outputItem) });
      }
    }

    // Additional inputs from BOM (for each process node, find BOM of output item for extra components)
    const outputItemIds = ops.filter((o) => o.outputItemId).map((o) => o.outputItemId);
    if (outputItemIds.length > 0) {
      const boms = await this.bomRepo.find({ where: { productId: outputItemIds as any, companyId, status: BomStatus.ACTIVE, isActive: true }, relations: ['lines', 'lines.item'] });
      for (const node of nodes) {
        if (node.type === 'process' && node.operation?.outputItem?.id) {
          const bom = boms.find((b) => b.productId === node.operation.outputItem.id);
          if (bom) {
            const opInputId = node.operation.inputItem?.id;
            const additional = bom.lines
              .filter((l) => l.itemId !== opInputId && l.item)
              .map((l) => ({ itemId: l.itemId, itemCode: l.item?.itemCode, itemName: l.item?.name, quantity: n(l.quantity), uom: l.uomId }));
            if (additional.length > 0) node.operation.additionalInputs = additional;
          }
        }
      }
    }

    // Previous / Next relative to selected item
    const selectedItemIdx = nodes.findIndex((n) => n.type === 'item' && n.item?.id === itemId);
    const prevProcess = selectedItemIdx > 0 ? nodes[selectedItemIdx - 1]?.type === 'process' ? nodes[selectedItemIdx - 1] : null : null;
    const nextProcess = selectedItemIdx < nodes.length - 1 ? nodes[selectedItemIdx + 1]?.type === 'process' ? nodes[selectedItemIdx + 1] : null : null;
    const prevItem = selectedItemIdx > 0 ? nodes[selectedItemIdx - 2]?.type === 'item' ? nodes[selectedItemIdx - 2] : null : null;
    const nextItem = selectedItemIdx < nodes.length - 2 ? nodes[selectedItemIdx + 2]?.type === 'item' ? nodes[selectedItemIdx + 2] : null : null;

    return {
      item: this.itemSummary(item),
      hasRouting: true,
      routing: { id: matchingRouting.id, routingCode: matchingRouting.routingCode, name: matchingRouting.name, status: matchingRouting.status },
      nodes,
      previousProcess: prevProcess?.operation ?? null,
      nextProcess: nextProcess?.operation ?? null,
      previousItem: prevItem?.item ?? null,
      nextItem: nextItem?.item ?? null,
    };
  }

  private opSummary(op: RoutingOperation): Record<string, any> {
    return {
      id: op.id, sequenceNo: op.sequenceNo, operationCode: op.operationCode, operationName: op.operationName,
      inputItem: op.inputItem ? { id: op.inputItem.id, itemCode: op.inputItem.itemCode, name: op.inputItem.name, wireSizeMm: op.inputItem.wireSizeMm, thicknessMm: op.inputItem.thicknessMm, widthMm: op.inputItem.widthMm } : null,
      outputItem: op.outputItem ? { id: op.outputItem.id, itemCode: op.outputItem.itemCode, name: op.outputItem.name, wireSizeMm: op.outputItem.wireSizeMm, thicknessMm: op.outputItem.thicknessMm, widthMm: op.outputItem.widthMm } : null,
      inputQuantity: n(op.inputQuantity), outputQuantity: n(op.outputQuantity),
      uom: op.uom ? { id: op.uom.id, code: op.uom.code, name: op.uom.name } : null,
      division: op.division ? { id: op.division.id, name: op.division.name } : null,
      section: op.section ? { id: op.section.id, name: op.section.name } : null,
      department: op.department ? { id: op.department.id, name: op.department.name, departmentCode: op.department.departmentCode } : null,
      scrapPercentage: n(op.scrapPercentage), setupScrapPercentage: n(op.setupScrapPercentage),
      setupTimeMinutes: n(op.setupTimeMinutes), runTimeMinutes: n(op.runTimeMinutes),
    };
  }

  private opSummaryFlat(op: RoutingOperation): Record<string, any> {
    const s = this.opSummary(op);
    // Add production aggregates from production_entries for the output item
    return s;
  }

  // ─── WIP Report ────────────────────────────────────────────────────────

  /**
   * Production-grade WIP report.
   *
   * WIP is DERIVED from the existing architecture:
   *   - Current WIP balance  → inventory_balances.on_hand (WORK_IN_PROGRESS warehouses)
   *   - Movement analysis     → stock_ledger (transaction history, date-filtered)
   *   - Process/chain          → routing_operations (input/output item relationships)
   *   - Org hierarchy          → items → division/section/department
   *
   * Safety rules:
   *   - Current balance is NEVER summed with the ledger (no double counting).
   *   - PRODUCTION_SCRAP is audit-only (does not reduce on-hand) and is shown
   *     separately; it is excluded from balance-affecting computations.
   *   - Opening/Closing WIP are derived from the ledger and clearly labelled;
   *     when no date range is supplied only the current balance is shown.
   *   - Every row is reconciled: inventory_balances.on_hand vs independently
   *     derived ledger balance → RECONCILED / MISMATCH (never hidden).
   */
  async getWip(companyId: string, filter: TraceabilityQueryDto): Promise<Record<string, any>> {
    const dateFrom = filter.dateFrom ? new Date(`${filter.dateFrom}T00:00:00.000Z`) : null;
    const dateTo = filter.dateTo ? new Date(`${filter.dateTo}T23:59:59.999Z`) : null;
    const balanceAffecting = "ledger.transactionType <> 'PRODUCTION_SCRAP'";

    // ── 1. WIP warehouses ──────────────────────────────────────────────────
    const wipWhQb = this.warehouseRepo.createQueryBuilder('w')
      .where('w.companyId = :companyId', { companyId })
      .andWhere("w.warehouseType = 'WORK_IN_PROGRESS'")
      .andWhere('w.status = :status', { status: 'ACTIVE' });
    if (filter.warehouseId) wipWhQb.andWhere('w.id = :warehouseId', { warehouseId: filter.warehouseId });
    const wipWarehouses = await wipWhQb.getMany();
    const wipWhIds = wipWarehouses.map((w) => w.id);

    const context = {
      wipWarehousesFound: wipWarehouses.length,
      wipWarehouses: wipWarehouses.map((w) => ({ id: w.id, warehouseCode: w.warehouseCode, name: w.name })),
      filters: {
        dateFrom: filter.dateFrom ?? null,
        dateTo: filter.dateTo ?? null,
        divisionId: filter.divisionId ?? null,
        sectionId: filter.sectionId ?? null,
        departmentId: filter.departmentId ?? null,
        processId: filter.processId ?? null,
        itemId: filter.itemId ?? null,
        itemType: filter.itemType ?? null,
        warehouseId: filter.warehouseId ?? null,
        locationId: filter.locationId ?? null,
        uomId: filter.uomId ?? null,
      },
    };

    if (!wipWhIds.length) {
      return { summary: { totalWipQuantity: 0, wipItemCount: 0, wipWarehouseCount: 0, departmentCount: 0, activeRecordCount: 0 }, data: [], context };
    }

    // ── 2. Balances in WIP warehouses (current physical balance) ─────────────
    const balQb = this.balanceRepo.createQueryBuilder('b')
      .leftJoinAndSelect('b.item', 'item')
      .leftJoinAndSelect('b.warehouse', 'warehouse')
      .leftJoinAndSelect('b.uom', 'uom')
      .leftJoinAndSelect('b.location', 'location')
      .where('b.companyId = :companyId', { companyId })
      .andWhere('b.warehouseId IN (:...wipWhIds)', { wipWhIds });
    if (filter.itemId) balQb.andWhere('b.itemId = :itemId', { itemId: filter.itemId });
    if (filter.uomId) balQb.andWhere('b.uomId = :uomId', { uomId: filter.uomId });
    if (filter.locationId) balQb.andWhere('b.locationId = :locationId', { locationId: filter.locationId });
    const balances = await balQb.getMany();

    const context2 = { ...context, wipStockRecordsFound: balances.length };
    if (!balances.length) {
      return { summary: { totalWipQuantity: 0, wipItemCount: 0, wipWarehouseCount: wipWhIds.length, departmentCount: 0, activeRecordCount: 0 }, data: [], context: context2 };
    }

    // ── 3. Item org hierarchy (batch load, avoid N+1) ───────────────────────
    const itemIds = [...new Set(balances.map((b) => b.itemId))];
    const itemIdsIn = itemIds.length ? In(itemIds) : In(['00000000-0000-0000-0000-000000000000']);
    const items = await this.itemRepo.find({ where: { id: itemIdsIn }, relations: ['division', 'section', 'department'] });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    // Apply division/section/department/itemType/item filters at item level
    const itemIdFiltered = new Set<string>();
    for (const item of items) {
      if (filter.itemId && item.id !== filter.itemId) continue;
      if (filter.divisionId && item.divisionId !== filter.divisionId) continue;
      if (filter.sectionId && item.sectionId !== filter.sectionId) continue;
      if (filter.departmentId && item.departmentId !== filter.departmentId) continue;
      if (filter.itemType && item.itemType !== filter.itemType) continue;
      itemIdFiltered.add(item.id);
    }
    const usableBalances = balances.filter((b) => itemIdFiltered.has(b.itemId));

    // ── 4. Process/chain resolution from routing_operations ─────────────────
    const involvedOps = await this.opRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.inputItem', 'inputItem')
      .leftJoinAndSelect('o.outputItem', 'outputItem')
      .leftJoinAndSelect('o.division', 'odivision')
      .leftJoinAndSelect('o.section', 'osection')
      .leftJoinAndSelect('o.department', 'odepartment')
      .leftJoinAndSelect('o.uom', 'ouom')
      .where('o.companyId = :companyId', { companyId })
      .andWhere('(o.outputItemId IN (:...itemIds) OR o.inputItemId IN (:...itemIds))', { itemIds })
      .orderBy('o.sequenceNo', 'ASC')
      .getMany();
    // producerOf: itemId → operation that produces it; consumerOf: itemId → operation that consumes it
    const producerOf = new Map<string, RoutingOperation>();
    const consumerOf = new Map<string, RoutingOperation>();
    for (const op of involvedOps) {
      if (op.outputItemId && !producerOf.has(op.outputItemId)) producerOf.set(op.outputItemId, op);
      if (op.inputItemId && !consumerOf.has(op.inputItemId)) consumerOf.set(op.inputItemId, op);
    }

    const processFilterIds = new Set<string>();
    if (filter.processId) processFilterIds.add(filter.processId);

    // ── 5. Ledger movement aggregates (grouped SQL, bounded, no per-item loop) ──
    const ledgerNetThroughDateTo = async (beforeFrom: boolean): Promise<Map<string, number>> => {
      const qb = this.ledgerRepo.createQueryBuilder('ledger')
        .select('ledger.itemId AS "itemId"')
        .addSelect('ledger.warehouseId AS "warehouseId"')
        .addSelect('ledger.locationId AS "locationId"')
        .addSelect("COALESCE(SUM(CASE WHEN ledger.direction='IN' THEN ledger.quantity ELSE 0 END),0) AS \"totalIn\"")
        .addSelect("COALESCE(SUM(CASE WHEN ledger.direction='OUT' THEN ledger.quantity ELSE 0 END),0) AS \"totalOut\"")
        .where('ledger.companyId = :companyId', { companyId })
        .andWhere('ledger.itemId IN (:...itemIds)', { itemIds })
        .andWhere('ledger.warehouseId IN (:...wipWhIds)', { wipWhIds })
        .andWhere(balanceAffecting);
      if (filter.locationId) qb.andWhere('ledger.locationId = :locationId', { locationId: filter.locationId });
      if (beforeFrom && dateFrom) qb.andWhere('ledger.transactionDate < :dateFrom', { dateFrom });
      if (!beforeFrom && dateTo) qb.andWhere('ledger.transactionDate <= :dateTo', { dateTo });
      qb.groupBy('ledger.itemId').addGroupBy('ledger.warehouseId').addGroupBy('ledger.locationId');
      const rows = await qb.getRawMany();
      const map = new Map<string, number>();
      for (const r of rows) {
        const key = `${r.itemId}|${r.warehouseId}|${r.locationId ?? ''}`;
        map.set(key, n(r.totalIn) - n(r.totalOut));
      }
      return map;
    };

    // Opening WIP (before dateFrom) — only meaningful when a date range is supplied
    const openingMap = dateFrom ? await ledgerNetThroughDateTo(true) : new Map<string, number>();
    // Balance-affecting net through dateTo (default = all-time when no dateTo)
    const netThroughDateToMap = await ledgerNetThroughDateTo(false);

    // In-range category movements (produced/consumed/scrap/adjustments/transfers)
    const inRangeQb = this.ledgerRepo.createQueryBuilder('ledger')
      .select('ledger.itemId AS "itemId"')
      .addSelect('ledger.warehouseId AS "warehouseId"')
      .addSelect('ledger.locationId AS "locationId"')
      .addSelect("COALESCE(SUM(CASE WHEN ledger.transactionType='PRODUCTION_RECEIPT' AND ledger.direction='IN' THEN ledger.quantity ELSE 0 END),0) AS \"produced\"")
      .addSelect("COALESCE(SUM(CASE WHEN ledger.transactionType IN ('PRODUCTION_CONSUMPTION','PRODUCTION_ISSUE') AND ledger.direction='OUT' THEN ledger.quantity ELSE 0 END),0) AS \"consumed\"")
      .addSelect("COALESCE(SUM(CASE WHEN ledger.transactionType='PRODUCTION_SCRAP' AND ledger.direction='OUT' THEN ledger.quantity ELSE 0 END),0) AS \"scrap\"")
      .addSelect("COALESCE(SUM(CASE WHEN ledger.transactionType='TRANSFER_IN' AND ledger.direction='IN' THEN ledger.quantity ELSE 0 END),0) AS \"transferIn\"")
      .addSelect("COALESCE(SUM(CASE WHEN ledger.transactionType='TRANSFER_OUT' AND ledger.direction='OUT' THEN ledger.quantity ELSE 0 END),0) AS \"transferOut\"")
      .addSelect("COALESCE(SUM(CASE WHEN ledger.transactionType='ADJUSTMENT_IN' AND ledger.direction='IN' THEN ledger.quantity ELSE 0 END),0) AS \"adjustmentIn\"")
      .addSelect("COALESCE(SUM(CASE WHEN ledger.transactionType='ADJUSTMENT_OUT' AND ledger.direction='OUT' THEN ledger.quantity ELSE 0 END),0) AS \"adjustmentOut\"")
      .addSelect("COALESCE(SUM(CASE WHEN ledger.transactionType='OPENING' AND ledger.direction='IN' THEN ledger.quantity ELSE 0 END),0) AS \"openingQty\"")
      .where('ledger.companyId = :companyId', { companyId })
      .andWhere('ledger.itemId IN (:...itemIds)', { itemIds })
      .andWhere('ledger.warehouseId IN (:...wipWhIds)', { wipWhIds });
    if (filter.locationId) inRangeQb.andWhere('ledger.locationId = :locationId', { locationId: filter.locationId });
    if (dateFrom) inRangeQb.andWhere('ledger.transactionDate >= :dateFrom', { dateFrom });
    if (dateTo) inRangeQb.andWhere('ledger.transactionDate <= :dateTo', { dateTo });
    inRangeQb.groupBy('ledger.itemId').addGroupBy('ledger.warehouseId').addGroupBy('ledger.locationId');
    const inRangeRows = await inRangeQb.getRawMany();
    const inRangeMap = new Map<string, Record<string, number>>();
    for (const r of inRangeRows) {
      const key = `${r.itemId}|${r.warehouseId}|${r.locationId ?? ''}`;
      inRangeMap.set(key, {
        produced: n(r.produced), consumed: n(r.consumed), scrap: n(r.scrap),
        transferIn: n(r.transferIn), transferOut: n(r.transferOut),
        adjustmentIn: n(r.adjustmentIn), adjustmentOut: n(r.adjustmentOut),
        openingQty: n(r.openingQty),
      });
    }

    // ── 6. Last production date + last movement date (grouped) ───────────────
    const lastProdMap = new Map<string, string>();
    const prodQb = this.entryRepo.createQueryBuilder('pe')
      .select('pe.itemId AS "itemId"')
      .addSelect('MAX(pe.entryDate) AS "lastDate"')
      .where('pe.companyId = :companyId', { companyId })
      .andWhere('pe.itemId IN (:...itemIds)', { itemIds })
      .andWhere('pe.isActive = true');
    if (dateFrom) prodQb.andWhere('pe.entryDate >= :dateFrom', { dateFrom: filter.dateFrom });
    if (dateTo) prodQb.andWhere('pe.entryDate <= :dateTo', { dateTo: filter.dateTo });
    prodQb.groupBy('pe.itemId');
    for (const r of await prodQb.getRawMany()) lastProdMap.set(r.itemId, r.lastDate);

    const lastMovMap = new Map<string, string>();
    const movQb = this.ledgerRepo.createQueryBuilder('ledger')
      .select('ledger.itemId AS "itemId"')
      .addSelect('MAX(ledger.transactionDate) AS "lastDate"')
      .where('ledger.companyId = :companyId', { companyId })
      .andWhere('ledger.itemId IN (:...itemIds)', { itemIds })
      .andWhere('ledger.warehouseId IN (:...wipWhIds)', { wipWhIds });
    if (filter.locationId) movQb.andWhere('ledger.locationId = :locationId', { locationId: filter.locationId });
    if (dateFrom) movQb.andWhere('ledger.transactionDate >= :dateFrom', { dateFrom });
    if (dateTo) movQb.andWhere('ledger.transactionDate <= :dateTo', { dateTo });
    movQb.groupBy('ledger.itemId');
    for (const r of await movQb.getRawMany()) lastMovMap.set(r.itemId, r.lastDate);

    // ── 7. Build rows ────────────────────────────────────────────────────────
    const rows: any[] = [];
    const deptSet = new Set<string>();
    const itemCountSet = new Set<string>();
    const whSet = new Set<string>();
    let totalWip = 0;

    for (const bal of usableBalances) {
      const item = itemMap.get(bal.itemId);
      if (!item) continue;
      const producer = producerOf.get(item.id) ?? null;
      if (processFilterIds.size > 0 && !(producer && processFilterIds.has(producer.id))) continue;

      const locKey = `${bal.itemId}|${bal.warehouseId}|${bal.locationId ?? ''}`;
      const openingWip = openingMap.get(locKey) ?? null;
      const netThroughDateTo = netThroughDateToMap.get(locKey) ?? 0;
      const inRange = inRangeMap.get(locKey) ?? {
        produced: 0, consumed: 0, scrap: 0, transferIn: 0, transferOut: 0,
        adjustmentIn: 0, adjustmentOut: 0, openingQty: 0,
      };
      // Closing WIP derived from ledger: opening + all balance-affecting movements in range
      const closingWip = openingWip !== null
        ? r4(netThroughDateToMap.get(locKey) ?? 0)
        : null;
      const onHand = n(bal.onHand);
      // Reconciliation: current on-hand vs all-time balance-affecting ledger net
      const ledgerBalance = r4(netThroughDateTo);
      const difference = r4(onHand - ledgerBalance);
      const reconciliation = {
        inventoryBalance: onHand,
        ledgerBalance,
        difference,
        status: Math.abs(difference) < 0.005 ? 'RECONCILED' : 'MISMATCH',
      };

      const prevOp = producer ? producerOf.get(producer.inputItemId ?? '') ?? null : null;
      const nextOp = consumerOf.get(item.id) ?? null;

      totalWip += onHand;
      itemCountSet.add(item.id);
      whSet.add(bal.warehouseId);
      if (item.departmentId) deptSet.add(item.departmentId);

      rows.push({
        division: item.division ? { id: item.division.id, name: item.division.name } : null,
        section: item.section ? { id: item.section.id, name: item.section.name } : null,
        department: item.department ? { id: item.department.id, name: item.department.name } : null,
        process: producer ? { id: producer.id, operationCode: producer.operationCode, operationName: producer.operationName, sequenceNo: producer.sequenceNo, department: producer.department ? { id: producer.department.id, name: producer.department.name } : null } : null,
        previousItem: producer?.inputItem ? { id: producer.inputItem.id, itemCode: producer.inputItem.itemCode, name: producer.inputItem.name } : null,
        previousProcess: prevOp ? { id: prevOp.id, operationCode: prevOp.operationCode, operationName: prevOp.operationName } : null,
        nextItem: nextOp?.outputItem ? { id: nextOp.outputItem.id, itemCode: nextOp.outputItem.itemCode, name: nextOp.outputItem.name } : null,
        nextProcess: nextOp ? { id: nextOp.id, operationCode: nextOp.operationCode, operationName: nextOp.operationName } : null,
        item: {
          id: item.id, itemCode: item.itemCode, name: item.name, itemType: item.itemType,
          wireSizeMm: item.wireSizeMm, thicknessMm: item.thicknessMm, widthMm: item.widthMm,
        },
        uom: bal.uom ? { id: bal.uom.id, code: bal.uom.code, name: bal.uom.name } : null,
        warehouse: bal.warehouse ? { id: bal.warehouse.id, warehouseCode: bal.warehouse.warehouseCode, name: bal.warehouse.name } : null,
        location: bal.location ? { id: bal.location.id, locationCode: bal.location.locationCode, name: bal.location.name } : null,
        onHand, reserved: n(bal.reserved), available: n(bal.available),
        wipQuantity: onHand,
        produced: inRange.produced, consumed: inRange.consumed, scrap: inRange.scrap,
        transferIn: inRange.transferIn, transferOut: inRange.transferOut,
        adjustmentIn: inRange.adjustmentIn, adjustmentOut: inRange.adjustmentOut,
        openingWip, closingWip,
        lastProductionDate: lastProdMap.get(item.id) ?? null,
        lastMovementDate: lastMovMap.get(item.id) ?? null,
        reconciliation,
      });
    }

    // Sort: division → section → department → item code → warehouse
    rows.sort((a, b) => {
      const cmp = (a.division?.name ?? '').localeCompare(b.division?.name ?? '');
      if (cmp) return cmp;
      const cmp2 = (a.section?.name ?? '').localeCompare(b.section?.name ?? '');
      if (cmp2) return cmp2;
      const cmp3 = (a.department?.name ?? '').localeCompare(b.department?.name ?? '');
      if (cmp3) return cmp3;
      return (a.item?.itemCode ?? '').localeCompare(b.item?.itemCode ?? '');
    });

    const summary = {
      totalWipQuantity: r4(totalWip),
      wipItemCount: itemCountSet.size,
      wipWarehouseCount: whSet.size,
      departmentCount: deptSet.size,
      activeRecordCount: rows.length,
    };

    return { summary, data: rows, context: { ...context2, wipStockRecordsFound: rows.length } };
  }

  // ─── Department-Wise Inventory ─────────────────────────────────────────

  async getDepartmentWise(companyId: string, filter: TraceabilityQueryDto): Promise<{ data: any[] }> {
    const dateFrom = filter.dateFrom ? new Date(`${filter.dateFrom}T00:00:00.000Z`) : null;
    const dateTo = filter.dateTo ? new Date(`${filter.dateTo}T23:59:59.999Z`) : null;

    // Balances joined with item and warehouse
    const balQb = this.balanceRepo.createQueryBuilder('b')
      .leftJoinAndSelect('b.item', 'item')
      .leftJoinAndSelect('b.warehouse', 'warehouse')
      .leftJoinAndSelect('b.uom', 'uom')
      .where('b.companyId = :companyId', { companyId })
      .andWhere('b.onHand > 0');
    if (filter.itemId) balQb.andWhere('b.itemId = :itemId', { itemId: filter.itemId });
    if (filter.warehouseId) balQb.andWhere('b.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
    if (filter.uomId) balQb.andWhere('b.uomId = :uomId', { uomId: filter.uomId });
    const balances = await balQb.getMany();
    if (!balances.length) return { data: [] };

    // Load org info for items that have division/section/department
    const itemIds = [...new Set(balances.map((b) => b.itemId))];
    const items = await this.itemRepo.find({ where: { id: In(itemIds) }, relations: ['division', 'section', 'department'] });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    // Apply item-level filters
    const filtered = balances.filter((b) => {
      const item = itemMap.get(b.itemId);
      if (!item) return false;
      if (filter.divisionId && item.divisionId !== filter.divisionId) return false;
      if (filter.sectionId && item.sectionId !== filter.sectionId) return false;
      if (filter.departmentId && item.departmentId !== filter.departmentId) return false;
      if (filter.itemType && item.itemType !== filter.itemType) return false;
      return true;
    });

    // Aggregate produced/consumed/scrap from ledger per item within date range
    const prodConsScrapQb = this.ledgerRepo.createQueryBuilder('ledger')
      .select('ledger.itemId AS "itemId"')
      .addSelect("COALESCE(SUM(CASE WHEN ledger.transactionType = 'PRODUCTION_RECEIPT' AND ledger.direction = 'IN' THEN ledger.quantity ELSE 0 END),0) AS \"produced\"")
      .addSelect("COALESCE(SUM(CASE WHEN ledger.transactionType IN ('PRODUCTION_CONSUMPTION','PRODUCTION_ISSUE') AND ledger.direction = 'OUT' THEN ledger.quantity ELSE 0 END),0) AS \"consumed\"")
      .addSelect("COALESCE(SUM(CASE WHEN ledger.transactionType = 'PRODUCTION_SCRAP' AND ledger.direction = 'OUT' THEN ledger.quantity ELSE 0 END),0) AS \"scrap\"")
      .where('ledger.companyId = :companyId', { companyId })
      .andWhere('ledger.itemId IN (:...itemIds)', { itemIds: [...new Set(filtered.map((b) => b.itemId))] });
    if (dateFrom) prodConsScrapQb.andWhere('ledger.transactionDate >= :dateFrom', { dateFrom });
    if (dateTo) prodConsScrapQb.andWhere('ledger.transactionDate <= :dateTo', { dateTo });
    prodConsScrapQb.groupBy('ledger.itemId');
    const prodConsScrapRows = await prodConsScrapQb.getRawMany();
    const pcsMap = new Map(prodConsScrapRows.map((r) => [r.itemId, { produced: n(r.produced), consumed: n(r.consumed), scrap: n(r.scrap) }]));

    const rows: any[] = [];
    for (const bal of filtered) {
      const item = itemMap.get(bal.itemId);
      if (!item) continue;
      const pcs = pcsMap.get(bal.itemId) || { produced: 0, consumed: 0, scrap: 0 };
      const div = item.division;
      const sec = item.section;
      const dept = item.department;
      rows.push({
        division: div ? { id: div.id, name: div.name } : null,
        section: sec ? { id: sec.id, name: sec.name } : null,
        department: dept ? { id: dept.id, name: dept.name } : null,
        item: { id: item.id, itemCode: item.itemCode, name: item.name, itemType: item.itemType, wireSizeMm: item.wireSizeMm, thicknessMm: item.thicknessMm, widthMm: item.widthMm },
        uom: bal.uom ? { id: bal.uom.id, code: bal.uom.code, name: bal.uom.name } : null,
        warehouse: bal.warehouse ? { id: bal.warehouse.id, warehouseCode: bal.warehouse.warehouseCode, name: bal.warehouse.name } : null,
        onHand: n(bal.onHand), reserved: n(bal.reserved), available: n(bal.available),
        produced: pcs.produced, consumed: pcs.consumed, scrap: pcs.scrap,
      });
    }

    // Sort by division → section → department → item
    rows.sort((a, b) => {
      const cmp = (a.division?.name ?? '').localeCompare(b.division?.name ?? '');
      if (cmp) return cmp;
      const cmp2 = (a.section?.name ?? '').localeCompare(b.section?.name ?? '');
      if (cmp2) return cmp2;
      const cmp3 = (a.department?.name ?? '').localeCompare(b.department?.name ?? '');
      if (cmp3) return cmp3;
      return (a.item?.itemCode ?? '').localeCompare(b.item?.itemCode ?? '');
    });

    return { data: rows };
  }
}