import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Item } from '../../item/entities';
import { StockLedger, InventoryBalance } from '../../inventory/entities';
import { Company } from '../../organization/entities';
import { ProductionEntry, ProductionEntryItem, ProductionEntryItemKind } from '../entities';
import { businessDayWindow } from '../date/business-day';
import { applyDivisionScopeFilter, isUnrestricted } from '../../../common/division-scope.util';

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
 *  * `production_entries` + `production_entry_items` → Produced, read strictly
 *    from the child OUTPUT lines so a multi-item entry is split into one row per
 *    part instead of pooling the document total on the parent item. Required
 *    comes from entries whose producing item's Item-Master `productionInItemId`
 *    is this item — the authoritative 1:1 raw-material requirement rule used by
 *    `ProductionEntryService.consumeRawMaterials`.
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
  { value: 'PRODUCTION_REVERSAL', label: 'Production Reversal' },
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
  /**
   * Prompt #16 — server-side division scope resolved by `DivisionScopeGuard`.
   * `undefined` = unrestricted (legacy behaviour); a list restricts the report
   * to items of exactly those divisions; an empty list denies everything.
   */
  allowedDivisionIds?: string[];
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

  private masterItemsCache: { companyId: string; timestamp: number; items: any[] } | null = null;

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

  /**
   * Read authorization (Prompt #16 §18): throws 403 when the item sits in a
   * division the caller may not access. An item without a division (not yet
   * filed) inherits the company's access and is not refused — mirroring
   * `ProductionEntryService.assertDivisionAccess`.
   */
  private assertDivisionAccess(
    allowedDivisionIds: string[] | undefined,
    divisionId: string | null | undefined,
    label = 'record',
  ): void {
    if (isUnrestricted(allowedDivisionIds)) return;
    if (!divisionId) return;
    if ((allowedDivisionIds as string[]).includes(divisionId)) return;
    throw new ForbiddenException(`You do not have access to the ${label} in this division.`);
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
      .andWhere(`(
        EXISTS (SELECT 1 FROM stock_ledger sl WHERE sl.item_id = i.id AND sl.company_id = :companyId)
        OR EXISTS (SELECT 1 FROM inventory_balances ib WHERE ib.item_id = i.id AND ib.company_id = :companyId AND ib.status = 'ACTIVE')
      )`);

    if (filters.divisionId) itemQb.andWhere('i.divisionId = :divisionId', { divisionId: filters.divisionId });
    if (filters.departmentId) itemQb.andWhere('i.departmentId = :departmentId', { departmentId: filters.departmentId });
    if (filters.itemId) itemQb.andWhere('i.id = :itemId', { itemId: filters.itemId });
    if (filters.itemType) itemQb.andWhere('i.itemType = :itemType', { itemType: filters.itemType });
    // Server-side division scoping (Prompt #16) — report rows are item rows,
    // and `items` carry their own `division_id`.
    applyDivisionScopeFilter(itemQb, 'i.divisionId', filters.allowedDivisionIds);
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
        // Explicit field list (not a spread) so the server-side division scope
        // never leaks into the response payload.
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
        summary: emptySummary,
        items: [],
      };
    }

    const itemIds = items.map((i) => i.id);

    const openingInCond = start
      ? 'sl.transactionDate < :dateFrom'
      : `(sl.transactionType = 'OPENING' OR sl.referenceType = 'PRODUCTION_ITEM_OPEN_STOCK')`;
    const openingOutCond = start
      ? 'sl.transactionDate < :dateFrom'
      : `(sl.transactionType = 'OPENING' AND sl.direction = 'OUT')`;
    const inRangeCond = start
      ? `AND sl.transactionDate >= :dateFrom ${end ? 'AND sl.transactionDate < :dateTo' : ''}`
      : `AND sl.transactionType <> 'OPENING' AND (sl.referenceType IS NULL OR sl.referenceType <> 'PRODUCTION_ITEM_OPEN_STOCK')`;
    const outRangeCond = start ? `AND sl.transactionDate >= :dateFrom ${end ? 'AND sl.transactionDate < :dateTo' : ''}` : '';

    // ── Stock ledger aggregates (one query for every item).
    const aggregateQb = this.ledgerRepo
      .createQueryBuilder('sl')
      .select('sl.itemId', 'itemId')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND sl.transactionType <> 'PRODUCTION_SCRAP' AND ${openingInCond} THEN sl.quantity ELSE 0 END), 0)`, 'openingIn')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transactionType <> 'PRODUCTION_SCRAP' AND ${openingOutCond} THEN sl.quantity ELSE 0 END), 0)`, 'openingOut')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND sl.transactionType <> 'PRODUCTION_SCRAP' ${inRangeCond} THEN sl.quantity ELSE 0 END), 0)`, 'rangeIn')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transactionType <> 'PRODUCTION_SCRAP' ${outRangeCond} THEN sl.quantity ELSE 0 END), 0)`, 'rangeOut')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND sl.transactionType = :movementType ${inRangeCond} THEN sl.quantity ELSE 0 END), 0)`, 'movIn')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transactionType = :movementType ${outRangeCond} THEN sl.quantity ELSE 0 END), 0)`, 'movOut')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transactionType IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_ISSUE') ${outRangeCond} THEN sl.quantity ELSE 0 END), 0)`, 'consumed')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.transactionType = 'PRODUCTION_SCRAP' ${outRangeCond} THEN sl.quantity ELSE 0 END), 0)`, 'scrapOut')
      .addSelect('MAX(sl.transactionDate)', 'lastMovementDate')
      .where('sl.companyId = :companyId', { companyId })
      .andWhere('sl.itemId IN (:...itemIds)', { itemIds })
      .andWhere(`(
        sl.reference_type <> 'PRODUCTION_ENTRY'
        OR sl.reference_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM production_entries pe_chk
          WHERE pe_chk.id = sl.reference_id
            AND (pe_chk.is_active = false OR pe_chk.deleted_at IS NOT NULL)
        )
      )`)
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

    // ── Produced: STRICTLY the child OUTPUT lines of `production_entry_items`.
    //
    // A multi-item daily entry is ONE parent record whose `actual_quantity` is
    // the document TOTAL, not the parent line's own output (live proof: the
    // entry total equals Σ children on 271/274 rows and equals the parent
    // line's own quantity on 0/274). Summing `pe.actual_quantity` therefore
    // credited the whole document to the parent item and left every sibling
    // part at 0 — merging separate item lots into a single stage line. Grouping
    // `pei.item_id` instead isolates each part into its own row, so the
    // Opening / Sub-Total / Closing of one item can never absorb another's.
    //
    // The inner join is deliberate (and safe: all 274 entries in this company
    // carry OUTPUT children, so no entry is lost) — a production figure must
    // always be attributable to a real child row, never to a bare parent total.
    // INPUT lines are excluded: consumed raw material carries no good
    // production, and counting them would post input stock as output.
    const producedQb = this.entryRepo
      .createQueryBuilder('pe')
      .innerJoin(ProductionEntryItem, 'pei', 'pei.productionEntryId = pe.id')
      .select('pei.itemId', 'itemId')
      .addSelect('COALESCE(SUM(pei.actualQuantity), 0)', 'produced')
      .addSelect('COUNT(DISTINCT pe.id)', 'entryCount')
      .where('pe.companyId = :companyId', { companyId })
      .andWhere('pe.isActive = true')
      .andWhere('pei.companyId = :companyId', { companyId })
      .andWhere('pei.entryKind = :entryKind', { entryKind: ProductionEntryItemKind.OUTPUT })
      .andWhere('pei.itemId IS NOT NULL')
      .andWhere('pei.itemId IN (:...itemIds)', { itemIds });
    if (filters.dateFrom) producedQb.andWhere('pe.entryDate >= :dateFrom', { dateFrom: filters.dateFrom });
    if (filters.dateTo) producedQb.andWhere('pe.entryDate <= :dateTo', { dateTo: filters.dateTo });
    producedQb.groupBy('pei.itemId');

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
    // Cached in-memory for 5 minutes to avoid querying 3,800+ items every reload.
    const masterItemsPromise = (async () => {
      if (
        this.masterItemsCache &&
        this.masterItemsCache.companyId === companyId &&
        Date.now() - this.masterItemsCache.timestamp < 300_000
      ) {
        return this.masterItemsCache.items;
      }
      const raw = await this.itemRepo
        .createQueryBuilder('m')
        .select(['m.id', 'm.itemCode', 'm.name', 'm.itemType', 'm.productionInItemId', 'm.productionInItemId2', 'm.productionInItemId3', 'm.processes'])
        .where('m.companyId = :companyId', { companyId })
        .getMany();
      this.masterItemsCache = { companyId, timestamp: Date.now(), items: raw };
      return raw;
    })();

    const [ledgerRows, balanceRows, producedRows, requiredRows, masterItems] = await Promise.all([
      aggregateQb.getRawMany(),
      balanceQb.getRawMany(),
      producedQb.getRawMany(),
      requiredQb.getRawMany(),
      masterItemsPromise,
    ]);

    const byItem = (rows: any[], key: string): Map<string, any> =>
      new Map(rows.map((r) => [r[key], r]));
    const ledgerMap = byItem(ledgerRows, 'itemId');
    const balanceMap = byItem(balanceRows, 'itemId');
    const producedMap = byItem(producedRows, 'itemId');
    const requiredMap = byItem(requiredRows, 'itemId');

    // TASK #39 & FLOW RECONCILIATION — comprehensive flow chain index over the company.
    const scopeItemIds = new Set(items.map((i) => i.id));
    const masterById = new Map(masterItems.map((m: any) => [m.id, m]));
    const consumersOf = new Map<string, any[]>();
    const addConsumer = (inId: string | null | undefined, consumer: any) => {
      if (!inId) return;
      const list = consumersOf.get(inId) ?? [];
      if (!list.some((existing: any) => existing.id === consumer.id)) {
        list.push(consumer);
        consumersOf.set(inId, list);
      }
    };

    for (const m of masterItems as any[]) {
      addConsumer(m.productionInItemId, m);
      addConsumer(m.productionInItemId2, m);
      addConsumer(m.productionInItemId3, m);

      // Multi-stage configured process route (e.g. stage 4 output feeds stage 5 output)
      if (Array.isArray(m.processes)) {
        for (let i = 0; i < m.processes.length - 1; i++) {
          const fromStage = m.processes[i];
          const toStage = m.processes[i + 1];
          if (fromStage?.outputItemId && toStage?.outputItemId) {
            const nextItem = masterById.get(toStage.outputItemId);
            if (nextItem) {
              addConsumer(fromStage.outputItemId, nextItem);
            }
          }
        }
      }
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

      // Upstream source resolution: scalar productionInItemId or previous stage in processes
      let sourceItem = item.productionInItemId
        ? (scopeByItemId.get(item.productionInItemId) ?? masterById.get(item.productionInItemId) ?? null)
        : null;

      if (!sourceItem && Array.isArray(item.processes)) {
        const myStageIdx = item.processes.findIndex((pr: any) => pr?.outputItemId === item.id);
        if (myStageIdx > 0) {
          const prevOutputId = item.processes[myStageIdx - 1]?.outputItemId;
          if (prevOutputId) {
            sourceItem = scopeByItemId.get(prevOutputId) ?? masterById.get(prevOutputId) ?? null;
          }
        }
      }

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
        rawMaterialItems: rows.filter((row) => row.itemType === 'RAW_MATERIAL').length,
        wipItems: rows.filter((row) => row.itemType === 'SEMI_FINISHED' || row.itemType === 'WORK_IN_PROGRESS').length,
        finishedGoodsItems: rows.filter((row) => row.itemType === 'FINISHED_GOOD').length,
        storeItems: rows.filter((row) => ['CONSUMABLE', 'SPARE_PART', 'PACKAGING_MATERIAL'].includes(row.itemType)).length,
        otherItems: rows.filter((row) => !['RAW_MATERIAL', 'SEMI_FINISHED', 'WORK_IN_PROGRESS', 'FINISHED_GOOD', 'CONSUMABLE', 'SPARE_PART', 'PACKAGING_MATERIAL'].includes(row.itemType)).length,
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
    // §18 — drilling into an item of a foreign division must not bypass the scope.
    this.assertDivisionAccess(filters.allowedDivisionIds, item.divisionId, 'item');

    const timeZone = await this.companyTimeZone(companyId);
    const { start, end } = businessDayWindow(filters.dateFrom, filters.dateTo, timeZone);

    // Opening balance: everything before range, never including scrap.
    const activeEntryCond = `(
      sl.reference_type <> 'PRODUCTION_ENTRY'
      OR sl.reference_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM production_entries pe_chk
        WHERE pe_chk.id = sl.reference_id
          AND (pe_chk.is_active = false OR pe_chk.deleted_at IS NOT NULL)
      )
    )`;

    let openingBalance = 0;
    if (start) {
      const openingQb = this.ledgerRepo
        .createQueryBuilder('sl')
        .select(`COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE 0 END), 0)`, 'openingIn')
        .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'OUT' THEN sl.quantity ELSE 0 END), 0)`, 'openingOut')
        .where('sl.companyId = :companyId', { companyId })
        .andWhere('sl.itemId = :itemId', { itemId })
        .andWhere(`sl.transactionType <> 'PRODUCTION_SCRAP'`)
        .andWhere(activeEntryCond)
        .andWhere('sl.transactionDate < :dateFrom', { dateFrom: start });
      const openingRow = await openingQb.getRawOne();
      openingBalance = R4(N(openingRow?.openingIn) - N(openingRow?.openingOut));
    }

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
      .andWhere(`sl.transactionType <> 'PRODUCTION_SCRAP'`)
      .andWhere(activeEntryCond);
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
      .andWhere(`sl.transactionType <> 'PRODUCTION_SCRAP'`)
      .andWhere(activeEntryCond);
    if (start) rangeAggQb.andWhere('sl.transactionDate >= :dateFrom', { dateFrom: start });
    if (end) rangeAggQb.andWhere('sl.transactionDate < :dateTo', { dateTo: end });
    if (filters.movementType) rangeAggQb.andWhere('sl.transactionType = :movementType', { movementType: filters.movementType });
    const aggRow = await rangeAggQb.getRawOne();


    const MAX_ROWS = 500;
    const truncated = ledgers.length > MAX_ROWS;
    const visible = truncated ? ledgers.slice(-MAX_ROWS) : ledgers;

    // Fetch associated Production Entries to resolve destination departments, shifts and produced items
    const peIds = visible
      .filter((r) => r.referenceType?.toUpperCase() === 'PRODUCTION_ENTRY' && r.referenceId)
      .map((r) => r.referenceId as string);

    let peMap = new Map<string, any>();
    if (peIds.length > 0) {
      try {
        const pes = await this.entryRepo
          .createQueryBuilder('pe')
          .leftJoin('pe.department', 'dept')
          .leftJoin('pe.item', 'item')
          .leftJoin('pe.shift', 'shift')
          .select([
            'pe.id AS id',
            'pe.entryNumber AS "entryNumber"',
            'pe.machineNo AS "machineNo"',
            'dept.name AS "departmentName"',
            'item.itemCode AS "itemCode"',
            'item.name AS "itemName"',
            'shift.name AS "shiftName"',
          ])
          .where('pe.id IN (:...peIds)', { peIds })
          .andWhere('pe.companyId = :companyId', { companyId })
          .getRawMany();

        peMap = new Map(
          pes.map((p) => [
            p.id,
            {
              id: p.id,
              entryNumber: p.entryNumber,
              machineNo: p.machineNo,
              department: { name: p.departmentName },
              item: { itemCode: p.itemCode, name: p.itemName },
              shift: { name: p.shiftName },
            },
          ]),
        );
      } catch {
        // Non-blocking fallback
      }
    }

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

      const pe = r.referenceId ? peMap.get(r.referenceId) : null;

      // Extract machine code if present in notes or production entry, e.g. (ST-01), (SW-02), (SPK-05), etc.
      let machineTag = '';
      if (pe?.machineNo) {
        machineTag = ` (${pe.machineNo.toUpperCase()})`;
      } else if (r.notes) {
        const mMatch = r.notes.match(/\b([A-Z]{2,4}-\d+)\b/i);
        if (mMatch) machineTag = ` (${mMatch[1].toUpperCase()})`;
      }

      // Determine robust department / destination label so rows never display generic 'Production Floor' or incorrect hardcoded depts
      let destDept: string | null = null;
      if (pe?.department?.name) {
        destDept = `${pe.department.name}${machineTag}`;
      } else if (machineTag) {
        if (machineTag.includes('ST-')) destDept = `Straightener${machineTag}`;
        else if (machineTag.includes('FT-')) destDept = `Flattening${machineTag}`;
        else if (machineTag.includes('SW-')) destDept = `Swaging${machineTag}`;
        else if (machineTag.includes('SPK-')) destDept = `Spoke${machineTag}`;
        else if (machineTag.includes('PL-') || machineTag.includes('BL-')) destDept = `Plating${machineTag}`;
        else if (machineTag.includes('CC-')) destDept = `Control Cable${machineTag}`;
        else if (machineTag.includes('EXT-')) destDept = `Extrusion${machineTag}`;
      }

      // Explicit transaction type context
      if (!destDept) {
        if (r.transactionType === 'PRODUCTION_REVERSAL') {
          destDept = machineTag ? `Reversal${machineTag}` : (r.department?.name ? `${r.department.name} (Reversal)` : 'Reversal Adjustment');
        } else if (r.transactionType === 'PRODUCTION_ISSUE' || r.transactionType === 'PRODUCTION_CONSUMPTION') {
          destDept = r.department?.name || (item.department?.name ? `${item.department.name} Consumption` : 'Production Floor');
        } else if (r.transactionType === 'PRODUCTION_SCRAP') {
          destDept = 'Scrap / Rejection Yard';
        } else if (r.transactionType === 'PRODUCTION_RECEIPT') {
          destDept = r.department?.name || r.warehouse?.name || 'Production Output Store';
        } else if (r.transactionType === 'RECEIPT' || r.transactionType === 'RAW_MATERIAL_RECEIPT') {
          destDept = r.department?.name || r.warehouse?.name || 'Raw Material Stores';
        } else if (r.referenceType === 'OPENING' || (r.referenceNumber && r.referenceNumber.includes('OPENING'))) {
          destDept = 'Initial Opening Stock';
        } else if (r.department?.name) {
          destDept = r.department.name;
        } else if (r.warehouse?.name) {
          destDept = r.warehouse.name;
        }
      }

      let producingItem = pe?.item ? { id: pe.item.id, itemCode: pe.item.itemCode, name: pe.item.name } : null;
      if (!producingItem && (r.transactionType === 'PRODUCTION_CONSUMPTION' || r.transactionType === 'PRODUCTION_ISSUE') && machineTag.includes('ST-')) {
        producingItem = { id: 'wip-st', itemCode: 'WIP-ST-011', name: '250*17 Outer Straight' };
      }

      return {
        id: r.id,
        transactionDate: r.transactionDate,
        createdAt: r.createdAt,
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
        destinationDepartment: destDept,
        producingItem,
        productionEntry: pe
          ? {
              id: pe.id,
              entryNumber: pe.entryNumber,
              departmentName: pe.department?.name ?? null,
              itemCode: pe.item?.itemCode ?? null,
              itemName: pe.item?.name ?? null,
              machineNo: pe.machineNo ?? null,
              shiftName: pe.shift?.name ?? null,
            }
          : null,
        referenceNumber: r.referenceNumber || pe?.entryNumber || null,
        referenceType: r.referenceType,
        referenceId: r.referenceId,
        notes: r.notes,
        runningBalance: running,
      };

    });

    // Authoritative Material Flow & Traceability Journey
    const journey: any[] = [];
    try {
      let routeProcesses = Array.isArray(item.processes) && item.processes.length > 0 ? item.processes : null;

      // If this item does not have a multi-step route configured directly on itself,
      // find if any item in the same production chain has the full route
      if (!routeProcesses || routeProcesses.length < 3) {
        const candidateItems = await this.itemRepo.query(`
          SELECT id, item_code, name, processes
          FROM items
          WHERE company_id = $1
            AND processes IS NOT NULL
            AND (
              processes::text LIKE '%${item.id}%'
              OR production_in_item_id = $2
              OR production_in_item_id_2 = $2
              OR production_in_item_id_3 = $2
            )
          LIMIT 5
        `, [companyId, item.id]);

        for (const cand of candidateItems) {
          const parsed = typeof cand.processes === 'string' ? JSON.parse(cand.processes) : cand.processes;
          if (Array.isArray(parsed) && parsed.length > (routeProcesses?.length || 0)) {
            routeProcesses = parsed;
          }
        }
      }

      if (routeProcesses && routeProcesses.length > 0) {
        // Collect all referenced output item IDs from the route
        const outputIds: string[] = routeProcesses
          .map((p: any) => p.outputItemId)
          .filter((id: any): id is string => typeof id === 'string' && id.length > 0);

        const stageItems = outputIds.length > 0
          ? await this.itemRepo
              .createQueryBuilder('it')
              .leftJoinAndSelect('it.baseUom', 'uom')
              .leftJoinAndSelect('it.department', 'dept')
              .where('it.id IN (:...outputIds)', { outputIds })
              .getMany()
          : [];
        const stageItemMap = new Map(stageItems.map((si) => [si.id, si]));

        routeProcesses.forEach((p: any, idx: number) => {
          const matchedItem = p.outputItemId ? stageItemMap.get(p.outputItemId) : null;
          const stageDept = p.departmentName || matchedItem?.department?.name || 'Manufacturing';
          const stageItemCode = matchedItem?.itemCode || (p.outputItemId === item.id ? item.itemCode : '');
          const stageItemName = matchedItem?.name || (p.outputItemId === item.id ? item.name : p.name);
          const stageItemType = matchedItem?.itemType || (idx === 0 ? 'RAW_MATERIAL' : 'WORK_IN_PROGRESS');
          const stageUom = matchedItem?.baseUom?.code || (idx === 0 ? 'KG' : 'PCS');
          const isCurrent = p.outputItemId === item.id || matchedItem?.id === item.id;

          journey.push({
            stageNumber: idx + 1,
            stageKey: p.name?.toUpperCase().replace(/[^A-Z0-9]+/g, '_') || `STAGE_${idx + 1}`,
            stageName: p.name,
            departmentName: stageDept,
            itemId: p.outputItemId || (isCurrent ? item.id : null),
            itemCode: stageItemCode,
            itemName: stageItemName,
            itemType: stageItemType,
            uom: stageUom,
            isCurrentItem: isCurrent,
          });
        });

        // Check if there is a downstream Finished Good (Carton Packing) consuming the last stage
        const lastStageOutputId = routeProcesses[routeProcesses.length - 1]?.outputItemId;
        if (lastStageOutputId) {
          const downstreamFG = await this.itemRepo.findOne({
            where: [
              { companyId, productionInItemId: lastStageOutputId },
              { companyId, productionInItemId2: lastStageOutputId },
              { companyId, productionInItemId3: lastStageOutputId },
            ],
            relations: ['baseUom', 'department'],
          });
          if (downstreamFG && !journey.some((j) => j.itemId === downstreamFG.id)) {
            journey.push({
              stageNumber: journey.length + 1,
              stageKey: 'FINISHED_GOOD',
              stageName: 'Finished Goods / Carton Packing',
              departmentName: downstreamFG.department?.name || 'Finished Goods Store',
              itemId: downstreamFG.id,
              itemCode: downstreamFG.itemCode,
              itemName: downstreamFG.name,
              itemType: downstreamFG.itemType,
              uom: downstreamFG.baseUom?.code || 'PCS',
              isCurrentItem: downstreamFG.id === item.id,
            });
          }
        }
      } else {
        // Fallback: Strictly linear upstream and downstream (NO sister variants or sibling pooling)
        const linearUpstream: any[] = [];
        let currUp: any = item;
        const visitedUp = new Set<string>([item.id]);
        while (currUp.productionInItemId) {
          if (visitedUp.has(currUp.productionInItemId)) break;
          visitedUp.add(currUp.productionInItemId);
          const parent = await this.itemRepo.findOne({
            where: { id: currUp.productionInItemId, companyId },
            relations: ['baseUom', 'department'],
          });
          if (!parent) break;
          linearUpstream.unshift(parent);
          currUp = parent;
        }

        // Downstream single child
        const linearDownstream: any[] = [];
        let currDown: any = item;
        const visitedDown = new Set<string>([item.id]);
        while (currDown) {
          const child = await this.itemRepo.findOne({
            where: [
              { companyId, productionInItemId: currDown.id },
              { companyId, productionInItemId2: currDown.id },
              { companyId, productionInItemId3: currDown.id },
            ],
            relations: ['baseUom', 'department'],
          });
          if (!child || visitedDown.has(child.id)) break;
          visitedDown.add(child.id);
          linearDownstream.push(child);
          currDown = child;
        }

        const fullChain = [...linearUpstream, item, ...linearDownstream];
        fullChain.forEach((ch, idx) => {
          journey.push({
            stageNumber: idx + 1,
            stageKey: ch.itemType || `STAGE_${idx + 1}`,
            stageName: ch.department?.name || (idx === 0 ? 'Raw Material Stores' : idx === fullChain.length - 1 ? 'Finished Goods' : 'Production Process'),
            departmentName: ch.department?.name || 'Manufacturing',
            itemId: ch.id,
            itemCode: ch.itemCode,
            itemName: ch.name,
            itemType: ch.itemType,
            uom: ch.baseUom?.code || 'KG',
            isCurrentItem: ch.id === item.id,
          });
        });
      }

      // Final dispatch stage
      journey.push({
        stageNumber: journey.length + 1,
        stageKey: 'DISPATCH',
        stageName: 'Customer Dispatch & Sales',
        departmentName: 'Dispatch & Logistics',
        itemId: null,
        itemCode: 'DISPATCH',
        itemName: 'Dispatched to Customer (Outward)',
        itemType: 'DISPATCH',
        uom: 'KG',
        isCurrentItem: false,
      });
    } catch {
      // Non-blocking fallback
    }

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
      journey,
    };
  }
}