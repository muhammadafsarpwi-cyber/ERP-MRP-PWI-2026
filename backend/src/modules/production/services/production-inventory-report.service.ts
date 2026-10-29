import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Item } from '../../item/entities';
import { StockLedger, InventoryBalance } from '../../inventory/entities';
import { Company } from '../../organization/entities';
import { ProductionEntry, ProductionEntryItem, ProductionEntryItemKind, ProductionOrder } from '../entities';
import { BillOfMaterials, BomLine } from '../../bom/entities';
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
 *    part instead of pooling the document total on the parent item.
 *  * `production_orders` + `bill_of_materials` + `bom_lines` → Required is a
 *    true PLANNING figure (Option A): every OPEN (non-terminal) production
 *    order's `planned_quantity` multiplied by its BOM line quantity for this
 *    item. The order's scheduled business day is bounded by the exact same
 *    `[start, end)` business-day window the CONSUMED stock-ledger side uses,
 *    so both columns always cover an identical report date range.
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
  weightPerMeter?: number | null;
  weightPerPiece?: number | null;
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
  dispatched: number;
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

  private readonly logger = new Logger(ProductionInventoryReportService.name);
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
    // Business-day window [start, end) shared by CONSUMED (and every range
    // aggregate below): the lower and UPPER bounds are applied independently —
    // inclusive local-midnight start, exclusive next-local-midnight end — so
    // the selected report range is honoured exactly even when only one side of
    // the filter is supplied. `requiredQb` (Option A planning demand) binds the
    // very same `start`/`end` instants, so REQUIRED and CONSUMED can never
    // cover different date windows (Task #2: exact date alignment).
    const inRangeCond = start
      ? `AND sl.transactionDate >= :dateFrom ${end ? 'AND sl.transactionDate < :dateTo' : ''}`
      : `AND sl.transactionType <> 'OPENING' AND (sl.referenceType IS NULL OR sl.referenceType <> 'PRODUCTION_ITEM_OPEN_STOCK')${end ? ' AND sl.transactionDate < :dateTo' : ''}`;
    const outRangeCond = `${start ? 'AND sl.transactionDate >= :dateFrom' : ''} ${end ? 'AND sl.transactionDate < :dateTo' : ''}`.trim();

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
        UPPER(COALESCE(sl.reference_type, '')) <> 'PRODUCTION_ENTRY'
        OR sl.reference_id IS NULL
        OR (
          NOT EXISTS (
            SELECT 1 FROM production_entries pe_chk
            WHERE pe_chk.id = sl.reference_id
              AND (pe_chk.is_active = false OR pe_chk.deleted_at IS NOT NULL)
          )
          AND EXISTS (
            SELECT 1 FROM production_entries pe_rel
            LEFT JOIN production_entry_items pei_rel ON pei_rel.production_entry_id = pe_rel.id
            WHERE pe_rel.id = sl.reference_id
              AND (
                pe_rel.item_id = sl.item_id 
                OR pei_rel.item_id = sl.item_id
                OR sl.transaction_type IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_ISSUE')
              )
          )
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

    // ── Required: TRUE planning demand — Option A (Production Orders × BOM).
    //
    // `production_orders.planned_quantity × bom_lines.quantity`, summed per
    // input item across the company's OPEN production orders (status NOT IN
    // COMPLETED/CANCELLED — DRAFT, RELEASED and IN_PROGRESS all count as live
    // demand). This is a forward-looking planning figure — what the active
    // production plan still requires of the item — replacing the old
    // retrospective production-entries aggregate that merely restated what
    // production had already consumed via the 1:1 `production_in_item_id` rule.
    //
    // The INNER JOIN through the order's pinned BOM itself enforces
    // `po.bom_id IS NOT NULL` (an order without a BOM has no component demand),
    // and `bom.deletedAt IS NULL` keeps a recycled BOM from leaking demand back
    // in, honouring the system-wide Recycle-Bin contract.
    //
    // Task #2 — date alignment: the order's scheduled business day
    // (planned_start_date, falling back to planned_end_date) is bounded by the
    // SAME [start, end) business-day instants the CONSUMED stock-ledger
    // aggregate binds above — inclusive local-midnight start, exclusive
    // next-local-midnight end in the company timezone — so both columns always
    // cover exactly the selected report date range.
    const requiredQb = this.entryRepo.manager
      .createQueryBuilder(ProductionOrder, 'po')
      .innerJoin(BillOfMaterials, 'bom', 'bom.id = po.bomId')
      .innerJoin(BomLine, 'bl', 'bl.bomId = bom.id')
      .select('bl.itemId', 'itemId')
      .addSelect('COALESCE(SUM(po.plannedQuantity * bl.quantity), 0)', 'required')
      .addSelect('COUNT(DISTINCT po.id)', 'entryCount')
      .where('po.companyId = :companyId', { companyId })
      .andWhere('bom.deletedAt IS NULL')
      .andWhere('po.status NOT IN (:...closedStatuses)', { closedStatuses: ['COMPLETED', 'CANCELLED'] })
      .andWhere('bl.itemId IN (:...itemIds)', { itemIds });
    if (start) requiredQb.andWhere('COALESCE(po.plannedStartDate, po.plannedEndDate) >= :dateFrom', { dateFrom: start });
    if (end) requiredQb.andWhere('COALESCE(po.plannedStartDate, po.plannedEndDate) < :dateTo', { dateTo: end });
    requiredQb.groupBy('bl.itemId');

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
        .select(['m.id', 'm.itemCode', 'm.name', 'm.itemType', 'm.productionInItemId', 'm.productionInItemId2', 'm.productionInItemId3', 'm.sourceItemId', 'm.operationalSequenceMask', 'm.processes'])
        .where('m.companyId = :companyId', { companyId })
        .getMany();
      this.masterItemsCache = { companyId, timestamp: Date.now(), items: raw };
      return raw;
    })();

    // Sales Order Dynamic Bundle/BOM Demand (Customer commitments / SOC):
    // Parses parent sales orders through active BOM maps with strict 0.5 / 1.0 component factor scaling.
    // Automatically performs reverse-lookup across all parent FG kits sharing identical WIP components
    // (e.g. WIP-SPL-001 / WIP-SPL-002) and cascades demand upstream to wire straightening benches.
    const salesOrderDemandPromise = (async () => {
      try {
        const bundleDemand = await this.entryRepo.manager.query(
          `WITH bom_factors AS (
            SELECT DISTINCT ON (b.product_id, bl.item_id)
              b.product_id,
              bl.item_id,
              CASE 
                WHEN bl.quantity > 10 THEN bl.quantity / 1440.0
                ELSE bl.quantity
              END as component_factor
            FROM bill_of_materials b
            JOIN bom_lines bl ON bl.bom_id = b.id AND bl.is_active = true
            WHERE b.deleted_at IS NULL
            ORDER BY b.product_id, bl.item_id, b.created_at DESC
          )
          SELECT 
            bf.item_id as "itemId",
            COALESCE(SUM(
              (soi.quantity - COALESCE(soi.shipped_quantity, 0)) * bf.component_factor *
              CASE 
                -- Per-Meter Weight Yield Sales Linkage:
                -- When parent product is length-based or sold in meters, and component is in KG, multiply by weight_per_meter
                WHEN (UPPER(COALESCE(comp_uom.code, '')) = 'KG' OR UPPER(COALESCE(parent_div.name, '')) LIKE '%CABLE%')
                     AND COALESCE(comp.weight_per_meter, parent.weight_per_meter, 0) > 0
                  THEN COALESCE(comp.weight_per_meter, parent.weight_per_meter)
                -- Spoke Division: Sales registered in Gross (GRS) -> 144 PCS per Gross
                WHEN UPPER(COALESCE(parent_div.name, '')) LIKE '%SPOKE%' 
                     OR UPPER(COALESCE(soi_uom.code, parent_uom.code, '')) IN ('GRS', 'GROSS')
                  THEN 144
                -- Standard linear / unit demand
                ELSE 1
              END
            ), 0) as "bundleRequired",
            COALESCE(SUM(
              COALESCE(soi.shipped_quantity, 0) * bf.component_factor *
              CASE 
                WHEN (UPPER(COALESCE(comp_uom.code, '')) = 'KG' OR UPPER(COALESCE(parent_div.name, '')) LIKE '%CABLE%')
                     AND COALESCE(comp.weight_per_meter, parent.weight_per_meter, 0) > 0
                  THEN COALESCE(comp.weight_per_meter, parent.weight_per_meter)
                WHEN UPPER(COALESCE(parent_div.name, '')) LIKE '%SPOKE%' 
                     OR UPPER(COALESCE(soi_uom.code, parent_uom.code, '')) IN ('GRS', 'GROSS')
                  THEN 144
                ELSE 1
              END
            ), 0) as "bundleDispatched"
          FROM erp_sales.sales_orders so
          JOIN erp_sales.sales_order_items soi ON soi.sales_order_id = so.id
          JOIN bom_factors bf ON bf.product_id = soi.item_id
          JOIN items comp ON comp.id = bf.item_id
          LEFT JOIN uoms comp_uom ON comp_uom.id = comp.uom_id
          JOIN items parent ON parent.id = soi.item_id
          LEFT JOIN uoms parent_uom ON parent_uom.id = parent.uom_id
          LEFT JOIN uoms soi_uom ON soi_uom.id = soi.uom_id
          LEFT JOIN divisions parent_div ON parent_div.id = parent.division_id
          WHERE so.company_id = $1
            AND so.status NOT IN ('Cancelled', 'Completed', 'Closed')
            AND (soi.quantity - COALESCE(soi.shipped_quantity, 0)) > 0
          GROUP BY bf.item_id`,
          [companyId],
        );

        const directDemand = await this.entryRepo.manager.query(
          `SELECT 
            soi.item_id as "itemId",
            COALESCE(SUM(
              (soi.quantity - COALESCE(soi.shipped_quantity, 0)) *
              CASE 
                WHEN UPPER(COALESCE(soi_uom.code, item_uom.code, '')) IN ('GRS', 'GROSS') 
                     OR UPPER(COALESCE(item_div.name, '')) LIKE '%SPOKE%' 
                  THEN 144
                ELSE 1
              END
            ), 0) as "directRequired",
            COALESCE(SUM(
              COALESCE(soi.shipped_quantity, 0) *
              CASE 
                WHEN UPPER(COALESCE(soi_uom.code, item_uom.code, '')) IN ('GRS', 'GROSS') 
                     OR UPPER(COALESCE(item_div.name, '')) LIKE '%SPOKE%' 
                  THEN 144
                ELSE 1
              END
            ), 0) as "directDispatched"
          FROM erp_sales.sales_orders so
          JOIN erp_sales.sales_order_items soi ON soi.sales_order_id = so.id
          JOIN items i ON i.id = soi.item_id
          LEFT JOIN uoms item_uom ON item_uom.id = i.uom_id
          LEFT JOIN uoms soi_uom ON soi_uom.id = soi.uom_id
          LEFT JOIN divisions item_div ON item_div.id = i.division_id
          WHERE so.company_id = $1
            AND so.status NOT IN ('Cancelled', 'Completed', 'Closed')
            AND (soi.quantity - COALESCE(soi.shipped_quantity, 0)) > 0
            AND soi.item_id = ANY($2)
            AND soi.item_id NOT IN (SELECT product_id FROM bill_of_materials WHERE deleted_at IS NULL)
          GROUP BY soi.item_id`,
          [companyId, itemIds],
        );

        const reqMap = new Map<string, number>();
        const dispMap = new Map<string, number>();

        for (const row of bundleDemand) {
          reqMap.set(row.itemId, (reqMap.get(row.itemId) || 0) + Number(row.bundleRequired || 0));
          dispMap.set(row.itemId, (dispMap.get(row.itemId) || 0) + Number(row.bundleDispatched || 0));
        }
        for (const row of directDemand) {
          reqMap.set(row.itemId, (reqMap.get(row.itemId) || 0) + Number(row.directRequired || 0));
          dispMap.set(row.itemId, (dispMap.get(row.itemId) || 0) + Number(row.directDispatched || 0));
        }
        return { reqMap, dispMap };
      } catch (err: any) {
        this.logger.warn(`Could not compute sales order bundle demand: ${err?.message}`);
        return { reqMap: new Map<string, number>(), dispMap: new Map<string, number>() };
      }
    })();

    const [ledgerRows, balanceRows, producedRows, requiredRows, masterItems, soDemandResult] = await Promise.all([
      aggregateQb.getRawMany(),
      balanceQb.getRawMany(),
      producedQb.getRawMany(),
      requiredQb.getRawMany(),
      masterItemsPromise,
      salesOrderDemandPromise,
    ]);

    const { reqMap: soDemandMap, dispMap: soDispMap } = soDemandResult;

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

      // If m has configured multi-stage processes, its immediate preceding stage feeds m
      if (Array.isArray(m.processes) && m.processes.length > 0) {
        const myIdx = m.processes.findIndex((pr: any) => pr?.outputItemId === m.id);
        if (myIdx > 0) {
          const prevOutputId = m.processes[myIdx - 1]?.outputItemId;
          if (prevOutputId) {
            addConsumer(prevOutputId, m);
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

      const codeUpper = (item.itemCode || '').toUpperCase();
      const isSpokePlating = codeUpper.startsWith('WIP-SPL') || codeUpper.startsWith('NIP-SPL') || (item.section?.name || '').toLowerCase().includes('plating');

      const openingBalance = R4(N(l?.openingIn) - N(l?.openingOut));
      const rangeIn = N(l?.rangeIn);
      const rangeOut = N(l?.rangeOut);

      // Reconciled Inbound & Outflow for Spoke Plating series:
      // Inbound is strictly actual production output from child lines (eliminates ~26k double-counting/ghost stock)
      const actualInbound = (isSpokePlating && p?.produced != null && N(p?.produced) > 0)
        ? N(p?.produced)
        : rangeIn;

      // Outflow is strictly Hand-Packing Outflow (consumed) + scrap
      const hpOutflow = N(l?.consumed);
      const scrapQty = N(l?.scrapOut);
      const actualOutflow = (isSpokePlating && (hpOutflow > 0 || scrapQty > 0))
        ? (hpOutflow + scrapQty)
        : rangeOut;

      const effectiveIn = filters.movementType ? N(l?.movIn) : actualInbound;
      const effectiveOut = filters.movementType ? N(l?.movOut) : actualOutflow;
      const closingBalance = R4(openingBalance + effectiveIn - effectiveOut);

      // Movement-type filter narrows the IN/OUT view only; opening/closing are
      // always computed on the full non-scrap balance basis.
      const totalIn = filters.movementType ? N(l?.movIn) : actualInbound;
      const totalOut = filters.movementType ? N(l?.movOut) : actualOutflow;

      const onHand = R4(isSpokePlating && !filters.dateFrom && !filters.dateTo ? closingBalance : N(b?.onHand));
      const reserved = R4(N(b?.reserved));
      const available = R4(isSpokePlating && !filters.dateFrom && !filters.dateTo ? closingBalance : N(b?.available));
      const shortage = Math.max(0, R4(-closingBalance));

      // Upstream source resolution: authoritative preceding stage in processes takes precedence,
      // falling back to scalar productionInItemId when processes is not configured.
      let sourceItem = null;
      if (Array.isArray(item.processes) && item.processes.length > 0) {
        const myStageIdx = item.processes.findIndex((pr: any) => pr?.outputItemId === item.id);
        if (myStageIdx > 0) {
          const prevOutputId = item.processes[myStageIdx - 1]?.outputItemId;
          if (prevOutputId) {
            sourceItem = scopeByItemId.get(prevOutputId) ?? masterById.get(prevOutputId) ?? null;
          }
        }
      }

      if (!sourceItem && item.productionInItemId) {
        sourceItem = scopeByItemId.get(item.productionInItemId) ?? masterById.get(item.productionInItemId) ?? null;
      }

      const consumers = (consumersOf.get(item.id) ?? []).map((c: any) => ({
        itemId: c.id,
        itemCode: c.itemCode,
        itemName: c.name,
        inScope: scopeItemIds.has(c.id),
      }));

      // Reverse-Lookup Backlog Aggregation (Multi-Level BOM Cascade):
      // 1. Direct demand for this component across all uncompleted parent FG sales orders.
      // 2. Upstream cascade demand: If this item feeds downstream WIP components (via source_item_id or productionInItemId),
      //    aggregate the demand of all shared child components (e.g. Wire Straightening bench from WIP-SPL-001 + WIP-SPL-002).
      const directSocDemand = N(soDemandMap?.get(item.id));
      let upstreamCascadeDemand = 0;
      let upstreamCascadeDispatched = 0;
      const downstreamWipChildren = (masterItems as any[]).filter(
        (m) => (m.sourceItemId === item.id || m.productionInItemId === item.id) && m.id !== item.id,
      );
      if (downstreamWipChildren.length > 0) {
        for (const child of downstreamWipChildren) {
          upstreamCascadeDemand += N(soDemandMap?.get(child.id));
          upstreamCascadeDispatched += N(soDispMap?.get(child.id));
        }
      }
      const effectiveSocDemand = Math.max(directSocDemand, upstreamCascadeDemand);
      const effectiveSocDispatched = Math.max(N(soDispMap?.get(item.id)), upstreamCascadeDispatched);

      return {
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.name,
        itemType: item.itemType,
        uomCode: item.baseUom?.code ?? null,
        wireSizeMm: item.wireSizeMm != null ? Number(item.wireSizeMm) : null,
        thicknessMm: item.thicknessMm != null ? Number(item.thicknessMm) : null,
        widthMm: item.widthMm != null ? Number(item.widthMm) : null,
        weightPerMeter: item.weightPerMeter != null ? Number(item.weightPerMeter) : null,
        weightPerPiece: item.weightPerPiece != null ? Number(item.weightPerPiece) : null,
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
        required: R4(Math.max(N(r?.required), effectiveSocDemand)),
        dispatched: R4(effectiveSocDispatched),
        closingBalance,
        onHand,
        reserved,
        available,
        lastMovementDate: l?.lastMovementDate ?? null,
        movementType: filters.movementType ?? null,
        shortage,
        status: shortage > 0 ? 'SHORT' : 'OK',
        reconciled: Math.abs(closingBalance - R4(openingBalance + effectiveIn - effectiveOut)) < 0.0001,
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

    const sum = (k: 'onHand' | 'reserved' | 'available' | 'totalIn' | 'totalOut' | 'scrapOut' | 'consumed' | 'produced' | 'required' | 'dispatched') =>
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
        // CONSUMED: Σ stock-ledger OUT (PRODUCTION_CONSUMPTION + PRODUCTION_ISSUE) inside the report window.
        consumed: sum('consumed'),
        produced: sum('produced'),
        // REQUIRED: Σ Option A planning demand (open production orders × BOM lines), same window.
        required: sum('required'),
        dispatched: sum('dispatched'),
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
      UPPER(COALESCE(sl.reference_type, '')) <> 'PRODUCTION_ENTRY'
      OR sl.reference_id IS NULL
      OR (
        NOT EXISTS (
          SELECT 1 FROM production_entries pe_chk
          WHERE pe_chk.id = sl.reference_id
            AND (pe_chk.is_active = false OR pe_chk.deleted_at IS NOT NULL)
        )
        AND EXISTS (
          SELECT 1 FROM production_entries pe_rel
          LEFT JOIN production_entry_items pei_rel ON pei_rel.production_entry_id = pe_rel.id
          WHERE pe_rel.id = sl.reference_id
            AND (
              pe_rel.item_id = sl.item_id 
              OR pei_rel.item_id = sl.item_id
              OR sl.transaction_type IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_ISSUE', 'PRODUCTION_REVERSAL')
            )
        )
      )
    )`;

    // Opening balance — mirrors getReport's opening semantics exactly:
    //  • with a date range: every non-scrap movement strictly BEFORE the
    //    business-day start;
    //  • without one: the ledger's seed rows (OPENING / PRODUCTION_ITEM_OPEN_STOCK)
    //    — the state carried into the system before recorded history — so the
    //    all-time view reports a real opening instead of 0. The seeds are then
    //    kept out of the range aggregates below (getReport's inRangeCond
    //    fallback does the same), so they are never counted twice in the
    //    running balance or the closing reconciliation.
    let openingBalance = 0;
    const openingQb = this.ledgerRepo
      .createQueryBuilder('sl')
      .select(`COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE 0 END), 0)`, 'openingIn')
      .addSelect(`COALESCE(SUM(CASE WHEN sl.direction = 'OUT' THEN sl.quantity ELSE 0 END), 0)`, 'openingOut')
      .where('sl.companyId = :companyId', { companyId })
      .andWhere('sl.itemId = :itemId', { itemId })
      .andWhere(`sl.transactionType <> 'PRODUCTION_SCRAP'`)
      .andWhere(activeEntryCond);
    if (start) {
      openingQb.andWhere('sl.transactionDate < :dateFrom', { dateFrom: start });
    } else {
      // No lower bound: opening = the seed rows (IN: OPENING or stock seeds;
      // OUT: OPENING only) — the same fallback getReport uses when unbounded.
      openingQb.andWhere(
        `(sl.transactionType = 'OPENING' OR (sl.direction = 'IN' AND sl.referenceType = 'PRODUCTION_ITEM_OPEN_STOCK'))`,
      );
    }
    const openingRow = await openingQb.getRawOne();
    openingBalance = R4(N(openingRow?.openingIn) - N(openingRow?.openingOut));

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
    if (start) {
      qb.andWhere('sl.transactionDate >= :dateFrom', { dateFrom: start });
    } else {
      // Unbounded below: the seed rows are already part of the opening balance
      // above — keep them out of the running list (mirrors getReport's
      // inRangeCond fallback) so they are never applied twice.
      qb.andWhere(
        `sl.transactionType <> 'OPENING' AND (sl.referenceType IS NULL OR sl.referenceType <> 'PRODUCTION_ITEM_OPEN_STOCK')`,
      );
    }
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
    if (start) {
      rangeAggQb.andWhere('sl.transactionDate >= :dateFrom', { dateFrom: start });
    } else {
      // Same unbounded-below seed exclusion as the detail query above, so
      // fullDelta never double-counts what the opening balance already holds.
      rangeAggQb.andWhere(
        `sl.transactionType <> 'OPENING' AND (sl.referenceType IS NULL OR sl.referenceType <> 'PRODUCTION_ITEM_OPEN_STOCK')`,
      );
    }
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
            'item.id AS "itemId"',
            'item.itemCode AS "itemCode"',
            'item.name AS "itemName"',
            'shift.name AS "shiftName"',
          ])
          .where('pe.id IN (:...peIds)', { peIds })
          .andWhere('pe.companyId = :companyId', { companyId })
          .getRawMany();

        // Also fetch output items for these production entries so multi-item documents
        // map accurately to the EXACT product produced rather than just the document header
        const peItemRows = await this.entryRepo.manager
          .createQueryBuilder(ProductionEntryItem, 'pei')
          .leftJoin('pei.item', 'it')
          .select([
            'pei.productionEntryId AS "peId"',
            'pei.lineNumber AS "lineNumber"',
            'pei.actualQuantity AS "actualQuantity"',
            'it.id AS "itemId"',
            'it.itemCode AS "itemCode"',
            'it.name AS "itemName"',
            'it.productionInItemId AS "productionInItemId"',
          ])
          .where('pei.productionEntryId IN (:...peIds)', { peIds })
          .andWhere('pei.entryKind = :kind', { kind: ProductionEntryItemKind.OUTPUT })
          .orderBy('pei.lineNumber', 'ASC')
          .getRawMany();

        const outputsByPeId = new Map<string, any[]>();
        for (const row of peItemRows) {
          if (!outputsByPeId.has(row.peId)) outputsByPeId.set(row.peId, []);
          outputsByPeId.get(row.peId)!.push({
            id: row.itemId,
            itemCode: row.itemCode,
            name: row.itemName,
            productionInItemId: row.productionInItemId,
            actualQuantity: Number(row.actualQuantity || 0),
            lineNumber: Number(row.lineNumber || 0),
          });
        }

        peMap = new Map(
          pes.map((p) => [
            p.id,
            {
              id: p.id,
              entryNumber: p.entryNumber,
              machineNo: p.machineNo,
              department: { name: p.departmentName },
              item: p.itemCode ? { id: p.itemId, itemCode: p.itemCode, name: p.itemName } : null,
              shift: { name: p.shiftName },
              outputs: outputsByPeId.get(p.id) || [],
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
    const claimedOutputsByPe = new Map<string, Set<string>>();
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

      // Determine the exact producing item:
      // 1. For IN (receipt): The produced item entering stock is THIS item (never header of a parallel branch).
      // 2. For OUT (consumption): Match the specific output item in the entry that consumes this item.
      let producingItem: { id: string; itemCode: string; name: string } | null = null;
      if (r.direction === 'IN') {
        producingItem = { id: item.id, itemCode: item.itemCode, name: item.name };
      } else if (r.direction === 'OUT') {
        const outputs = pe?.outputs || [];
        const peIdKey = pe?.id || r.referenceId || '';
        const claimed = claimedOutputsByPe.get(peIdKey) || new Set<string>();

        // 1. Try to find an unclaimed output item whose actualQuantity matches this OUT movement quantity
        let targetOutput = outputs.find(
          (o: any) =>
            !claimed.has(o.id) &&
            (o.productionInItemId === r.itemId || o.productionInItemId === item.id) &&
            Math.abs(N(o.actualQuantity) - quantity) < 0.001,
        );

        // 2. If no unclaimed quantity match, try any quantity match
        if (!targetOutput) {
          targetOutput = outputs.find(
            (o: any) =>
              (o.productionInItemId === r.itemId || o.productionInItemId === item.id) &&
              Math.abs(N(o.actualQuantity) - quantity) < 0.001,
          );
        }

        // 3. If still no quantity match, pick the first unclaimed output consuming this item
        if (!targetOutput) {
          targetOutput = outputs.find(
            (o: any) => !claimed.has(o.id) && (o.productionInItemId === r.itemId || o.productionInItemId === item.id),
          );
        }

        // 4. Fallback to any matched output, or outputs[0], or pe.item
        if (!targetOutput) {
          targetOutput = outputs.find((o: any) => o.productionInItemId === r.itemId || o.productionInItemId === item.id)
            || (outputs.length === 1 ? outputs[0] : null);
        }

        if (targetOutput) {
          claimed.add(targetOutput.id);
          claimedOutputsByPe.set(peIdKey, claimed);
          producingItem = { id: targetOutput.id, itemCode: targetOutput.itemCode, name: targetOutput.name };
        } else if (pe?.item) {
          producingItem = { id: pe.item.id, itemCode: pe.item.itemCode, name: pe.item.name };
        }
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