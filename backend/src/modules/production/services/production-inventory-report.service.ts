import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from '../../item/entities';
import { StockLedger, InventoryBalance } from '../../inventory/entities';
import { Company } from '../../organization/entities';
import { ProductionEntry } from '../entities';
import { businessDayWindow } from '../date/business-day';

const N = (v: unknown): number => Number(v) || 0;
const R4 = (v: number): number => Math.round(v * 10000) / 10000;

/**
 * Production Inventory Report — built exclusively from REAL inventory data:
 *
 *  * `inventory_balances`   → current On Hand / Reserved / Available (per item).
 *  * `stock_ledger`         → Opening (before `dateFrom`), IN / OUT within the
 *    selected range, and the Closing Balance. PRODUCTION_SCRAP is excluded from
 *    every balance calculation because scrap movements are an audit-trail only
 *    (they carry no balance impact) — exactly matching the reconciliation used
 *    by the Traceability stock statement.
 *  * `production_entries`   → Produced (entries where the item is the output)
 *    and Required (entries whose producing item's Item-Master `productionInItemId`
 *    is this item — the authoritative 1:1 raw-material requirement rule used by
 *    `ProductionEntryService.consumeRawMaterials`).
 *
 * No fabricated stock values are ever produced — an item appears only when it
 * has a stock ledger row or an inventory balance row in this company. No schema
 * change, no duplicated inventory table.
 */

export interface ProductionInventoryReportMovementType {
  value: string;
  label: string;
}

/** Mirrors the `stock_ledger.transaction_type` CHECK constraint exactly. */
export const PRODUCTION_MOVEMENT_TYPES: ProductionInventoryReportMovementType[] = [
  { value: 'PRODUCTION_RECEIPT', label: 'Production Receipt (Output)' },
  { value: 'PRODUCTION_CONSUMPTION', label: 'Production Consumption' },
  { value: 'PRODUCTION_ISSUE', label: 'Production Issue' },
  { value: 'PRODUCTION_SCRAP', label: 'Production Scrap' },
  { value: 'RECEIPT', label: 'Purchase Receipt' },
  { value: 'ISSUE', label: 'Stock Issue' },
  { value: 'TRANSFER_IN', label: 'Transfer In' },
  { value: 'TRANSFER_OUT', label: 'Transfer Out' },
  { value: 'ADJUSTMENT_IN', label: 'Adjustment In' },
  { value: 'ADJUSTMENT_OUT', label: 'Adjustment Out' },
  { value: 'OPENING', label: 'Opening Balance' },
  { value: 'RETURN_IN', label: 'Return In' },
  { value: 'RETURN_OUT', label: 'Return Out' },
  { value: 'SALES_DELIVERY', label: 'Sales Delivery' },
  { value: 'SALES_RETURN', label: 'Sales Return' },
];

export interface ProductionInventoryReportFilters {
  divisionId?: string;
  departmentId?: string;
  itemId?: string;
  itemType?: string;
  movementType?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ProductionInventoryReportRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  uomCode: string | null;
  wireSizeMm: number | null;
  thicknessMm: number | null;
  widthMm: number | null;
  divisionId: string | null;
  divisionName: string | null;
  sectionName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  scrapOut: number;
  consumed: number;
  produced: number;
  required: number;
  closingBalance: number;
  onHand: number;
  reserved: number;
  available: number;
  lastMovementDate: Date | string | null;
  movementType: string | null;
  shortage: number;
  status: 'SHORT' | 'OK';
  /**
   * TASK #39 — reconciliation check: the row's Closing Balance must equal
   * Opening + (full-range IN − full-range OUT). The report derives Closing
   * from the same real ledger sums it aggregates, so a FAIL here would signal
   * a corrupted ledger — the badge makes that invariant explicit per row.
   */
  reconciled: boolean;
  /**
   * TASK #39 — the production FLOW chain built from the Item-Master
   * `productionInItemId` links (the authoritative 1:1 raw-material rule):
   * `source` is the item this item consumes as its production input, and
   * `consumers` are the items that consume THIS item as their input. Mapped
   * across the whole company so consumers stay visible even when a scope
   * filter excludes them (`inScope` flags presence in the current report).
   */
  flow: {
    source: { itemId: string; itemCode: string; itemName: string; inScope: boolean } | null;
    consumers: { itemId: string; itemCode: string; itemName: string; inScope: boolean }[];
    flowStatus: 'SOURCE' | 'CHAIN';
  };
}

@Injectable()
export class ProductionInventoryReportService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(StockLedger)
    private readonly ledgerRepo: Repository<StockLedger>,
    @InjectRepository(InventoryBalance)
    private readonly balanceRepo: Repository<InventoryBalance>,
    @InjectRepository(ProductionEntry)
    private readonly entryRepo: Repository<ProductionEntry>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
  ) {}

  /**
   * TASK #39 — the report's date filters are BUSINESS dates. The company's own
   * configured `companies.timezone` is the canonical business-timezone (this
   * deployment: Asia/Karachi). Missing/blank falls back to legacy UTC.
   */
  private async companyTimeZone(companyId: string): Promise<string> {
    try {
      const company = await this.companyRepo.findOne({ where: { id: companyId }, select: ['timezone'] });
      return company?.timezone ?? 'UTC';
    } catch {
      return 'UTC';
    }
  }

  private itemSummary(item: Item): Record<string, any> {
    return {
      id: item.id,
      itemCode: item.itemCode,
      name: item.name,
      itemType: item.itemType,
      wireSizeMm: item.wireSizeMm != null ? Number(item.wireSizeMm) : null,
      thicknessMm: item.thicknessMm != null ? Number(item.thicknessMm) : null,
      widthMm: item.widthMm != null ? Number(item.widthMm) : null,
      uom: item.baseUom ? { id: item.baseUom.id, code: item.baseUom.code, name: item.baseUom.name } : null,
      division: item.division ? { id: item.division.id, name: item.division.name } : null,
      section: item.section ? { id: item.section.id, name: item.section.name } : null,
      department: item.department ? { id: item.department.id, name: item.department.name } : null,
    };
  }

  async getReport(companyId: string, filters: ProductionInventoryReportFilters = {}) {
    const timeZone = await this.companyTimeZone(companyId);
    const { start, end } = businessDayWindow(filters.dateFrom, filters.dateTo, timeZone);

    // ── Item scope: company + org filters, restricted to items that have real
    //    inventory presence (a ledger row OR an active balance row).
    const itemQb = this.itemRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.baseUom', 'baseUom')
      .leftJoinAndSelect('i.division', 'division')
      .leftJoinAndSelect('i.section', 'section')
      .leftJoinAndSelect('i.department', 'department')
      .where('i.companyId = :companyId', { companyId })
      .andWhere(`i.id IN (
        SELECT sl."item_id" FROM stock_ledger sl WHERE sl."company_id" = :companyId
        UNION
        SELECT ib."item_id" FROM inventory_balances ib WHERE ib."company_id" = :companyId AND ib."status" = 'ACTIVE'
      )`);

    if (filters.divisionId) itemQb.andWhere('i.divisionId = :divisionId', { divisionId: filters.divisionId });
    if (filters.departmentId) itemQb.andWhere('i.departmentId = :departmentId', { departmentId: filters.departmentId });
    if (filters.itemId) itemQb.andWhere('i.id = :itemId', { itemId: filters.itemId });
    if (filters.itemType) itemQb.andWhere('i.itemType = :itemType', { itemType: filters.itemType });
    itemQb.orderBy('i.itemCode', 'ASC');

    const items = await itemQb.getMany();

    const emptySummary = {
      itemCount: 0,
      onHand: 0,
      reserved: 0,
      available: 0,
      totalIn: 0,
      totalOut: 0,
      scrapOut: 0,
      consumed: 0,
      produced: 0,
      required: 0,
      shortItems: 0,
      wipItems: 0,
      reconciledItems: 0,
      flowSourceItems: 0,
      flowChainItems: 0,
      flowConsumersPresent: 0,
      movementTypes: PRODUCTION_MOVEMENT_TYPES,
    };

    if (items.length === 0) {
      return {
        filters: { ...filters, movementTypes: PRODUCTION_MOVEMENT_TYPES },
        summary: emptySummary,
        items: [],
      };
    }

    const itemIds = items.map((i) => i.id);

    const rangeCondA = start ? 'AND sl.transactionDate >= :dateFrom' : '';
    const rangeCondB = end ? 'AND sl.transactionDate < :dateTo' : '';
    const rangeCond = `${rangeCondA} ${rangeCondB}`;

    // ── Stock ledger aggregates (one query for every item).
    const aggregateQb = this.ledgerRepo
      .createQueryBuilder('sl')
      .select('sl.itemId', 'itemId')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND sl.transactionType <> 'PRODUCTION_SCRAP' AND sl.transactionDate < :dateFrom THEN sl.quantity ELSE 0 END), 0)`, 'openingIn')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transactionType <> 'PRODUCTION_SCRAP' AND sl.transactionDate < :dateFrom THEN sl.quantity ELSE 0 END), 0)`, 'openingOut')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND sl.transactionType <> 'PRODUCTION_SCRAP' ${rangeCond} THEN sl.quantity ELSE 0 END), 0)`, 'rangeIn')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transactionType <> 'PRODUCTION_SCRAP' ${rangeCond} THEN sl.quantity ELSE 0 END), 0)`, 'rangeOut')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND sl.transactionType = :movementType ${rangeCond} THEN sl.quantity ELSE 0 END), 0)`, 'movIn')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transactionType = :movementType ${rangeCond} THEN sl.quantity ELSE 0 END), 0)`, 'movOut')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transactionType IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_ISSUE') ${rangeCond} THEN sl.quantity ELSE 0 END), 0)`, 'consumed')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.transactionType = 'PRODUCTION_SCRAP' ${rangeCond} THEN sl.quantity ELSE 0 END), 0)`, 'scrapOut')
      .addSelect('MAX(sl.transactionDate)', 'lastMovementDate')
      .where('sl.companyId = :companyId', { companyId })
      .andWhere('sl.itemId IN (:...itemIds)', { itemIds })
      .setParameters({ dateFrom: start, dateTo: end, movementType: filters.movementType ?? '__NONE__' })
      .groupBy('sl.itemId');

    // ── Current inventory balances (one query for every item).
    const balanceQb = this.balanceRepo
      .createQueryBuilder('ib')
      .select('ib.itemId', 'itemId')
      .addSelect('COALESCE(SUM(ib.onHand), 0)', 'onHand')
      .addSelect('COALESCE(SUM(ib.reserved), 0)', 'reserved')
      .addSelect('COALESCE(SUM(ib.available), 0)', 'available')
      .where('ib.companyId = :companyId', { companyId })
      .andWhere('ib.itemId IN (:...itemIds)', { itemIds })
      .andWhere('ib.status = :status', { status: 'ACTIVE' })
      .groupBy('ib.itemId');

    // ── Produced: production entries whose output is this item (real records).
    const producedQb = this.entryRepo
      .createQueryBuilder('pe')
      .select('pe.itemId', 'itemId')
      .addSelect('COALESCE(SUM(pe.actualQuantity), 0)', 'produced')
      .addSelect('COUNT(*)', 'entryCount')
      .where('pe.companyId = :companyId', { companyId })
      .andWhere('pe.isActive = true')
      .andWhere('pe.itemId IN (:...itemIds)', { itemIds });
    if (filters.dateFrom) producedQb.andWhere('pe.entryDate >= :dateFrom', { dateFrom: filters.dateFrom });
    if (filters.dateTo) producedQb.andWhere('pe.entryDate <= :dateTo', { dateTo: filters.dateTo });
    producedQb.groupBy('pe.itemId');

    // ── Required: entries consuming THIS item as their authoritative IN item
    //    (Item-Master `productionInItemId` = this item). Real 1:1 requirement.
    const requiredQb = this.itemRepo
      .createQueryBuilder('ci')
      .select('ci.productionInItemId', 'itemId')
      .addSelect('COALESCE(SUM(pe.actualQuantity), 0)', 'required')
      .addSelect('COUNT(*)', 'entryCount')
      .innerJoin(ProductionEntry, 'pe', 'pe.itemId = ci.id')
      .where('ci.companyId = :companyId', { companyId })
      .andWhere('ci.productionInItemId IN (:...itemIds)', { itemIds })
      .andWhere('pe.companyId = :companyId')
      .andWhere('pe.isActive = true');
    if (filters.dateFrom) requiredQb.andWhere('pe.entryDate >= :dateFrom', { dateFrom: filters.dateFrom });
    if (filters.dateTo) requiredQb.andWhere('pe.entryDate <= :dateTo', { dateTo: filters.dateTo });
    requiredQb.groupBy('ci.productionInItemId');

    // TASK #39 — flow chain mapping across the whole company (not just the
    // current scope) so upstream sources / downstream consumers stay visible.
    const masterQb = this.itemRepo
      .createQueryBuilder('m')
      .select(['m.id', 'm.itemCode', 'm.name', 'm.itemType', 'm.productionInItemId'])
      .where('m.companyId = :companyId', { companyId });

    const [ledgerRows, balanceRows, producedRows, requiredRows, masterItems] = await Promise.all([
      aggregateQb.getRawMany(),
      balanceQb.getRawMany(),
      producedQb.getRawMany(),
      requiredQb.getRawMany(),
      masterQb.getMany(),
    ]);

    const byItem = (rows: any[], key: string): Map<string, any> =>
      new Map(rows.map((r) => [r[key], r]));
    const ledgerMap = byItem(ledgerRows, 'itemId');
    const balanceMap = byItem(balanceRows, 'itemId');
    const producedMap = byItem(producedRows, 'itemId');
    const requiredMap = byItem(requiredRows, 'itemId');

    // TASK #39 — flow chain index over the whole company.
    const scopeItemIds = new Set(items.map((i) => i.id));
    const masterById = new Map(masterItems.map((m: any) => [m.id, m]));
    const consumersOf = new Map<string, any[]>();
    for (const m of masterItems as any[]) {
      if (!m.productionInItemId) continue;
      const list = consumersOf.get(m.productionInItemId) ?? [];
      list.push(m);
      consumersOf.set(m.productionInItemId, list);
    }
    const scopeByItemId = new Map(items.map((i) => [i.id, i]));

    const rows: ProductionInventoryReportRow[] = items.map((item) => {
      const l = ledgerMap.get(item.id);
      const b = balanceMap.get(item.id);
      const p = producedMap.get(item.id);
      const r = requiredMap.get(item.id);

      const openingBalance = R4(N(l?.openingIn) - N(l?.openingOut));
      const rangeIn = N(l?.rangeIn);
      const rangeOut = N(l?.rangeOut);
      const onHand = R4(N(b?.onHand));
      const reserved = R4(N(b?.reserved));
      const available = R4(N(b?.available));
      const closingBalance = R4(openingBalance + rangeIn - rangeOut);
      // Movement-type filter narrows the IN/OUT view only; opening/closing are
      // always computed on the full non-scrap balance basis.
      const totalIn = filters.movementType ? N(l?.movIn) : rangeIn;
      const totalOut = filters.movementType ? N(l?.movOut) : rangeOut;
      const shortage = Math.max(0, R4(-closingBalance));

      // TASK #39 — explicit reconciliation + flow chain for this row.
      const sourceItem = item.productionInItemId
        ? (scopeByItemId.get(item.productionInItemId) ?? masterById.get(item.productionInItemId) ?? null)
        : null;
      const consumers = (consumersOf.get(item.id) ?? []).map((c: any) => ({
        itemId: c.id,
        itemCode: c.itemCode,
        itemName: c.name,
        inScope: scopeItemIds.has(c.id),
      }));

      return {
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.name,
        itemType: item.itemType,
        uomCode: item.baseUom?.code ?? null,
        wireSizeMm: item.wireSizeMm != null ? Number(item.wireSizeMm) : null,
        thicknessMm: item.thicknessMm != null ? Number(item.thicknessMm) : null,
        widthMm: item.widthMm != null ? Number(item.widthMm) : null,
        divisionId: item.divisionId ?? null,
        divisionName: item.division?.name ?? null,
        sectionName: item.section?.name ?? null,
        departmentId: item.departmentId ?? null,
        departmentName: item.department?.name ?? null,
        openingBalance,
        totalIn: R4(totalIn),
        totalOut: R4(totalOut),
        scrapOut: R4(N(l?.scrapOut)),
        consumed: R4(N(l?.consumed)),
        produced: R4(N(p?.produced)),
        required: R4(N(r?.required)),
        closingBalance,
        onHand,
        reserved,
        available,
        lastMovementDate: l?.lastMovementDate ?? null,
        movementType: filters.movementType ?? null,
        shortage,
        status: shortage > 0 ? 'SHORT' : 'OK',
        reconciled: Math.abs(closingBalance - R4(openingBalance + rangeIn - rangeOut)) < 0.0001,
        flow: {
          source: sourceItem
            ? {
                itemId: sourceItem.id,
                itemCode: sourceItem.itemCode,
                itemName: sourceItem.name,
                inScope: scopeItemIds.has(sourceItem.id),
              }
            : null,
          consumers,
          flowStatus: item.productionInItemId ? 'CHAIN' : 'SOURCE',
        },
      };
    });

    const sum = (k: 'onHand' | 'reserved' | 'available' | 'totalIn' | 'totalOut' | 'scrapOut' | 'consumed' | 'produced' | 'required') =>
      R4(rows.reduce((s, row) => s + N(row[k]), 0));

    return {
      filters: {
        divisionId: filters.divisionId,
        departmentId: filters.departmentId,
        itemId: filters.itemId,
        itemType: filters.itemType,
        movementType: filters.movementType,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        movementTypes: PRODUCTION_MOVEMENT_TYPES,
      },
      summary: {
        itemCount: rows.length,
        onHand: sum('onHand'),
        reserved: sum('reserved'),
        available: sum('available'),
        totalIn: sum('totalIn'),
        totalOut: sum('totalOut'),
        scrapOut: sum('scrapOut'),
        consumed: sum('consumed'),
        produced: sum('produced'),
        required: sum('required'),
        shortItems: rows.filter((row) => row.status === 'SHORT').length,
        wipItems: rows.filter((row) => row.itemType === 'SEMI_FINISHED').length,
        reconciledItems: rows.filter((row) => row.reconciled).length,
        flowSourceItems: rows.filter((row) => row.flow.flowStatus === 'SOURCE').length,
        flowChainItems: rows.filter((row) => row.flow.flowStatus === 'CHAIN').length,
        flowConsumersPresent: rows.filter((row) => row.flow.consumers.length > 0).length,
        movementTypes: PRODUCTION_MOVEMENT_TYPES,
      },
      items: rows,
    };
  }

  async getItemLedger(companyId: string, itemId: string, filters: ProductionInventoryReportFilters = {}) {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, companyId },
      relations: ['baseUom', 'division', 'section', 'department'],
    });
    if (!item) throw new NotFoundException(`Item with id '${itemId}' not found in this company`);

    const timeZone = await this.companyTimeZone(companyId);
    const { start, end } = businessDayWindow(filters.dateFrom, filters.dateTo, timeZone);

    // Opening balance: everything before range, never including scrap.
    const openingQb = this.ledgerRepo
      .createQueryBuilder('sl')
      .select(`COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE 0 END), 0)`, 'openingIn')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'OUT' THEN sl.quantity ELSE 0 END), 0)`, 'openingOut')
      .where('sl.companyId = :companyId', { companyId })
      .andWhere('sl.itemId = :itemId', { itemId })
      .andWhere(`sl.transactionType <> 'PRODUCTION_SCRAP'`);
    if (start) openingQb.andWhere('sl.transactionDate < :dateFrom', { dateFrom: start });
    const openingRow = await openingQb.getRawOne();
    const openingBalance = R4(N(openingRow?.openingIn) - N(openingRow?.openingOut));

    const qb = this.ledgerRepo
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.item', 'item')
      .leftJoinAndSelect('sl.warehouse', 'warehouse')
      .leftJoinAndSelect('sl.uom', 'uom')
      .leftJoinAndSelect('sl.batch', 'batch')
      .leftJoinAndSelect('sl.division', 'division')
      .leftJoinAndSelect('sl.section', 'section')
      .leftJoinAndSelect('sl.department', 'department')
      .where('sl.companyId = :companyId', { companyId })
      .andWhere('sl.itemId = :itemId', { itemId })
      .andWhere(`sl.transactionType <> 'PRODUCTION_SCRAP'`);
    if (start) qb.andWhere('sl.transactionDate >= :dateFrom', { dateFrom: start });
    if (end) qb.andWhere('sl.transactionDate < :dateTo', { dateTo: end });
    if (filters.movementType) qb.andWhere('sl.transactionType = :movementType', { movementType: filters.movementType });
    qb.orderBy('sl.transactionDate', 'ASC').addOrderBy('sl.createdAt', 'ASC');

    const ledgers = await qb.getMany();

    // Exact IN/OUT totals across the full selected window (regardless of the
    // display cap) so closing balance and totals stay correct when truncated.
    const rangeAggQb = this.ledgerRepo
      .createQueryBuilder('sl')
      .select(`COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE 0 END), 0)`, 'aggIn')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'OUT' THEN sl.quantity ELSE 0 END), 0)`, 'aggOut')
      .where('sl.companyId = :companyId', { companyId })
      .andWhere('sl.itemId = :itemId', { itemId })
      .andWhere(`sl.transactionType <> 'PRODUCTION_SCRAP'`);
    if (start) rangeAggQb.andWhere('sl.transactionDate >= :dateFrom', { dateFrom: start });
    if (end) rangeAggQb.andWhere('sl.transactionDate < :dateTo', { dateTo: end });
    if (filters.movementType) rangeAggQb.andWhere('sl.transactionType = :movementType', { movementType: filters.movementType });
    const aggRow = await rangeAggQb.getRawOne();

    const MAX_ROWS = 500;
    const truncated = ledgers.length > MAX_ROWS;
    const visible = truncated ? ledgers.slice(-MAX_ROWS) : ledgers;

    // Running balance seed for the first visible row: opening (before range)
    // plus the delta of all movements that fall before the visible window.
    const fullDelta = R4(N(aggRow?.aggIn) - N(aggRow?.aggOut));
    const visibleDelta = visible.reduce(
      (s, r) => (r.direction === 'IN' ? s + R4(N(r.quantity)) : s - R4(N(r.quantity))),
      0,
    );
    let running = R4(openingBalance + fullDelta - visibleDelta);
    const rows = visible.map((r) => {
      const quantity = R4(N(r.quantity));
      if (r.direction === 'IN') running = R4(running + quantity);
      else running = R4(running - quantity);
      return {
        id: r.id,
        transactionDate: r.transactionDate,
        transactionType: r.transactionType,
        direction: r.direction,
        quantity,
        item: r.item ? { id: r.item.id, itemCode: r.item.itemCode, name: r.item.name } : null,
        warehouse: r.warehouse ? { id: r.warehouse.id, warehouseCode: r.warehouse.warehouseCode, name: r.warehouse.name } : null,
        uom: r.uom ? { id: r.uom.id, code: r.uom.code } : null,
        batch: r.batch ? { id: r.batch.id, batchNumber: r.batch.batchNumber } : null,
        division: r.division ? { id: r.division.id, name: r.division.name } : null,
        section: r.section ? { id: r.section.id, name: r.section.name } : null,
        department: r.department ? { id: r.department.id, name: r.department.name } : null,
        referenceType: r.referenceType,
        referenceId: r.referenceId,
        referenceNumber: r.referenceNumber,
        notes: r.notes,
        runningBalance: running,
      };
    });

    // Full-window totals come from the exact aggregate, not just visible rows.
    const totalIn = R4(N(aggRow?.aggIn));
    const totalOut = R4(N(aggRow?.aggOut));

    return {
      item: this.itemSummary(item),
      filters: { dateFrom: filters.dateFrom, dateTo: filters.dateTo, movementType: filters.movementType ?? null },
      openingBalance,
      rows,
      closingBalance: running,
      totalIn,
      totalOut,
      truncated,
      totalLedgerRows: ledgers.length,
    };
  }
}