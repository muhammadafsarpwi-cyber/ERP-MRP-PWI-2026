import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, DeepPartial } from 'typeorm';
import {
  ProductionEntry,
  ProductionEntryItem,
  ProductionEntryItemKind,
  ProductionEntryDowntime,
  Machine,
  Shift,
  DowntimeReason,
} from '../entities';
import { CreateProductionEntryDto, UpdateProductionEntryDto, CreateMachineDto } from '../dto';
import { Item, Uom, UomConversion } from '../../item/entities';
import { Division, Section, Department, Warehouse, WarehouseType } from '../../organization/entities';
import { BillOfMaterials, BomLine, BomStatus } from '../../bom/entities';
import { ProductionOrder, ProductionOrderOperation } from '../entities';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import {
  MachineTargetService,
  calculateProratedTarget,
} from '../../machine-target/services/machine-target.service';
import { ProductionRoutingService } from '../../production-routing/services/production-routing.service';
import { populateAuditNames } from '../../organization/helpers/audit-names';
import {
  familyOf,
  supportedConversions,
} from '../../item/services/uom-conversion.calculator';
import { BarcodeService } from '../../barcode/services/barcode.service';
import { BarcodeEntityType } from '../../barcode/entities/barcode.entity';
import { applyDivisionScopeFilter, isUnrestricted } from '../../../common/division-scope.util';

const ENTRY_REFERENCE_TYPE = 'PRODUCTION_ENTRY';
const HAND_PACKING_PCS_PER_GROSS = 144;
const HAND_PACKING_PCS_PER_CARTON = 1440;

/** `production_entry_items` lines holding the posting path's raw-material consumption audit start here. */
const INPUT_AUDIT_LINE_NUMBER = 1000;

/**
 * Strips the posting path's INPUT audit lines (lineNumber >= 1000) from an
 * incoming payload. Those lines record what was CONSUMED for the entry — never
 * operator-entered production output. Letting them through would rebuild the
 * entry quantity from consumption (100 produced + 102 consumed = 202) and hand
 * `buildProductionOutputs` the raw material itself as an extra finished good.
 *
 * `undefined` is preserved so PATCH semantics survive (`undefined` = "leave the
 * child collection alone", see `persistChildren`).
 */
const onlyOutputLines = <T extends { lineNumber?: number | null; id?: string | null }>(
  items?: T[],
  auditLineIds?: ReadonlySet<string>,
): T[] | undefined =>
  items === undefined
    ? undefined
    : items.filter((line) =>
      Number(line?.lineNumber ?? 0) < INPUT_AUDIT_LINE_NUMBER
      && !(line?.id && auditLineIds?.has(String(line.id))),
    );

/** `itemId|warehouseId` → net quantity already posted for one movement family. */
type MovementBucket = Map<string, number>;

/** A production item line as accepted by the posting path. */
interface OutputLine {
  itemId?: string | null;
  uomId?: string | null;
  actualQuantity?: number;
  scrapQuantity?: number;
}

/** One unreconciled difference between the original posting and the edit. */
interface DeltaLine {
  family: 'receipt' | 'consumption' | 'scrap';
  itemId: string;
  warehouseId: string;
  oldQty: number;
  newQty: number;
  uomId: string | null;
}

/** What this entry has ALREADY posted, read back from `stock_ledger`. */
interface PostedMovements {
  /** Finished goods received IN. */
  receipts: MovementBucket;
  /** Raw material issued OUT. */
  consumptions: MovementBucket;
  /** Scrap recorded OUT (audit trail, never touches the balance). */
  scraps: MovementBucket;
  /** `itemId|warehouseId` → the UOM the movement was posted in. */
  uoms: Map<string, string | null>;
  /** False when a reversal row cannot be attributed to the movement it undoes. */
  reliable: boolean;
  /** True when the entry has at least one posted movement. */
  seen: boolean;
}

const movementKey = (itemId: string, warehouseId: string): string => `${itemId}|${warehouseId}`;

const bumpBucket = (bucket: MovementBucket, key: string, delta: number): void => {
  const next = (bucket.get(key) ?? 0) + delta;
  if (Math.abs(next) < 1e-9) bucket.delete(key);
  else bucket.set(key, next);
};

/**
 * PHASE 3 — CANONICAL OVERTIME AGGREGATE (KPI `totalOvertime`).
 *
 * Overtime is ALWAYS the persisted production_entries.overtime_hours; the only
 * fallback is the legacy remarks encoding `OT: X h` — the exact rule the
 * create/update paths apply before they persist the column. It is deliberately
 * NOT `running_hours - <planned>`: planned hours come from the shifts master
 * (8h for GENERAL / SHIFT-A,B,C but 12h for GENERAL (Day), GENERAL (Night) and
 * E2E12), so re-deriving on read manufactures overtime that was never recorded
 * — which is what made the KPI and the OT column disagree.
 *
 * MUST stay equivalent to entryOvertimeHours() in
 * frontend/src/pages/production/entries/overtimeHours.ts, so the KPI total and
 * the table's OT column can never report different hours for the same rows.
 */
const OVERTIME_SUM_SQL =
  "CASE WHEN COALESCE(pe.overtime_hours, 0) > 0 THEN pe.overtime_hours " +
  "WHEN pe.remarks ~* 'OT:\\s*([0-9]+(?:\\.[0-9]+)?)\\s*h' " +
  "THEN COALESCE((regexp_match(pe.remarks, 'OT:\\s*([0-9]+(?:\\.[0-9]+)?)\\s*h', 'i'))[1]::numeric, 0) " +
  "ELSE 0 END";

/* ── Report weight model (authoritative UOM-aware conversions) ────────────
   The production report's Scrap is stored/displayed in KG and the Actual
   quantity is unit-agnostic (PCS / M / KG...). For reporting we derive a
   comparable "Actual KG" from the Item Master weight data only:
     · PCS / count   → Actual × weight_per_piece
     · M / MTR/...   → Actual × weight_per_meter
     · KG (weight)   → Actual (never re-multiplied)
     · other UOM     → null (no invented conversion)
   Scrap % is then Scrap KG ÷ Actual KG × 100 (null when Actual KG is 0 —
   never Infinity/NaN). These are derived report values, NOT persisted.          */
const UOM_WEIGHT = new Set(['KG', 'KGS', 'KGM', 'KILOGRAM', 'KILOGRAMS']);
const UOM_LENGTH = new Set(['M', 'MTR', 'METER', 'METRE', 'METERS', 'METRES']);
const UOM_COUNT = new Set(['PCS', 'PC', 'PIECE', 'PIECES', 'EA', 'NOS', 'NO', 'UNIT']);

export function calcActualKg(
  uomCode: string,
  actualQuantity: number,
  weightPerPiece: number | null | undefined,
  weightPerMeter: number | null | undefined,
): number | null {
  const u = (uomCode || '').toUpperCase().trim();
  if (UOM_WEIGHT.has(u)) return Math.round(actualQuantity * 10000) / 10000;
  if (UOM_LENGTH.has(u)) return weightPerMeter == null ? null : Math.round(actualQuantity * weightPerMeter * 10000) / 10000;
  if (UOM_COUNT.has(u)) return weightPerPiece == null ? null : Math.round(actualQuantity * weightPerPiece * 10000) / 10000;
  return null;
}

export function calcScrapPct(scrapQuantity: number, actualKg: number | null | undefined): number | null {
  if (actualKg == null || actualKg <= 0) return null;
  return Math.round((scrapQuantity / actualKg) * 10000) / 100;
}

@Injectable()
export class ProductionEntryService {
  constructor(
    @InjectRepository(ProductionEntry)
    private readonly entryRepo: Repository<ProductionEntry>,
    @InjectRepository(ProductionEntryItem)
    private readonly entryItemRepo: Repository<ProductionEntryItem>,
    @InjectRepository(ProductionEntryDowntime)
    private readonly entryDowntimeRepo: Repository<ProductionEntryDowntime>,
    @InjectRepository(Machine)
    private readonly machineRepo: Repository<Machine>,
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(DowntimeReason)
    private readonly downtimeReasonRepo: Repository<DowntimeReason>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(UomConversion)
    private readonly uomConversionRepo: Repository<UomConversion>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(ProductionOrder)
    private readonly productionOrderRepo: Repository<ProductionOrder>,
    @InjectRepository(ProductionOrderOperation)
    private readonly productionOrderOperationRepo: Repository<ProductionOrderOperation>,
    @InjectRepository(BillOfMaterials)
    private readonly bomRepo: Repository<BillOfMaterials>,
    @InjectRepository(BomLine)
    private readonly bomLineRepo: Repository<BomLine>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Uom)
    private readonly uomRepo: Repository<Uom>,
    private readonly stockLedgerService: StockLedgerService,
    private readonly inventoryBalanceService: InventoryBalanceService,
    private readonly machineTargetService: MachineTargetService,
    private readonly productionRoutingService: ProductionRoutingService,
    private readonly barcodeService: BarcodeService,
  ) {}

  // ─── Division scope helpers (Prompt #16 §16/§18/§19) ──────────────────────

  /**
   * Read-by-ID / write authorization (§18 / §19). Throws 403 when the record
   * sits in a division the caller may not access, and 404 when the record is
   * simply absent — never leaking that a foreign record exists beyond the
   * refusal itself.
   *
   * `divisionId` may be `null` for records whose division is not yet known
   * (e.g. before a department is chosen); those inherit the company's access
   * and are not filtered.
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
  private readonly logger = new Logger(ProductionEntryService.name);

  // ─── Queries ────────────────────────────────────────────────────────────────

  async findAll(companyId: string, filters?: {
    page?: number;
    limit?: number;
    divisionId?: string;
    sectionId?: string;
    departmentId?: string;
    dateFrom?: string;
    dateTo?: string;
    shiftId?: string;
    machineNo?: string;
    machineId?: string;
    itemId?: string;
    uomId?: string;
    search?: string;
    productionOrderId?: string;
    sortBy?: string;
    sortDir?: 'ASC' | 'DESC';
    allowedDivisionIds?: string[];
    status?: string;
    chevronKey?: string;
  }): Promise<{
    data: ProductionEntry[];
    total: number;
    page: number;
    limit: number;
    summary: {
      total: number;
      actual: number;
      target: number;
      scrap: number;
      overtime: number;
      downtime: number;
      efficiency: number;
      counts: {
        all: number;
        COMPLETED: number;
        IN_PROGRESS: number;
        DRAFT: number;
        WITH_SCRAP: number;
        WITH_DOWNTIME: number;
      };
    };
  }> {
    const {
      page = 1,
      limit = 50,
      divisionId,
      sectionId,
      departmentId,
      dateFrom,
      dateTo,
      shiftId,
      machineNo,
      machineId,
      itemId,
      uomId,
      search,
      productionOrderId,
      sortBy,
      sortDir = 'DESC',
      allowedDivisionIds,
      status,
      chevronKey,
    } = filters || {};

    const qb = this.entryRepo.createQueryBuilder('pe')
      .leftJoinAndSelect('pe.division', 'division')
      .leftJoinAndSelect('pe.section', 'section')
      .leftJoinAndSelect('pe.department', 'department')
      .leftJoinAndSelect('pe.shift', 'shift')
      .leftJoinAndSelect('pe.item', 'item')
      .leftJoinAndSelect('pe.uom', 'uom')
      .leftJoinAndSelect('pe.machine', 'machine')
      .where('pe.companyId = :companyId', { companyId })
      .andWhere('pe.isActive = true');

    if (divisionId) qb.andWhere('pe.divisionId = :divisionId', { divisionId });
    // Server-side division scoping (§16) — never trusts a client dropdown.
    applyDivisionScopeFilter(qb, 'pe.divisionId', allowedDivisionIds);
    if (sectionId) qb.andWhere('pe.sectionId = :sectionId', { sectionId });
    if (departmentId) qb.andWhere('pe.departmentId = :departmentId', { departmentId });
    if (dateFrom) qb.andWhere('pe.entryDate >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('pe.entryDate <= :dateTo', { dateTo });
    if (shiftId) qb.andWhere('pe.shiftId = :shiftId', { shiftId });
    if (machineNo) qb.andWhere('pe.machineNo ILIKE :machineNo', { machineNo: `%${machineNo}%` });
    if (machineId) qb.andWhere('pe.machineId = :machineId', { machineId });
    if (itemId) qb.andWhere('pe.itemId = :itemId', { itemId });
    if (uomId) qb.andWhere('pe.uomId = :uomId', { uomId });
    if (productionOrderId) qb.andWhere('pe.productionOrderId = :productionOrderId', { productionOrderId });
    if (search?.trim()) {
      qb.andWhere(
        '(pe.operatorName ILIKE :search OR pe.machineNo ILIKE :search OR item.itemCode ILIKE :search OR item.name ILIKE :search OR pe.remarks ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    // Build overall summary query matching all organization/date/search filters before pagination & chevron filtering
    const summaryQb = this.entryRepo.createQueryBuilder('pe')
      .leftJoin('pe.item', 'item')
      .where('pe.companyId = :companyId', { companyId })
      .andWhere('pe.isActive = true');

    if (divisionId) summaryQb.andWhere('pe.divisionId = :divisionId', { divisionId });
    applyDivisionScopeFilter(summaryQb, 'pe.divisionId', allowedDivisionIds);
    if (sectionId) summaryQb.andWhere('pe.sectionId = :sectionId', { sectionId });
    if (departmentId) summaryQb.andWhere('pe.departmentId = :departmentId', { departmentId });
    if (dateFrom) summaryQb.andWhere('pe.entryDate >= :dateFrom', { dateFrom });
    if (dateTo) summaryQb.andWhere('pe.entryDate <= :dateTo', { dateTo });
    if (shiftId) summaryQb.andWhere('pe.shiftId = :shiftId', { shiftId });
    if (machineNo) summaryQb.andWhere('pe.machineNo ILIKE :machineNo', { machineNo: `%${machineNo}%` });
    if (machineId) summaryQb.andWhere('pe.machineId = :machineId', { machineId });
    if (itemId) summaryQb.andWhere('pe.itemId = :itemId', { itemId });
    if (uomId) summaryQb.andWhere('pe.uomId = :uomId', { uomId });
    if (productionOrderId) summaryQb.andWhere('pe.productionOrderId = :productionOrderId', { productionOrderId });
    if (search?.trim()) {
      summaryQb.andWhere(
        '(pe.operatorName ILIKE :search OR pe.machineNo ILIKE :search OR item.itemCode ILIKE :search OR item.name ILIKE :search OR pe.remarks ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    const summaryRow = await summaryQb
      .select([
        'COUNT(pe.id)::int AS "totalEntries"',
        'COALESCE(SUM(pe.target_quantity), 0)::float AS "totalTarget"',
        'COALESCE(SUM(pe.actual_quantity), 0)::float AS "totalActual"',
        'COALESCE(SUM(pe.scrap_quantity), 0)::float AS "totalScrap"',
        `COALESCE(SUM(${OVERTIME_SUM_SQL}), 0)::float AS "totalOvertime"`,
        'COALESCE(SUM(pe.downtime_hours), 0)::float AS "totalDowntime"',
        'COALESCE(AVG(pe.efficiency_percentage), 0)::float AS "avgEfficiency"',
        'COUNT(CASE WHEN (pe.inventory_reference_id IS NOT NULL OR pe.actual_quantity > 0) THEN 1 END)::int AS "completedCount"',
        '0::int AS "inProgressCount"',
        'COUNT(CASE WHEN (pe.inventory_reference_id IS NULL AND pe.actual_quantity = 0) THEN 1 END)::int AS "draftCount"',
        'COUNT(CASE WHEN pe.scrap_quantity > 0 THEN 1 END)::int AS "withScrapCount"',
        'COUNT(CASE WHEN pe.downtime_hours > 0 THEN 1 END)::int AS "withDowntimeCount"',
      ])
      .getRawOne();

    const totalTarget = Number(summaryRow?.totalTarget || 0);
    const totalActual = Number(summaryRow?.totalActual || 0);
    const summary = {
      total: Number(summaryRow?.totalEntries || 0),
      actual: totalActual,
      target: totalTarget,
      scrap: Number(summaryRow?.totalScrap || 0),
      overtime: Number(summaryRow?.totalOvertime || 0),
      downtime: Number(summaryRow?.totalDowntime || 0),
      efficiency: totalTarget > 0 ? Math.round((totalActual / totalTarget) * 10000) / 100 : Number(summaryRow?.avgEfficiency || 0),
      counts: {
        all: Number(summaryRow?.totalEntries || 0),
        COMPLETED: Number(summaryRow?.completedCount || 0),
        IN_PROGRESS: Number(summaryRow?.inProgressCount || 0),
        DRAFT: Number(summaryRow?.draftCount || 0),
        WITH_SCRAP: Number(summaryRow?.withScrapCount || 0),
        WITH_DOWNTIME: Number(summaryRow?.withDowntimeCount || 0),
      },
    };

    // Apply status and chevron filters to the table query
    if (chevronKey === 'COMPLETED' || status === 'COMPLETED') {
      qb.andWhere('(pe.inventoryReferenceId IS NOT NULL OR pe.actualQuantity > 0)');
    } else if (chevronKey === 'IN_PROGRESS' || status === 'IN_PROGRESS') {
      qb.andWhere('FALSE');
    } else if (chevronKey === 'DRAFT' || status === 'DRAFT') {
      qb.andWhere('(pe.inventoryReferenceId IS NULL AND pe.actualQuantity = 0)');
    } else if (chevronKey === 'WITH_SCRAP') {
      qb.andWhere('pe.scrapQuantity > 0');
    } else if (chevronKey === 'WITH_DOWNTIME') {
      qb.andWhere('pe.downtimeHours > 0');
    }

    const sortMap: Record<string, string> = {
      entryDate: 'pe.entryDate',
      createdAt: 'pe.createdAt',
      department: 'department.name',
      machineNo: 'pe.machineNo',
      item: 'item.name',
      actualQuantity: 'pe.actualQuantity',
      targetQuantity: 'pe.targetQuantity',
    };
    const orderColumn = sortMap[sortBy ?? 'entryDate'] ?? 'pe.entryDate';
    qb.orderBy(orderColumn, sortDir === 'ASC' ? 'ASC' : 'DESC');
    if (orderColumn === 'pe.entryDate') qb.addOrderBy('pe.createdAt', 'DESC');

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    await populateAuditNames(this.entryRepo.manager.connection, data);
    return { data, total, page, limit, summary };
  }

  async findOne(id: string, companyId: string, allowedDivisionIds?: string[]): Promise<ProductionEntry> {
    const entry = await this.entryRepo.findOne({
      where: { id, companyId },
      relations: [
        'division', 'section', 'department', 'shift', 'item.productionInItem', 'uom',
        'machine', 'downtimeReason', 'productionOrder',
      ],
    });
    if (!entry || !entry.isActive) {
      throw new NotFoundException(`Production Entry with ID '${id}' not found`);
    }
    // §18 — guessing an ID must not bypass the list filter.
    this.assertDivisionAccess(allowedDivisionIds, entry.divisionId, 'production entry');
    // Attach child production item lines + downtime lines for edit-mode UI
    try {
      const [items, downtimes] = await Promise.all([
        this.entryItemRepo.find({
          where: { productionEntryId: id },
          order: { lineNumber: 'ASC' },
          relations: ['item', 'uom'],
        }),
        this.entryDowntimeRepo.find({
          where: { productionEntryId: id },
          order: { lineNumber: 'ASC' },
          relations: ['downtimeReason'],
        }),
      ]);
      (entry as any).items = items;
      (entry as any).downtimes = downtimes;
    } catch { /* child tables may not exist for legacy entries */ }
    // Attach the receipt warehouse from stock ledger when entry posted to inventory
    if (entry.inventoryReferenceId) {
      try {
        const ledgerRes = await this.stockLedgerService.findAll({
          companyId,
          referenceId: entry.id,
          referenceType: 'PRODUCTION_ENTRY',
          limit: 10,
        });
        const receiptMvt = (ledgerRes.data || []).find((m) => m.transactionType === 'PRODUCTION_RECEIPT');
        if (receiptMvt) {
          (entry as any).warehouseId = receiptMvt.warehouseId;
          (entry as any).warehouse = receiptMvt.warehouse;
        }
      } catch { /* ledger lookup non-critical */ }
    }
    // Attach the item's effective production route when available (for UI display).
    if (entry.itemId) {
      try {
        (entry as any).route = await this.productionRoutingService.getEffectiveRouteForItem(entry.itemId, companyId);
      } catch {
        (entry as any).route = null;
      }
    }
    return entry;
  }

  /**
   * Department-wise production report.
   * Groups by Division → Section → Department → Item/UOM so that quantities
   * with different UOMs are never added together.
   */
  async getReport(companyId: string, filters: {
    divisionId?: string;
    sectionId?: string;
    departmentId?: string;
    dateFrom?: string;
    dateTo?: string;
    shiftId?: string;
    machineNo?: string;
    machineId?: string;
    itemId?: string;
    uomId?: string;
    productionOrderId?: string;
    allowedDivisionIds?: string[];
  }): Promise<any> {
    /**
     * DATA SOURCE (Item Master driven — COMPLETE production-class catalogue):
     *
     * The report STARTS from the authoritative Products & Items records and LEFT
     * JOINs production/scrap aggregates. EVERY active Item Master record whose
     * Item Type is a production class — RAW_MATERIAL, WORK_IN_PROGRESS,
     * SEMI_FINISHED, FINISHED_GOOD — is a report row, regardless of whether it
     * has any production transaction. Items without transactions show their
     * Target/Actual/Scrap as zero (never dropped, never blank).
     *
     * No relational "production-flow" restriction (machine targets / BOM /
     * routings / entries) is applied to the item set: any such restriction
     * silently drops legitimate Item Master raw materials (the root cause of
     * "raw materials missing from the report"). Company isolation is enforced
     * via company_id on every item.
     *
     * Division/Department grouping uses the Item Master's OWN organizational
     * relationship (item.division_id / section / department), so the report is
     * Division → Department → Items from the authoritative Item record.
     *
     * Per-item master weights (weight_per_piece / weight_per_meter / weight)
     * are passed through unchanged — never computed, never defaulted to zero.
     */
    const { divisionId, sectionId, departmentId, dateFrom, dateTo, shiftId, machineNo, machineId, itemId, uomId, productionOrderId, allowedDivisionIds } = filters;

    // Production-class Item Types shown in the report (authoritative Item Master values).
    const ITEM_TYPE_FILTER = "i.item_type IN ('RAW_MATERIAL','WORK_IN_PROGRESS','SEMI_FINISHED','FINISHED_GOOD')";

    const itemWhere: string[] = ['i.company_id = $1'];
    const itemParams: unknown[] = [companyId];
    if (divisionId) { itemParams.push(divisionId); itemWhere.push(`i.division_id = $${itemParams.length}`); }
    // §16 — restrict the report's Item Master rows to the caller's divisions.
    if (allowedDivisionIds !== undefined && !isUnrestricted(allowedDivisionIds)) {
      if (allowedDivisionIds.length === 0) {
        itemWhere.push('FALSE');
      } else {
        const placeholders = allowedDivisionIds.map((id) => {
          itemParams.push(id);
          return `$${itemParams.length}`;
        });
        itemWhere.push(`i.division_id IN (${placeholders.join(', ')})`);
      }
    }
    if (sectionId) { itemParams.push(sectionId); itemWhere.push(`i.section_id = $${itemParams.length}`); }
    if (departmentId) { itemParams.push(departmentId); itemWhere.push(`i.department_id = $${itemParams.length}`); }
    if (itemId) { itemParams.push(itemId); itemWhere.push(`i.id = $${itemParams.length}`); }
    if (uomId) {
      itemParams.push(uomId);
      itemWhere.push(`(i.base_uom_id = $${itemParams.length}
        OR EXISTS (SELECT 1 FROM production_entries upe WHERE upe.item_id = i.id AND upe.uom_id = $${itemParams.length}))`);
    }

    const items = await this.itemRepo.manager.query(
      `SELECT
         i.id, i.item_code, i.name, i.item_type, i.material_role_usage,
         i.weight, i.weight_per_piece, i.weight_per_meter, i.weight_uom_id,
         wu.code AS weight_uom_code,
         idv.id AS item_division_id, idv.name AS item_division_name,
         isec.id AS item_section_id, isec.name AS item_section_name,
         idept.id AS item_department_id, idept.name AS item_department_name,
         bu.id AS base_uom_id, bu.code AS base_uom_code
       FROM items i
       LEFT JOIN uoms wu ON wu.id = i.weight_uom_id
       LEFT JOIN divisions idv ON idv.id = i.division_id
       LEFT JOIN sections isec ON isec.id = i.section_id
       LEFT JOIN departments idept ON idept.id = i.department_id
       LEFT JOIN uoms bu ON bu.id = i.base_uom_id
       WHERE i.company_id = $1 AND i.is_active = true
         AND ${ITEM_TYPE_FILTER}
         AND ${itemWhere.join(' AND ')}
       ORDER BY idv.name, isec.name, idept.name, i.item_code`,
      itemParams,
    );

    // Real production aggregates (target/actual/scrap/hours) per item + UOM.
    // Org/date/shift/machine/order filters apply ONLY to the entries aggregated —
    // the Item Master rows themselves always survive (their values become zero).
    const aggWhere: string[] = ['pe.company_id = $1', 'pe.is_active = true'];
    const aggParams: unknown[] = [companyId];
    if (dateFrom) { aggParams.push(dateFrom); aggWhere.push(`pe.entry_date >= $${aggParams.length}`); }
    if (dateTo) { aggParams.push(dateTo); aggWhere.push(`pe.entry_date <= $${aggParams.length}`); }
    if (shiftId) { aggParams.push(shiftId); aggWhere.push(`pe.shift_id = $${aggParams.length}`); }
    if (machineNo) { aggParams.push(`%${machineNo}%`); aggWhere.push(`pe.machine_no ILIKE $${aggParams.length}`); }
    if (machineId) { aggParams.push(machineId); aggWhere.push(`pe.machine_id = $${aggParams.length}`); }
    if (productionOrderId) { aggParams.push(productionOrderId); aggWhere.push(`pe.production_order_id = $${aggParams.length}`); }
    // §16 — the aggregates behind those rows must also be division-scoped.
    if (allowedDivisionIds !== undefined && !isUnrestricted(allowedDivisionIds)) {
      if (allowedDivisionIds.length === 0) {
        aggWhere.push('FALSE');
      } else {
        const placeholders = allowedDivisionIds.map((id) => {
          aggParams.push(id);
          return `$${aggParams.length}`;
        });
        aggWhere.push(`pe.division_id IN (${placeholders.join(', ')})`);
      }
    }

    const agg = await this.itemRepo.manager.query(
      `SELECT
         pe.item_id, pe.uom_id, u.code AS uom_code,
         SUM(pe.target_quantity) AS target_quantity,
         SUM(pe.actual_quantity) AS actual_quantity,
         SUM(pe.scrap_quantity) AS scrap_quantity,
         SUM(pe.running_hours) AS running_hours,
         SUM(pe.downtime_hours) AS downtime_hours,
         SUM(COALESCE(NULLIF(sh.planned_hours, 0), pe.running_hours + pe.downtime_hours)) AS planned_hours,
         COUNT(*) AS entry_count
       FROM production_entries pe
       LEFT JOIN shifts sh ON sh.id = pe.shift_id
       LEFT JOIN uoms u ON u.id = pe.uom_id
       WHERE ${aggWhere.join(' AND ')}
       GROUP BY pe.item_id, pe.uom_id, u.code`,
      aggParams,
    );

    const aggByItem = new Map<string, any[]>();
    for (const row of agg) {
      const bucket = aggByItem.get(row.item_id) ?? [];
      bucket.push(row);
      aggByItem.set(row.item_id, bucket);
    }

    interface ItemGroup {
      itemId: string;
      itemCode: string;
      itemName: string;
      /** Item Master classification (RAW_MATERIAL, WORK_IN_PROGRESS, FINISHED_GOOD, …) — lets report tabs isolate raw-material scrap. */
      itemType: string;
      /** Material Role / Usage from the Item Master (e.g. 'Process Component Materials'). */
      materialRoleUsage: string;
      /** Item Master Division name (source of truth for mapping). */
      itemDivisionName: string;
      /** Item Master Section name. */
      itemSectionName: string;
      /** Item Master Department name. */
      itemDepartmentName: string;
      departmentId: string | null;
      divisionId: string | null;
      sectionId: string | null;
      uomId: string | null;
      uomCode: string;
      /** Item Master weight fields (passed through, null preserved — never computed, never zeroed). */
      baseWeight: number | null;
      weightPerPiece: number | null;
      weightPerMeter: number | null;
      weightUomCode: string | null;
      targetQuantity: number;
      actualQuantity: number;
      scrapQuantity: number;
      runningHours: number;
      downtimeHours: number;
      plannedHours: number;
      entryCount: number;
    }
    interface DeptGroup {
      departmentId: string;
      departmentCode: string;
      departmentName: string;
      divisionId: string | null;
      divisionName: string;
      sectionId: string | null;
      sectionName: string;
      itemsMap: Map<string, ItemGroup>;
    }

    const deptMap = new Map<string, DeptGroup>();

    const addToDept = (item: { divisionId: string | null; divisionName: string; sectionId: string | null; sectionName: string; departmentId: string | null; departmentName: string }, g: ItemGroup) => {
      const deptKey = item.departmentId ?? `unassigned-${item.divisionId ?? 'none'}-${item.sectionId ?? 'none'}`;
      let d = deptMap.get(deptKey);
      if (!d) {
        d = {
          departmentId: item.departmentId ?? deptKey,
          departmentCode: '',
          departmentName: item.departmentName ?? 'Unassigned',
          divisionId: item.divisionId,
          divisionName: item.divisionName || '–',
          sectionId: item.sectionId,
          sectionName: item.sectionName || '–',
          itemsMap: new Map(),
        };
        deptMap.set(deptKey, d);
      }
      d.itemsMap.set(`${g.itemId}:${g.uomId}`, g);
    };

    // Build one ItemGroup row per (item, uom): real aggregates from production
    // entries or COALESCE 0 for items without any transaction in scope.
    for (const it of items) {
      const base = {
        itemId: it.id,
        itemCode: it.item_code,
        itemName: it.name,
        itemType: it.item_type ?? '',
        materialRoleUsage: it.material_role_usage ?? '',
        itemDivisionName: it.item_division_name ?? '',
        itemSectionName: it.item_section_name ?? '',
        itemDepartmentName: it.item_department_name ?? '',
        departmentId: it.item_department_id ?? null,
        divisionId: it.item_division_id ?? null,
        sectionId: it.item_section_id ?? null,
      };
      const org = {
        divisionId: base.divisionId,
        divisionName: base.itemDivisionName,
        sectionId: base.sectionId,
        sectionName: base.itemSectionName,
        departmentId: base.departmentId,
        departmentName: base.itemDepartmentName,
      };
      const rows = aggByItem.get(it.id);
      if (rows && rows.length > 0) {
        for (const r of rows) {
addToDept(org, {
            ...base,
            uomId: r.uom_id ?? null,
            uomCode: r.uom_code ?? '',
            baseWeight: it.weight === null || it.weight === undefined ? null : Number(it.weight),
            weightPerPiece: it.weight_per_piece === null || it.weight_per_piece === undefined ? null : Number(it.weight_per_piece),
            weightPerMeter: it.weight_per_meter === null || it.weight_per_meter === undefined ? null : Number(it.weight_per_meter),
            weightUomCode: it.weight_uom_code ?? null,
            targetQuantity: Number(r.target_quantity),
            actualQuantity: Number(r.actual_quantity),
            scrapQuantity: Number(r.scrap_quantity),
            runningHours: Number(r.running_hours),
            downtimeHours: Number(r.downtime_hours),
            plannedHours: Number(r.planned_hours),
            entryCount: Number(r.entry_count),
          });
        }
      } else {
        // Relevant configured item with NO production/scrap transaction in scope
        // — must STILL appear with zero values (§7 hard requirement).
        addToDept(org, {
          ...base,
          uomId: it.base_uom_id ?? null,
          uomCode: it.base_uom_code ?? '',
          baseWeight: it.weight === null || it.weight === undefined ? null : Number(it.weight),
          weightPerPiece: it.weight_per_piece === null || it.weight_per_piece === undefined ? null : Number(it.weight_per_piece),
          weightPerMeter: it.weight_per_meter === null || it.weight_per_meter === undefined ? null : Number(it.weight_per_meter),
          weightUomCode: it.weight_uom_code ?? null,
          targetQuantity: 0,
          actualQuantity: 0,
          scrapQuantity: 0,
          runningHours: 0,
          downtimeHours: 0,
          plannedHours: 0,
          entryCount: 0,
        });
      }
    }

    const decorate = (g: ItemGroup) => {
      // Derived report values (never persisted): Actual KG derives from Item
      // Master weights; Scrap % is against Actual KG (never Actual PCS).
      const actualKg = calcActualKg(g.uomCode, g.actualQuantity, g.weightPerPiece, g.weightPerMeter);
      return {
        itemId: g.itemId,
        itemCode: g.itemCode,
        itemName: g.itemName,
        itemType: g.itemType,
        materialRoleUsage: g.materialRoleUsage,
        itemDivisionName: g.itemDivisionName,
        itemSectionName: g.itemSectionName,
        itemDepartmentName: g.itemDepartmentName,
        uomId: g.uomId,
        uomCode: g.uomCode,
        baseWeight: g.baseWeight,
        weightPerPiece: g.weightPerPiece,
        weightPerMeter: g.weightPerMeter,
        weightUomCode: g.weightUomCode,
        targetQuantity: this.round4(g.targetQuantity),
        actualQuantity: this.round4(g.actualQuantity),
        actualKg,
        scrapPct: calcScrapPct(g.scrapQuantity, actualKg),
        scrapQuantity: this.round4(g.scrapQuantity),
        runningHours: this.round2(g.runningHours),
        downtimeHours: this.round2(g.downtimeHours),
        plannedHours: this.round2(g.plannedHours),
        entryCount: g.entryCount,
        achievementPercentage: g.targetQuantity > 0 ? this.round2((g.actualQuantity / g.targetQuantity) * 100) : null,
        efficiencyPercentage: g.plannedHours > 0 ? this.round2((g.runningHours / g.plannedHours) * 100) : null,
      };
    };

    const departments = [...deptMap.values()].map((d) => {
      const itemsList = [...d.itemsMap.values()].map(decorate).sort((a, b) => a.itemCode.localeCompare(b.itemCode));
      return {
        departmentId: d.departmentId,
        departmentCode: d.departmentCode,
        departmentName: d.departmentName,
        divisionId: d.divisionId,
        divisionName: d.divisionName,
        sectionId: d.sectionId,
        sectionName: d.sectionName,
        items: itemsList,
        totalsByUom: [...new Set(itemsList.map((i) => i.uomCode))].map((uomCode) => {
          const groupItems = itemsList.filter((i) => i.uomCode === uomCode);
          const target = this.round4(groupItems.reduce((s, i) => s + i.targetQuantity, 0));
          const actual = this.round4(groupItems.reduce((s, i) => s + i.actualQuantity, 0));
          const planned = groupItems.reduce((s, i) => s + i.plannedHours, 0);
          return {
            uomCode,
            targetQuantity: target,
            actualQuantity: actual,
            scrapQuantity: this.round4(groupItems.reduce((s, i) => s + i.scrapQuantity, 0)),
            runningHours: this.round2(groupItems.reduce((s, i) => s + i.runningHours, 0)),
            downtimeHours: this.round2(groupItems.reduce((s, i) => s + i.downtimeHours, 0)),
            achievementPercentage: target > 0 ? this.round2((actual / target) * 100) : null,
            efficiencyPercentage: planned > 0 ? this.round2((groupItems.reduce((s, i) => s + i.runningHours, 0) / planned) * 100) : null,
            entryCount: groupItems.reduce((s, i) => s + i.entryCount, 0),
          };
        }),
      };
    });

    // Grand totals: aggregate ACROSS all departments per UOM (never sum across UOMs)
    const grandUomMap = new Map<string, ItemGroup>();
    for (const d of deptMap.values()) {
      for (const g of d.itemsMap.values()) {
        const key = `${g.itemId}:${g.uomId}`;
        const existing = grandUomMap.get(key);
        if (existing) {
          existing.targetQuantity += g.targetQuantity;
          existing.actualQuantity += g.actualQuantity;
          existing.scrapQuantity += g.scrapQuantity;
          existing.runningHours += g.runningHours;
          existing.downtimeHours += g.downtimeHours;
          existing.plannedHours += g.plannedHours;
          existing.entryCount += g.entryCount;
        } else {
          grandUomMap.set(key, { ...g });
        }
      }
    }
    const grandTotalsByUom = [...new Set([...grandUomMap.values()].map((g) => g.uomCode))].map((uomCode) => {
      const groups = [...grandUomMap.values()].filter((g) => g.uomCode === uomCode);
      const target = this.round4(groups.reduce((s, g) => s + g.targetQuantity, 0));
      const actual = this.round4(groups.reduce((s, g) => s + g.actualQuantity, 0));
      const running = this.round2(groups.reduce((s, g) => s + g.runningHours, 0));
      const planned = this.round2(groups.reduce((s, g) => s + g.plannedHours, 0));
      return {
        uomCode,
        targetQuantity: target,
        actualQuantity: actual,
        scrapQuantity: this.round4(groups.reduce((s, g) => s + g.scrapQuantity, 0)),
        runningHours: running,
        downtimeHours: this.round2(groups.reduce((s, g) => s + g.downtimeHours, 0)),
        plannedHours: planned,
        achievementPercentage: target > 0 ? this.round2((actual / target) * 100) : null,
        efficiencyPercentage: planned > 0 ? this.round2((running / planned) * 100) : null,
        entryCount: groups.reduce((s, g) => s + g.entryCount, 0),
      };
    });

    return {
      filters: filters ?? {},
      entryCount: agg.reduce((s: number, r: any) => s + Number(r.entry_count), 0),
      departments,
      grandTotalsByUom,
    };
  }

  // ─── Masters ────────────────────────────────────────────────────────────────

  async findMachines(
    companyId: string,
    filters?: { departmentId?: string; search?: string; allowedDivisionIds?: string[] },
  ): Promise<Machine[]> {
    const qb = this.machineRepo.createQueryBuilder('m')
      .leftJoinAndSelect('m.department', 'department')
      .where('m.companyId = :companyId', { companyId })
      .andWhere('m.isActive = true');
    if (filters?.departmentId) qb.andWhere('m.departmentId = :departmentId', { departmentId: filters.departmentId });
    if (filters?.search) qb.andWhere('(m.machineCode ILIKE :search OR m.name ILIKE :search)', { search: `%${filters.search}%` });
    applyDivisionScopeFilter(qb, 'm.divisionId', filters?.allowedDivisionIds);
    qb.orderBy('m.machineCode', 'ASC');
    return qb.getMany();
  }

  async createMachine(dto: CreateMachineDto, companyId: string, userId?: string): Promise<Machine> {
    let divisionId: string | null = null;
    let sectionId: string | null = null;
    if (dto.departmentId) {
      const department = await this.validateDepartment(dto.departmentId);
      divisionId = department.divisionId ?? null;
      sectionId = department.sectionId ?? null;
    }
    const existing = await this.machineRepo.findOne({
      where: { companyId, machineCode: dto.machineCode, isActive: true },
    });
    if (existing) throw new ConflictException(`Machine '${dto.machineCode}' already exists in this company`);
    const machine = this.machineRepo.create({
      companyId,
      machineCode: dto.machineCode,
      name: dto.name,
      departmentId: dto.departmentId ?? null,
      divisionId,
      sectionId,
      description: dto.description ?? null,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });
    const saved = await this.machineRepo.save(machine);
    // Canonical stable deep-link payload (same as MachineService.create)
    saved.qrPayload = `/production/machines/${saved.id}`;
    return this.machineRepo.save(saved);
  }

  async findShifts(companyId: string, departmentId?: string): Promise<Shift[]> {
    if (departmentId) {
      const targetShifts = await this.shiftRepo
        .createQueryBuilder('s')
        .innerJoin(
          'machine_targets',
          'mt',
          'mt.shift_id = s.id AND mt.is_active = true AND mt.status = :status',
          { status: 'ACTIVE' },
        )
        .innerJoin(
          'machines',
          'm',
          'mt.machine_id = m.id AND m.is_active = true AND m.department_id = :departmentId',
          { departmentId },
        )
        .where('s.company_id = :companyId AND s.is_active = true', { companyId })
        .orderBy('s.shift_code', 'ASC')
        .getMany();

      if (targetShifts.length > 0) {
        return targetShifts;
      }
    }

    return this.shiftRepo.find({
      where: { companyId, isActive: true },
      order: { shiftCode: 'ASC' },
    });
  }

  async findDowntimeReasons(companyId: string): Promise<DowntimeReason[]> {
    return this.downtimeReasonRepo.find({
      where: { companyId, isActive: true },
      order: { code: 'ASC' },
    });
  }

  /**
   * Duplicate-prevention UX: for a production date + shift combination, flag
   * every machine in the organizational scope as ENTERED or ENTRY_REQUIRED.
   * Purely advisory — the authoritative guard remains assertNoDuplicate()
   * (service) plus the partial unique index uq_prod_entries_unique_submission
   * (database). Matching is by machine_no (the same denormalized value the
   * duplicate check uses), case-insensitive.
   */
  async getMachineEntryStatus(
    companyId: string,
    filters: {
      entryDate: string;
      shiftId: string;
      divisionId?: string;
      sectionId?: string;
      departmentId?: string;
      allowedDivisionIds?: string[];
    },
  ): Promise<{
    data: Array<{
      id: string;
      systemCode: string;
      machineCode: string;
      name: string;
      status: 'ENTERED' | 'ENTRY_REQUIRED';
      entryCount: number;
      divisionId: string | null;
      sectionId: string | null;
      departmentId: string | null;
      departmentName: string | null;
      targetQuantity?: number | null;
      actualQuantity?: number;
      uom?: string | null;
      achievementPercentage?: number | null;
      variance?: number | null;
      entries: Array<{
        id: string;
        itemId: string;
        itemName: string | null;
        targetQuantity: number;
        actualQuantity: number;
        uom?: string | null;
      }>;
    }>;
    meta: {
      totalMachines: number;
      enteredCount: number;
      entryRequiredCount: number;
      entryDate: string;
      shiftId: string;
    };
  }> {
    const { entryDate, shiftId, divisionId, sectionId, departmentId, allowedDivisionIds } = filters;

    const shift = await this.shiftRepo.findOne({
      where: { id: shiftId, companyId, isActive: true },
    });
    if (!shift) {
      throw new BadRequestException(`Shift '${shiftId}' not found for this company`);
    }

    const machinesQb = this.machineRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.department', 'department')
      .where('m.companyId = :companyId', { companyId })
      .andWhere('m.isActive = true');
    if (divisionId) machinesQb.andWhere('m.divisionId = :divisionId', { divisionId });
    applyDivisionScopeFilter(machinesQb, 'm.divisionId', allowedDivisionIds);
    if (sectionId) machinesQb.andWhere('m.sectionId = :sectionId', { sectionId });
    if (departmentId) machinesQb.andWhere('m.departmentId = :departmentId', { departmentId });
    machinesQb.orderBy('m.machineCode', 'ASC');
    const machines = await machinesQb.getMany();

    const entriesQb = this.entryRepo
      .createQueryBuilder('pe')
      .leftJoin('pe.item', 'item')
      .leftJoin('pe.uom', 'uom')
      .select([
        'pe.id',
        'pe.machineNo',
        'pe.itemId',
        'pe.targetQuantity',
        'pe.actualQuantity',
        'item.name',
        'uom.code',
        'uom.symbol',
      ])
      .where('pe.companyId = :companyId', { companyId })
      .andWhere('pe.isActive = true')
      .andWhere('pe.entryDate = :entryDate', { entryDate })
      .andWhere('pe.shiftId = :shiftId', { shiftId });
    if (divisionId) entriesQb.andWhere('pe.divisionId = :divisionId', { divisionId });
    applyDivisionScopeFilter(entriesQb, 'pe.divisionId', allowedDivisionIds);
    if (sectionId) entriesQb.andWhere('pe.sectionId = :sectionId', { sectionId });
    if (departmentId) entriesQb.andWhere('pe.departmentId = :departmentId', { departmentId });
    const entries = await entriesQb.getMany();

    let activeTargets: any[] = [];
    if (typeof (this.machineTargetService as any)?.findActiveTargetsForShift === 'function') {
      try {
        activeTargets = await this.machineTargetService.findActiveTargetsForShift(
          companyId,
          shiftId,
          entryDate,
          machines.map((m) => m.id),
        );
      } catch {
        activeTargets = [];
      }
    }
    const targetsByMachineId = new Map<string, any>();
    for (const t of activeTargets) {
      if (t.machineId && !targetsByMachineId.has(t.machineId)) {
        targetsByMachineId.set(t.machineId, t);
      }
    }

    const entriesByMachineNo = new Map<string, ProductionEntry[]>();
    for (const e of entries) {
      const key = (e.machineNo ?? '').trim().toLowerCase();
      if (!key) continue;
      const bucket = entriesByMachineNo.get(key);
      if (bucket) bucket.push(e);
      else entriesByMachineNo.set(key, [e]);
    }

    const data = machines.map((m) => {
      const machineEntries = entriesByMachineNo.get(m.machineCode.trim().toLowerCase()) ?? [];
      const hasEntries = machineEntries.length > 0;
      const targetRecord = targetsByMachineId.get(m.id);

      let targetQuantity: number | null = null;
      let actualQuantity = 0;
      let uom: string | null = null;

      if (hasEntries) {
        actualQuantity = machineEntries.reduce((sum, e) => sum + Number(e.actualQuantity || 0), 0);
        targetQuantity = machineEntries.reduce((sum, e) => sum + Number(e.targetQuantity || 0), 0);
        const firstWithUom = machineEntries.find((e: any) => e.uom?.code || e.uom?.symbol);
        uom = (firstWithUom as any)?.uom?.code ?? (firstWithUom as any)?.uom?.symbol ?? targetRecord?.uom?.code ?? null;
      } else {
        actualQuantity = 0;
        targetQuantity = targetRecord ? Number(targetRecord.targetQuantity) : null;
        uom = targetRecord?.uom?.code ?? targetRecord?.uom?.symbol ?? null;
      }

      const achievementPercentage = targetQuantity && targetQuantity > 0
        ? Number(((actualQuantity / targetQuantity) * 100).toFixed(2))
        : null;

      const variance = targetQuantity !== null
        ? Number((actualQuantity - targetQuantity).toFixed(4))
        : null;

      return {
        id: m.id,
        systemCode: m.machineId,
        machineCode: m.machineCode,
        name: m.name,
        status: (hasEntries ? 'ENTERED' : 'ENTRY_REQUIRED') as 'ENTERED' | 'ENTRY_REQUIRED',
        entryCount: machineEntries.length,
        divisionId: m.divisionId,
        sectionId: m.sectionId,
        departmentId: m.departmentId,
        departmentName: m.department?.name ?? null,
        targetQuantity,
        actualQuantity,
        uom,
        achievementPercentage,
        variance,
        entries: machineEntries.map((e) => ({
          id: e.id,
          itemId: e.itemId,
          itemName: (e.item as { name?: string } | null)?.name ?? null,
          targetQuantity: Number(e.targetQuantity),
          actualQuantity: Number(e.actualQuantity),
          uom: (e.uom as any)?.code ?? (e.uom as any)?.symbol ?? null,
        })),
      };
    });

    const enteredCount = data.filter((d) => d.status === 'ENTERED').length;
    return {
      data,
      meta: {
        totalMachines: data.length,
        enteredCount,
        entryRequiredCount: data.length - enteredCount,
        entryDate,
        shiftId,
      },
    };
  }

  // ─── Commands ───────────────────────────────────────────────────────────────

  /**
   * PROMPT-11: everything the Daily Entry form needs in ONE call —
   * machine-target resolution (item-aware), the shift's planned hours and,
   * when available, the item's effective production route.
   * Route absence is NOT an error: daily entries are valid without routing.
   */
  async resolveEntryContext(
    companyId: string,
    query: { machineId?: string; shiftId?: string; productionDate?: string; itemId?: string; uomId?: string },
  ): Promise<any> {
    const resolution = await this.machineTargetService.resolve(query as any, companyId);
    const shift = query.shiftId
      ? await this.shiftRepo.findOne({ where: { id: query.shiftId, companyId } })
      : null;
    const effectiveItemId = query.itemId ?? resolution.item?.id ?? null;
    let route: any = null;
    if (effectiveItemId) {
      try {
        route = await this.productionRoutingService.getEffectiveRouteForItem(effectiveItemId, companyId);
      } catch {
        route = null;
      }
    }
    return {
      ...resolution,
      plannedHours: Number(shift?.plannedHours ?? 0),
      route,
    };
  }

  async create(
    dto: CreateProductionEntryDto,
    companyId: string,
    userId?: string,
    allowedDivisionIds?: string[],
  ): Promise<ProductionEntry> {
    // §19 — never trust a client-supplied division id.
    this.assertDivisionAccess(allowedDivisionIds, dto.divisionId, 'production entry');
    // ERP-00016: resolve the machine target FIRST so the final UOM/target feed
    // the standard validations (target governs the entry UOM when linked).
    const mt = await this.resolveMachineTarget(companyId, {
      machineId: dto.machineId ?? null,
      shiftId: dto.shiftId,
      entryDate: dto.entryDate,
      workingHours: dto.runningHours,
      itemId: dto.itemId,
      requestedUomId: dto.uomId ?? null,
      manualTargetQuantity: dto.targetQuantity,
    });

    const resolved = await this.validateAndResolve(companyId, {
      divisionId: dto.divisionId,
      sectionId: dto.sectionId,
      departmentId: dto.departmentId,
      entryDate: dto.entryDate,
      shiftId: dto.shiftId,
      machineId: dto.machineId ?? null,
      machineNo: dto.machineNo ?? null,
      itemId: dto.itemId,
      uomId: mt ? mt.uomId : (dto.uomId as string),
      productionOrderId: dto.productionOrderId ?? null,
      productionOrderOperationId: dto.productionOrderOperationId ?? null,
      downtimeReasonId: dto.downtimeReasonId ?? null,
      targetQuantity: mt ? mt.calculatedTarget : (dto.targetQuantity as number),
      actualQuantity: dto.actualQuantity,
      scrapQuantity: dto.scrapQuantity,
      runningHours: dto.runningHours,
      downtimeHours: dto.downtimeHours,
      postToInventory: dto.postToInventory ?? false,
      warehouseId: dto.warehouseId ?? null,
    }, { uomExempt: !!mt });

    if (this.isHandPackingRef(resolved.machineNo) || this.isHandPackingRef(dto.remarks)) {
      const batchCode = (dto.remarks?.match(/Batch:\s*([A-Za-z0-9-_]+)/i)?.[1]) || 'PKG';
      resolved.machineNo = `HAND-PACK-${batchCode}-${Date.now()}`;
    }

    await this.assertNoDuplicate(companyId, dto.departmentId, dto.entryDate, dto.shiftId, resolved.machineNo, dto.itemId, dto.remarks);

    // Raw Material Source Warehouse — where the exact Item Master production IN
    // items are deducted when the entry posts to inventory. TASK #37: resolved
    // server-side (explicit value validated, else the company's ACTIVE
    // RAW_MATERIAL store, else its first ACTIVE warehouse) — never hardcoded.
    const requestedSource = dto.rawMaterialWarehouseId ?? null;
    if (requestedSource) {
      await this.validateRawMaterialWarehouse(requestedSource, companyId);
    }
    const sourceStoreId = resolved.shouldPostInventory
      ? await this.resolveRawMaterialSourceStore(companyId, requestedSource)
      : null;

    let ot = dto.overtimeHours ? Number(dto.overtimeHours) : 0;
    if (ot <= 0) {
      const match = dto.remarks?.match(/OT:\s*(\d+(?:\.\d+)?)\s*h/i);
      if (match) {
        ot = Number(match[1]);
      } else {
        // PHASE 4 — derived OT counts TOTAL duty hours (running + downtime),
        // so a breakdown hour never eats overtime. See deriveOvertime().
        ot = this.deriveOvertime(dto.runningHours, dto.downtimeHours, resolved.plannedHours);
      }
    }
    const totalPlanned = (resolved.plannedHours > 0) ? (resolved.plannedHours + ot) : 0;
    const effectiveRunning = (totalPlanned > 0 && dto.downtimeHours > 0 && (dto.runningHours + dto.downtimeHours > totalPlanned))
      ? this.round2(Math.max(0, totalPlanned - dto.downtimeHours))
      : dto.runningHours;

    const entry = this.entryRepo.create({
      companyId,
      entryNumber: await this.generateEntryNumber(companyId),
      productionOrderId: dto.productionOrderId ?? null,
      productionOrderOperationId: dto.productionOrderOperationId ?? null,
      divisionId: dto.divisionId,
      sectionId: dto.sectionId,
      departmentId: dto.departmentId,
      entryDate: dto.entryDate,
      shiftId: dto.shiftId,
      machineId: dto.machineId ?? null,
      machineNo: resolved.machineNo,
      operatorName: dto.operatorName.trim(),
      supervisorName: dto.supervisorName?.trim() ?? null,
      coilSize: dto.coilSize?.trim() ?? null,
      itemId: dto.itemId,
      uomId: mt ? mt.uomId : (dto.uomId as string),
      targetQuantity: mt ? mt.calculatedTarget : (dto.targetQuantity as number),
      machineTargetId: (mt?.machineTargetId && mt.machineTargetId !== '00000000-0000-0000-0000-000000000000') ? mt.machineTargetId : null,
      standardHours: mt?.standardHours ?? null,
      calculatedTarget: mt?.calculatedTarget ?? null,
      actualQuantity: dto.actualQuantity,
      achievementPercentage: this.computeAchievement(
        dto.actualQuantity,
        mt ? mt.calculatedTarget : (dto.targetQuantity as number),
      ),
      efficiencyPercentage: this.computeEfficiency(effectiveRunning, totalPlanned > 0 ? totalPlanned : resolved.plannedHours),
      runningHours: effectiveRunning,
      overtimeHours: ot,
      downtimeHours: dto.downtimeHours,
      downtimeReasonId: dto.downtimeReasonId ?? null,
      downtimeReasonText: dto.downtimeReason ?? null,
      scrapQuantity: dto.scrapQuantity,
      remarks: dto.remarks ?? null,
      rawMaterialWarehouseId: sourceStoreId,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });

    let saved: ProductionEntry;
    if (resolved.shouldPostInventory) {
      // Atomic: entry creation + inventory posting in one transaction. If the
      // posting fails (insufficient stock, unknown source store, etc.) the entry
      // row is rolled back too — no orphaned/unposted production records. Every
      // production item (max 2, independent) posts its own OUT/IN pair.
      saved = await this.entryRepo.manager.transaction(async (manager) => {
        const saved = await manager.getRepository(ProductionEntry).save(entry);
        await this.postInventoryAndConsume(
          manager, companyId, saved, resolved.warehouseId!, sourceStoreId,
          onlyOutputLines(dto.items) ?? [], userId, dto.componentWarehouses,
        );
        return saved;
      });
    } else {
      saved = await this.entryRepo.save(entry);
    }

    await this.persistChildren(saved.id, companyId, onlyOutputLines(dto.items) ?? [], dto.downtimes ?? [], userId, false);

    // Auto-create centralized barcode registry entry
    try {
      await this.barcodeService.ensureBarcodeForEntity(
        companyId,
        BarcodeEntityType.PRODUCTION_ENTRY,
        saved.id,
        `PE-${saved.id.substring(0, 8)}`,
        `Production Entry ${saved.entryDate}`,
        userId,
      );
    } catch (err) {
      this.logger.warn(`Failed to create centralized barcode for production entry ${saved.id}: ${err}`);
    }

    return saved;
  }

  async update(
    id: string,
    dto: UpdateProductionEntryDto,
    companyId: string,
    userId?: string,
    allowedDivisionIds?: string[],
  ): Promise<ProductionEntry> {
    const entry = await this.getRawEntry(id, companyId);
    // §19 — a CCD-scoped user must not be able to edit an SPD record.
    this.assertDivisionAccess(allowedDivisionIds, entry.divisionId, 'production entry');

    const merged = {
      divisionId: dto.divisionId ?? entry.divisionId,
      sectionId: dto.sectionId ?? entry.sectionId,
      departmentId: dto.departmentId ?? entry.departmentId,
      entryDate: dto.entryDate ?? entry.entryDate,
      shiftId: dto.shiftId ?? entry.shiftId,
      machineId: dto.machineId !== undefined ? dto.machineId : entry.machineId,
      machineNo: dto.machineNo ?? entry.machineNo,
      itemId: dto.itemId ?? entry.itemId,
      uomId: dto.uomId ?? entry.uomId,
      productionOrderId: dto.productionOrderId !== undefined ? dto.productionOrderId : entry.productionOrderId,
      productionOrderOperationId: dto.productionOrderOperationId !== undefined ? dto.productionOrderOperationId : entry.productionOrderOperationId,
      downtimeReasonId: dto.downtimeReasonId !== undefined ? dto.downtimeReasonId : entry.downtimeReasonId,
      targetQuantity: dto.targetQuantity ?? Number(entry.targetQuantity),
      actualQuantity: dto.actualQuantity ?? Number(entry.actualQuantity),
      scrapQuantity: dto.scrapQuantity ?? Number(entry.scrapQuantity),
      runningHours: dto.runningHours ?? Number(entry.runningHours),
      overtimeHours: dto.overtimeHours !== undefined ? Number(dto.overtimeHours) : Number(entry.overtimeHours || 0),
      downtimeHours: dto.downtimeHours ?? Number(entry.downtimeHours),
      rawMaterialWarehouseId: dto.rawMaterialWarehouseId !== undefined ? (dto.rawMaterialWarehouseId ?? null) : entry.rawMaterialWarehouseId ?? null,
    };
    // §19 — moving an existing record INTO a division must also be authorized.
    this.assertDivisionAccess(allowedDivisionIds, merged.divisionId, 'production entry');

    // ERP-00016: re-resolve the target when machine/shift/date/hours changed.
    const mt = await this.resolveMachineTarget(companyId, {
      machineId: merged.machineId,
      shiftId: merged.shiftId,
      entryDate: merged.entryDate,
      workingHours: merged.runningHours,
      itemId: merged.itemId,
      requestedUomId: merged.uomId,
      manualTargetQuantity: dto.targetQuantity,
    });
    if (mt) {
      merged.uomId = mt.uomId;
      merged.targetQuantity = mt.calculatedTarget;
    }

    const resolved = await this.validateAndResolve(companyId, merged, { uomExempt: !!mt });

    const duplicateExcluding = await this.entryRepo
      .createQueryBuilder('pe')
      .where('pe.companyId = :companyId', { companyId })
      .andWhere('pe.departmentId = :departmentId', { departmentId: merged.departmentId })
      .andWhere('pe.entryDate = :entryDate', { entryDate: merged.entryDate })
      .andWhere('pe.shiftId = :shiftId', { shiftId: merged.shiftId })
      .andWhere('pe.machineNo = :machineNo', { machineNo: resolved.machineNo })
      .andWhere('pe.itemId = :itemId', { itemId: merged.itemId })
      .andWhere('pe.id != :id', { id })
      .andWhere('pe.isActive = true')
      .getOne();
    if (duplicateExcluding) {
      throw new ConflictException(
        `Another active entry already exists for this department/date/shift/machine/item (${duplicateExcluding.id})`,
      );
    }

    let ot = merged.overtimeHours ? Number(merged.overtimeHours) : 0;
    if (ot <= 0) {
      const match = (dto.remarks ?? entry.remarks)?.match(/OT:\s*(\d+(?:\.\d+)?)\s*h/i);
      if (match) {
        ot = Number(match[1]);
      } else {
        // PHASE 4 — same canonical rule as create: duty (running + downtime)
        // minus the shift's planned hours. Breakdown must not reduce OT.
        ot = this.deriveOvertime(merged.runningHours, merged.downtimeHours, resolved.plannedHours);
      }
    }
    const totalPlanned = (resolved.plannedHours > 0) ? (resolved.plannedHours + ot) : 0;
    const effectiveRunning = (totalPlanned > 0 && merged.downtimeHours > 0 && (merged.runningHours + merged.downtimeHours > totalPlanned))
      ? this.round2(Math.max(0, totalPlanned - merged.downtimeHours))
      : merged.runningHours;

    // ── DELTA SNAPSHOT ────────────────────────────────────────────────────────
    // Captured BEFORE the entity is overwritten, so every comparison below is
    // against the ORIGINAL persisted values and never against the incoming
    // payload. Reading them after Object.assign made "old" === "new", which is
    // why the ledger could not tell an unchanged entry from a re-quantified one.
    const prevActual = Number(entry.actualQuantity);
    const prevScrap = Number(entry.scrapQuantity);
    const prevItemId = entry.itemId;
    // INPUT audit lines belong to the posting path, never to the client. They
    // are recognised both by the lineNumber convention and by identity, so a
    // payload that echoes them back without a lineNumber still cannot
    // re-classify raw-material consumption as production output.
    let childRows: ProductionEntryItem[] = [];
    try {
      childRows = await this.entryItemRepo.find({ where: { productionEntryId: entry.id } });
    } catch { /* child table may not exist for legacy entries */ }
    const auditLineIds = new Set(
      childRows
        .filter((row) => row.entryKind === ProductionEntryItemKind.INPUT
          || Number(row.lineNumber ?? 0) >= INPUT_AUDIT_LINE_NUMBER)
        .map((row) => String(row.id)),
    );
    const requestedItems = onlyOutputLines(dto.items, auditLineIds);

    Object.assign(entry, {
      ...merged,
      runningHours: effectiveRunning,
      overtimeHours: ot,
      machineNo: resolved.machineNo,
      operatorName: dto.operatorName?.trim() ?? entry.operatorName,
      supervisorName: dto.supervisorName !== undefined ? (dto.supervisorName?.trim() ?? null) : entry.supervisorName,
      coilSize: dto.coilSize !== undefined ? (dto.coilSize?.trim() ?? null) : entry.coilSize,
      machineTargetId: (mt?.machineTargetId && mt.machineTargetId !== '00000000-0000-0000-0000-000000000000') ? mt.machineTargetId : null,
      standardHours: mt?.standardHours ?? null,
      calculatedTarget: mt?.calculatedTarget ?? null,
      achievementPercentage: this.computeAchievement(merged.actualQuantity, merged.targetQuantity),
      efficiencyPercentage: this.computeEfficiency(effectiveRunning, totalPlanned > 0 ? totalPlanned : resolved.plannedHours),
      downtimeReasonText: dto.downtimeReason !== undefined ? (dto.downtimeReason ?? null) : entry.downtimeReasonText,
      remarks: dto.remarks !== undefined ? (dto.remarks ?? null) : entry.remarks,
      updatedBy: userId ?? null,
    });

    const quantityOrItemChanged = (dto.actualQuantity !== undefined && Number(dto.actualQuantity) !== prevActual)
      || (dto.scrapQuantity !== undefined && Number(dto.scrapQuantity) !== prevScrap)
      || (dto.itemId !== undefined && dto.itemId !== prevItemId)
      || (requestedItems !== undefined && requestedItems.length > 0);
    // Nothing that feeds inventory moved and no line collection was supplied
    // (e.g. a remarks-only PATCH) → do not touch the ledger at all.
    const reconcile = !!resolved.warehouseId && (quantityOrItemChanged || requestedItems !== undefined);
    const outputLines: OutputLine[] = requestedItems ?? [];

    const saved = await this.entryRepo.manager.transaction(async (manager) => {
      let previous: PostedMovements | null = null;

      if (reconcile) {
        // What this document has ALREADY posted — the "original stored value"
        // every delta is measured against. Never the live balance: that one
        // already includes this entry, which is what caused the double
        // deduction when the edit screen re-read it as a fresh baseline.
        previous = await this.readPostedMovements(manager, companyId, entry.id);
        const posted = entry.inventoryReferenceId != null || previous.seen;
        if (posted && !previous.reliable) {
          // The prior state cannot be reconstructed (reversal rows whose origin
          // is unreadable): restate the document — reverse everything first,
          // then post the new quantities. Net stock movement is still exact.
          await this.reverseInventoryPostings(manager, entry, companyId, userId);
          entry.inventoryReferenceId = null;
        }
      }

      const updated = await manager.getRepository(ProductionEntry).save(entry);
      await this.persistChildren(updated.id, companyId, requestedItems, dto.downtimes, userId, true);

      if (!reconcile || !resolved.warehouseId || !previous) return updated;

      const posted = entry.inventoryReferenceId != null || previous.seen;
      if (!posted) {
        // Never entered the ledger: post it once, exactly as create() does.
        if (quantityOrItemChanged) {
          await this.postInventoryAndConsume(
            manager, companyId, updated, resolved.warehouseId, merged.rawMaterialWarehouseId,
            outputLines, userId,
          );
        }
        return updated;
      }

      if (previous.reliable) {
        const plan = await this.planInventoryPostings(
          manager, companyId, updated, merged.rawMaterialWarehouseId, outputLines, userId,
        );
        await this.applyInventoryDelta(
          manager, companyId, updated, outputLines, resolved.warehouseId,
          merged.rawMaterialWarehouseId, previous, plan, userId,
        );
      } else {
        await this.postInventoryAndConsume(
          manager, companyId, updated, resolved.warehouseId, merged.rawMaterialWarehouseId,
          outputLines, userId,
        );
      }
      return updated;
    });

    return saved;
  }

  // ─── Multi-item / multi-downtime child persistence ──────────────────────────

  private async persistChildren(
    entryId: string,
    companyId: string,
    items?: Array<{ lineNumber?: number; itemId?: string | null; uomId?: string | null; targetQuantity?: number; actualQuantity?: number; scrapQuantity?: number; runningHours?: number; routingCode?: string | null; remarks?: string | null }>,
    downtimes?: Array<{ lineNumber?: number; downtimeReasonId?: string | null; downtimeReason?: string | null; downtimeHours: number; remarks?: string | null }>,
    userId?: string,
    replace = false,
  ): Promise<void> {
    if (replace) {
      // PATCH semantics (TASK #39 round-trip): only replace a child collection
      // when the request actually carries it. Omitting the array must never wipe
      // persisted child rows — this is what made a remarks-only PATCH silently
      // delete every production item + downtime line of an entry.
      if (items !== undefined) await this.entryItemRepo.delete({ productionEntryId: entryId });
      if (downtimes !== undefined) await this.entryDowntimeRepo.delete({ productionEntryId: entryId });
    }
    if (items && items.length) {
      const rows = items.map((it, idx) =>
        this.entryItemRepo.create({
          companyId,
          productionEntryId: entryId,
          lineNumber: it.lineNumber ?? idx + 1,
          itemId: it.itemId ?? null,
          uomId: it.uomId ?? null,
          targetQuantity: it.targetQuantity ?? 0,
          actualQuantity: it.actualQuantity ?? 0,
          scrapQuantity: it.scrapQuantity ?? 0,
          runningHours: it.runningHours ?? 0,
          routingCode: it.routingCode ?? null,
          remarks: it.remarks ?? null,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        }),
      );
      await this.entryItemRepo.save(rows);
    }
    if (downtimes && downtimes.length) {
      const rows = downtimes.map((dt, idx) =>
        this.entryDowntimeRepo.create({
          companyId,
          productionEntryId: entryId,
          lineNumber: dt.lineNumber ?? idx + 1,
          downtimeReasonId: dt.downtimeReasonId ?? null,
          downtimeReasonText: dt.downtimeReason ?? null,
          downtimeHours: dt.downtimeHours ?? 0,
          remarks: dt.remarks ?? null,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        }),
      );
      await this.entryDowntimeRepo.save(rows);
    }
  }

  // ─── Edit-mode inventory reconciliation (delta ledger) ─────────────────────

  /**
   * Reads back everything this entry has ALREADY posted, net of its reversals.
   * This is the "original stored value" every edit delta is measured against —
   * never the live balance, which already reflects this document.
   */
  private async readPostedMovements(
    manager: EntityManager,
    companyId: string,
    entryId: string,
  ): Promise<PostedMovements> {
    const movements: PostedMovements = {
      receipts: new Map(),
      consumptions: new Map(),
      scraps: new Map(),
      uoms: new Map(),
      reliable: true,
      seen: false,
    };
    let rows: Array<Record<string, any>> = [];
    try {
      rows = await manager.query(
        `SELECT transaction_type, item_id, warehouse_id, uom_id, quantity, direction, notes
           FROM stock_ledger
          WHERE company_id = $1 AND reference_type = $2 AND reference_id = $3`,
        [companyId, ENTRY_REFERENCE_TYPE, entryId],
      );
    } catch (err) {
      // Without the prior state no delta can be trusted — the caller falls back
      // to restating the entry (reverse + repost) rather than guessing.
      this.logger.warn(`Could not read prior stock movements for production entry ${entryId}: ${err}`);
      movements.reliable = false;
      return movements;
    }

    const bucketFor = (type: string): MovementBucket | null => {
      if (type === 'PRODUCTION_RECEIPT') return movements.receipts;
      if (type === 'PRODUCTION_CONSUMPTION') return movements.consumptions;
      if (type === 'PRODUCTION_SCRAP') return movements.scraps;
      return null;
    };
    /** Direction a movement family is posted in when it is NOT a reversal. */
    const naturalDirection = (type: string): string =>
      type === 'PRODUCTION_RECEIPT' ? 'IN' : 'OUT';

    for (const row of rows) {
      const qty = Number(row.quantity) || 0;
      if (qty <= 0) continue;
      const itemId = String(row.item_id ?? '');
      const warehouseId = String(row.warehouse_id ?? '');
      if (!itemId || !warehouseId) {
        movements.reliable = false;
        continue;
      }
      movements.seen = true;
      const key = movementKey(itemId, warehouseId);
      if (row.uom_id && !movements.uoms.has(key)) movements.uoms.set(key, String(row.uom_id));

      let type = String(row.transaction_type ?? '');
      let sign = 1;
      if (type === 'PRODUCTION_REVERSAL') {
        // The reversed family is only recoverable from the note written when the
        // reversal was raised. If that cannot be read the entry's true prior
        // state is unknown, and the caller must restate it the safe way.
        const parsed = /^Reversal of ([A-Z_]+)\b/.exec(String(row.notes ?? ''));
        if (!parsed) {
          movements.reliable = false;
          continue;
        }
        type = parsed[1];
        sign = -1;
      } else if (String(row.direction ?? '') !== naturalDirection(type)) {
        sign = -1;
      }
      const bucket = bucketFor(type);
      if (!bucket) continue;
      bumpBucket(bucket, key, sign * qty);
    }
    return movements;
  }

  /**
   * Rewrites the INPUT audit lines so the entry keeps an exact per-store record
   * of what it deducted (the edit screen reads them back as "Consumed (This
   * Entry)"). `persistChildren` drops every child row on save, so this restores
   * them from the plan even when the ledger itself did not move.
   */
  private async writeInputAuditLines(
    companyId: string,
    entry: ProductionEntry,
    consumed: Array<{ itemId: string; uomId: string | null; quantity: number; warehouseId: string }>,
    routingCode: string | null,
    userId?: string,
  ): Promise<void> {
    await this.entryItemRepo.delete({ productionEntryId: entry.id, entryKind: ProductionEntryItemKind.INPUT });
    if (!consumed.length) return;

    const byItem = new Map<string, { itemId: string; uomId: string | null; quantity: number; warehouseId: string }>();
    for (const line of consumed) {
      const key = `${line.itemId}|${line.warehouseId}`;
      const existing = byItem.get(key);
      if (existing) existing.quantity += line.quantity;
      else byItem.set(key, { ...line });
    }
    const rows = [...byItem.values()].map((line, idx) =>
      this.entryItemRepo.create({
        companyId,
        productionEntryId: entry.id,
        lineNumber: INPUT_AUDIT_LINE_NUMBER + (idx + 1) * 10,
        entryKind: ProductionEntryItemKind.INPUT,
        itemId: line.itemId,
        uomId: line.uomId,
        sourceWarehouseId: line.warehouseId,
        targetQuantity: this.round4(line.quantity),
        actualQuantity: this.round4(line.quantity),
        scrapQuantity: 0,
        runningHours: 0,
        routingCode,
        remarks: 'Routing-configured raw material consumption (exact item)',
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      }),
    );
    await this.entryItemRepo.save(rows);
  }

  /**
   * Computes what this entry WOULD consume, without touching the ledger.
   * Stock is deliberately not validated here: an edit only has to cover the
   * DELTA it adds, which `applyInventoryDelta` checks against the live balance.
   */
  private async planInventoryPostings(
    manager: EntityManager,
    companyId: string,
    entry: ProductionEntry,
    sourceStoreId: string | null,
    lines: OutputLine[],
    userId?: string,
    componentWarehouses?: Array<{ itemId: string; warehouseId: string }>,
  ): Promise<{
    lines: Array<{ itemId: string; uomId: string | null; warehouseId: string; quantity: number }>;
    routingCode: string | null;
  }> {
    const routing = await this.safeGetEffectiveRouting(companyId, entry.itemId);
    const outputs = this.buildProductionOutputs(entry, lines);
    const planned: Array<{ itemId: string; uomId: string | null; warehouseId: string; quantity: number }> = [];

    for (const output of outputs) {
      if (Number(output.actualQuantity) <= 0 && Number(output.scrapQuantity || 0) <= 0) continue;
      const configuredInputs = this.resolveRoutingInputsForOutput(routing, output.itemId);
      const consumed = await this.consumeForProductionItem(
        manager, companyId, output, entry, sourceStoreId, configuredInputs, userId, componentWarehouses, true,
      );
      for (const line of consumed) {
        planned.push({ itemId: line.itemId, uomId: line.uomId, warehouseId: line.warehouseId, quantity: line.required });
      }
    }
    return { lines: planned, routingCode: (routing as any)?.routingCode ?? null };
  }

  /**
   * A stock-movement UOM is mandatory (`stock_ledger.uom_id` and
   * `inventory_balances.uom_id` are foreign keys). Prefer the UOM the delta was
   * planned or originally posted in, then the component's base UOM, then the
   * entry's own UOM — never an empty/unknown id.
   */
  private async resolveMovementUomId(
    entry: ProductionEntry,
    itemId: string,
    uomId: string | null | undefined,
  ): Promise<string> {
    if (uomId) return uomId;
    try {
      const component = await this.itemRepo.findOne({ where: { id: itemId }, select: ['id', 'baseUomId'] });
      if (component?.baseUomId) return component.baseUomId;
    } catch { /* fall through */ }
    return entry.uomId;
  }

  /**
   * DELTA RECONCILIATION — adjusts `stock_ledger` by exactly
   *
   *     Delta = New Entered Quantity − Original Stored Quantity
   *
   * instead of blindly re-posting the whole document. Consequences:
   *
   *   • an unchanged entry writes ZERO ledger rows;
   *   • 100 → 105 KG moves stock by 5 KG, not by a 100-out/105-in churn;
   *   • nothing is reversed first, so a half-applied edit can never double
   *     deplete the raw-material store.
   *
   * Reductions are written as `PRODUCTION_REVERSAL` rows (the movement family
   * the system already understands) so later reads net them out correctly.
   */
  private async applyInventoryDelta(
    manager: EntityManager,
    companyId: string,
    entry: ProductionEntry,
    lines: OutputLine[],
    receiptWarehouseId: string,
    sourceStoreId: string | null,
    previous: PostedMovements,
    plan: { lines: Array<{ itemId: string; uomId: string | null; warehouseId: string; quantity: number }>; routingCode: string | null },
    userId?: string,
  ): Promise<void> {
    // ── 1. What the entry posts NOW ───────────────────────────────────────
    const newReceipts: MovementBucket = new Map();
    const newScraps: MovementBucket = new Map();
    const newUoms = new Map<string, string | null>();
    for (const output of this.buildProductionOutputs(entry, lines)) {
      const actual = Number(output.actualQuantity) || 0;
      const scrap = Number(output.scrapQuantity) || 0;
      const key = movementKey(output.itemId, receiptWarehouseId);
      if (actual > 0) {
        bumpBucket(newReceipts, key, actual);
        newUoms.set(key, output.uomId);
      }
      if (scrap > 0) bumpBucket(newScraps, key, scrap);
    }
    const newConsumptions: MovementBucket = new Map();
    for (const line of plan.lines) {
      const key = movementKey(line.itemId, line.warehouseId);
      bumpBucket(newConsumptions, key, line.quantity);
      if (line.uomId) newUoms.set(key, line.uomId);
    }

    // ── 2. Diff the two states ────────────────────────────────────────────
    const diffFamily = (
      family: 'receipt' | 'consumption' | 'scrap',
      before: MovementBucket,
      after: MovementBucket,
    ): Array<DeltaLine> => {
      const keys = new Set([...before.keys(), ...after.keys()]);
      const out: DeltaLine[] = [];
      for (const key of keys) {
        const [itemId, warehouseId] = key.split('|');
        const oldQty = before.get(key) ?? 0;
        const newQty = after.get(key) ?? 0;
        if (Math.abs(newQty - oldQty) < 1e-9) continue;
        out.push({
          family,
          itemId,
          warehouseId,
          oldQty,
          newQty,
          uomId: newUoms.get(key) ?? previous.uoms.get(key) ?? null,
        });
      }
      return out;
    };

    const deltas = [
      ...diffFamily('receipt', previous.receipts, newReceipts),
      ...diffFamily('consumption', previous.consumptions, newConsumptions),
      ...diffFamily('scrap', previous.scraps, newScraps),
    ];

    // Restore the consumption audit lines regardless: the ledger may be flat
    // while the child rows were just replaced by `persistChildren`.
    await this.writeInputAuditLines(companyId, entry, plan.lines, plan.routingCode, userId);
    if (!deltas.length) return;

    // ── 3. Validate every NEW deduction before writing anything ───────────
    for (const delta of deltas) {
      const change = delta.newQty - delta.oldQty;
      if (delta.family !== 'consumption' || change <= 0) continue;
      const available = await this.inventoryBalanceService.getAvailableStock(
        companyId, delta.itemId, delta.warehouseId, undefined, undefined, manager,
      );
      if (available + 1e-6 < change) {
        const component = await this.itemRepo.findOne({ where: { id: delta.itemId }, relations: ['baseUom'] });
        const uomCode = component?.baseUom?.code ?? '';
        throw new BadRequestException(
          `Raw material stock is insufficient. Required: ${this.round4(change)} ${uomCode} | Available: ${this.round4(available)} ${uomCode}`,
        );
      }
    }

    // ── 4. Post only the difference ───────────────────────────────────────
    let referenceId = entry.inventoryReferenceId;
    for (const delta of deltas) {
      const change = this.round4(delta.newQty - delta.oldQty);
      if (Math.abs(change) < 1e-9) continue;

      const increasing = change > 0;
      const quantity = Math.abs(change);
      const familyType = delta.family === 'receipt'
        ? 'PRODUCTION_RECEIPT'
        : delta.family === 'consumption' ? 'PRODUCTION_CONSUMPTION' : 'PRODUCTION_SCRAP';
      const direction: 'IN' | 'OUT' = delta.family === 'receipt'
        ? (increasing ? 'IN' : 'OUT')
        : (increasing ? 'OUT' : 'IN');

      const uomId = await this.resolveMovementUomId(entry, delta.itemId, delta.uomId);

      const posted = await this.stockLedgerService.create({
        companyId,
        transactionType: increasing ? familyType : 'PRODUCTION_REVERSAL',
        itemId: delta.itemId,
        warehouseId: delta.warehouseId,
        quantity,
        uomId,
        direction,
        referenceType: ENTRY_REFERENCE_TYPE,
        referenceId: entry.id,
        referenceNumber: entry.entryNumber || undefined,
        notes: increasing
          ? `Inventory delta for production entry (${entry.machineNo}, ${entry.entryDate})`
          : `Reversal of ${familyType} for production entry (${entry.machineNo}, ${entry.entryDate})`,
        createdBy: userId ?? undefined,
      }, manager);

      // Scrap is an audit trail: posting it never moved the balance, so its
      // adjustment must not either (this used to inflate finished-goods stock
      // on every edit).
      if (delta.family !== 'scrap') {
        await this.inventoryBalanceService.updateBalance(
          companyId, delta.itemId, delta.warehouseId, null, null, uomId, quantity, direction, manager,
        );
      }

      if (delta.family === 'receipt' && increasing && !referenceId) {
        entry.inventoryReferenceId = posted.id;
        await manager.getRepository(ProductionEntry).update(entry.id, { inventoryReferenceId: posted.id });
        referenceId = posted.id;
      }
    }
  }

  /**
   * Reverses any posted stock movements (receipt, scrap, consumption) for this entry.
   * Restores consumed raw materials back into the source store and removes finished output.
   */
  private async reverseInventoryPostings(
    manager: EntityManager,
    entry: ProductionEntry,
    companyId: string,
    userId?: string,
  ): Promise<void> {
    try {
      const movements = await manager.query(
        `SELECT * FROM stock_ledger 
         WHERE company_id = $1 
           AND reference_type = $2 
           AND reference_id = $3`,
        [companyId, ENTRY_REFERENCE_TYPE, entry.id],
      );

      for (const m of movements) {
        if (m.transaction_type === 'PRODUCTION_REVERSAL') continue;
        const reverseDir: 'IN' | 'OUT' = m.direction === 'IN' ? 'OUT' : 'IN';
        const qty = Number(m.quantity) || 0;
        if (qty <= 0) continue;

        await this.stockLedgerService.create({
          companyId,
          transactionType: 'PRODUCTION_REVERSAL',
          itemId: m.item_id,
          warehouseId: m.warehouse_id,
          quantity: qty,
          uomId: m.uom_id,
          direction: reverseDir,
          referenceType: ENTRY_REFERENCE_TYPE,
          referenceId: entry.id,
          referenceNumber: entry.entryNumber || undefined,
          notes: `Reversal of ${m.transaction_type} for production entry (${entry.machineNo}, ${entry.entryDate})`,
          createdBy: userId ?? undefined,
        }, manager);

        // PRODUCTION_SCRAP is posted as an audit trail with NO balance impact
        // (see postInventoryAndConsume), so reversing it must not move stock
        // either — otherwise every edit inflated the finished-goods balance by
        // the scrap quantity.
        if (m.transaction_type === 'PRODUCTION_SCRAP') continue;

        await this.inventoryBalanceService.updateBalance(
          companyId,
          m.item_id,
          m.warehouse_id,
          m.location_id || null,
          m.batch_id || null,
          m.uom_id,
          qty,
          reverseDir,
          manager,
        );
      }
    } catch (err) {
      this.logger.error(`Failed to reverse inventory postings for entry ${entry.id}: ${err}`);
      throw err;
    }
  }

  async remove(id: string, companyId: string, userId?: string, allowedDivisionIds?: string[]): Promise<void> {
    const entry = await this.getRawEntry(id, companyId);
    // §19 — deletion must respect the caller's division scope too.
    this.assertDivisionAccess(allowedDivisionIds, entry.divisionId, 'production entry');
    await this.entryRepo.manager.transaction(async (manager) => {
      if (entry.inventoryReferenceId) {
        await this.reverseInventoryPostings(manager, entry, companyId, userId);
        entry.inventoryReferenceId = null;
      }
      entry.isActive = false;
      entry.updatedBy = userId ?? null;
      await manager.getRepository(ProductionEntry).save(entry);
    });
  }

  // ─── Validation & resolution ────────────────────────────────────────────────

  /**
   * ERP-00016: resolve the applicable Machine Target for a production entry.
   * Returns null when no machine is linked (legacy manual-target flow).
   * When a machine IS linked the target is authoritative:
   *  - no configured target → clear business error (never silently zero)
   *  - user-supplied targetQuantity → rejected (auto-calculated instead)
   *  - incompatible UOM → rejected
   *
   * ERP-00018/PROMPT-11: targets may be scoped to an Item. Resolution is
   * two-step so both configurations keep working:
   *  1. try the exact machine+shift+ITEM target first
   *  2. fall back to the legacy generic (item-less) target when no
   *     item-specific configuration exists for this machine+shift+date
   */
  private async resolveMachineTarget(
    companyId: string,
    v: {
      machineId: string | null;
      shiftId: string;
      entryDate: string;
      workingHours: number;
      itemId?: string | null;
      requestedUomId?: string | null;
      manualTargetQuantity?: number | null;
    },
  ): Promise<{
    machineTargetId: string | null;
    uomId: string;
    uomCode: string;
    standardHours: number;
    standardTarget: number;
    calculatedTarget: number;
    usedGeneralFallback: boolean;
    itemScoped: boolean;
  } | null> {
    if (!v.machineId) return null;

    if (Number(v.workingHours) <= 0) {
      let resolvedTarget: any = null;
      let usedGeneralFallback = false;
      let itemScoped = false;
      try {
        if (v.itemId) {
          const res = await this.machineTargetService.resolveEffectiveEntity(
            companyId, v.machineId, v.shiftId, v.entryDate, true, undefined, v.itemId,
          );
          if (res?.target) {
            resolvedTarget = res.target;
            usedGeneralFallback = res.usedGeneralFallback;
            itemScoped = true;
          }
        }
        if (!resolvedTarget) {
          const res = await this.machineTargetService.resolveEffectiveEntity(
            companyId, v.machineId, v.shiftId, v.entryDate, true,
          );
          if (res?.target) {
            resolvedTarget = res.target;
            usedGeneralFallback = res.usedGeneralFallback;
            itemScoped = false;
          }
        }
      } catch {
        // Target resolution is optional for 100% downtime shifts
      }

      let fallbackUomId = resolvedTarget?.uomId || v.requestedUomId;
      let fallbackUomCode = resolvedTarget?.uom?.code || 'KG';
      if (!fallbackUomId && v.itemId) {
        const item = await this.itemRepo.findOne({ where: { id: v.itemId, companyId } });
        if (item?.baseUomId) {
          fallbackUomId = item.baseUomId;
          const uom = await this.uomRepo.findOne({ where: { id: fallbackUomId } });
          fallbackUomCode = uom?.code || 'KG';
        }
      }
      if (!fallbackUomId) {
        const defaultUom = await this.uomRepo.findOne({ where: { companyId, isActive: true } });
        fallbackUomId = defaultUom?.id || null as any;
        fallbackUomCode = defaultUom?.code || 'KG';
      }
      return {
        machineTargetId: resolvedTarget?.id ?? null,
        uomId: fallbackUomId,
        uomCode: fallbackUomCode,
        standardHours: resolvedTarget ? Number(resolvedTarget.standardHours) : 8,
        standardTarget: 0,
        calculatedTarget: 0,
        usedGeneralFallback,
        itemScoped,
      };
    }

    let resolution = v.itemId
      ? await this.machineTargetService.resolveEffectiveEntity(
          companyId, v.machineId, v.shiftId, v.entryDate, true, undefined, v.itemId,
        )
      : { target: null as any, usedGeneralFallback: false };
    let itemScoped = !!resolution.target;
    if (!resolution.target && v.itemId) {
      // Legacy fallback: machine/shift has no target for THIS item — a generic
      // (item-less) target still governs the entry.
      resolution = await this.machineTargetService.resolveEffectiveEntity(
        companyId, v.machineId, v.shiftId, v.entryDate, true,
      );
      itemScoped = false;
    }
    if (!resolution.target) {
      throw new BadRequestException(
        'No active target is configured for this machine and shift. Configure one in the Machine Target Master before recording production.',
      );
    }
    const t = resolution.target;
    const calculated = calculateProratedTarget(t.targetQuantity, t.standardHours, v.workingHours);

    if (
      v.manualTargetQuantity !== undefined &&
      v.manualTargetQuantity !== null &&
      Number(v.manualTargetQuantity) !== calculated
    ) {
      throw new BadRequestException(
        'targetQuantity is auto-resolved from the Machine Target Master and must not be entered manually',
      );
    }
    if (v.requestedUomId && v.requestedUomId !== t.uomId && Number(v.workingHours) > 0) {
      const uomCode = (t as any).uom?.code ?? t.uomId;
      throw new BadRequestException(
        `Incompatible UOM for this entry: the resolved machine target for item '${t.item?.itemCode ?? 'generic'}' is configured in '${uomCode}'. Record production in the target's UOM.`,
      );
    }

    return {
      machineTargetId: t.id,
      uomId: t.uomId,
      uomCode: (t as any).uom?.code ?? '',
      standardHours: Number(t.standardHours),
      standardTarget: Number(t.targetQuantity),
      calculatedTarget: calculated,
      usedGeneralFallback: resolution.usedGeneralFallback,
      itemScoped,
    };
  }

  private async validateAndResolve(companyId: string, v: {
    divisionId: string;
    sectionId: string;
    departmentId: string;
    entryDate: string;
    shiftId: string;
    machineId: string | null;
    machineNo: string | null;
    itemId: string;
    uomId: string | null;
    productionOrderId: string | null;
    productionOrderOperationId: string | null;
    downtimeReasonId: string | null;
    targetQuantity: number;
    actualQuantity: number;
    scrapQuantity: number;
    runningHours: number;
    downtimeHours: number;
    postToInventory?: boolean;
    warehouseId?: string | null;
  }, opts?: { uomExempt?: boolean }): Promise<{ machineNo: string; plannedHours: number; shouldPostInventory: boolean; warehouseId: string | null }> {
    const isZeroProdShift = Number(v.runningHours || 0) <= 0 && Number(v.actualQuantity || 0) <= 0;
    // Numeric guards (DTO covers create; update merges raw values)
    if (v.targetQuantity === undefined || v.targetQuantity === null) {
      if (isZeroProdShift) {
        v.targetQuantity = 0;
      } else {
        throw new BadRequestException(
          'targetQuantity is required when the entry is not linked to a machine with a configured target',
        );
      }
    }
    if (!isZeroProdShift && !(v.targetQuantity > 0)) {
      throw new BadRequestException('targetQuantity must be greater than 0');
    }
    if (!(v.actualQuantity >= 0)) throw new BadRequestException('actualQuantity must be >= 0');
    if (!(v.scrapQuantity >= 0)) throw new BadRequestException('scrapQuantity must be >= 0');
    if (!(v.runningHours >= 0)) throw new BadRequestException('runningHours must be >= 0');
    if (!(v.downtimeHours >= 0)) throw new BadRequestException('downtimeHours must be >= 0');

    // Organization chain: Division → Section → Department
    const division = await this.divisionRepo.findOne({ where: { id: v.divisionId } });
    if (!division) throw new NotFoundException(`Division with ID '${v.divisionId}' not found`);
    if (division.status !== 'ACTIVE') throw new BadRequestException(`Division '${division.name}' is not ACTIVE`);

    const section = await this.sectionRepo.findOne({ where: { id: v.sectionId } });
    if (!section) throw new NotFoundException(`Section with ID '${v.sectionId}' not found`);
    if (section.divisionId !== v.divisionId) {
      throw new BadRequestException(`Section '${section.name}' does not belong to division '${division.name}'`);
    }

    await this.validateDepartment(v.departmentId, v.divisionId, v.sectionId);

    // Shift
    const shift = await this.shiftRepo.findOne({ where: { id: v.shiftId, companyId } });
    if (!shift || !shift.isActive) throw new NotFoundException(`Shift with ID '${v.shiftId}' not found in this company`);

    // Machine: resolve machine_no from master when linked
    let machineNo = v.machineNo?.trim();
    if (v.machineId) {
      const machine = await this.machineRepo.findOne({ where: { id: v.machineId, companyId } });
      if (!machine || !machine.isActive) throw new NotFoundException(`Machine with ID '${v.machineId}' not found in this company`);
      if (!machineNo) {
        // ERP-00016: derive from the master — clients only need to pick the machine
        machineNo = machine.machineCode;
      } else if (machine.machineCode !== machineNo) {
        throw new BadRequestException(`machineNo '${machineNo}' does not match machine '${machine.machineCode}' selected from the machine master`);
      }
      if (machine.departmentId && machine.departmentId !== v.departmentId) {
        const machineDept = await this.departmentRepo.findOne({ where: { id: machine.departmentId } });
        throw new BadRequestException(`Machine '${machine.machineCode}' belongs to department '${machineDept?.name ?? machine.departmentId}', not the selected department`);
      }
    } else {
      if (!machineNo) throw new BadRequestException('machineId or machineNo is required');
      // Free-text machine number: if it matches a registered machine of this
      // company, it must belong to the selected department.
      const registered = await this.machineRepo
        .createQueryBuilder('m')
        .where('m.companyId = :companyId', { companyId })
        .andWhere('m.machineCode ILIKE :code', { code: machineNo })
        .getOne();
      if (registered && registered.isActive && registered.departmentId && registered.departmentId !== v.departmentId) {
        const machineDept = await this.departmentRepo.findOne({ where: { id: registered.departmentId } });
        throw new BadRequestException(`Machine '${registered.machineCode}' belongs to department '${machineDept?.name ?? registered.departmentId}', not the selected department`);
      }
    }

    // Item: must exist in company and be usable for production
    const item = await this.itemRepo.findOne({ where: { id: v.itemId, companyId } });
    if (!item) throw new NotFoundException(`Item with ID '${v.itemId}' not found in this company`);
    if (item.status !== 'ACTIVE') throw new BadRequestException(`Item '${item.itemCode}' is not ACTIVE`);

    // UOM: item-driven validity (base UOM or defined conversion path).
    // Exempt when a machine target governs the entry — the target's UOM is
    // authoritative in that case.
    if (opts?.uomExempt) {
      // target UOM already applied upstream
    } else if (!v.uomId) {
      throw new BadRequestException(
        'uomId is required when the entry is not linked to a machine with a configured target',
      );
    } else {
      await this.assertUomValidForItem(item, v.uomId);
    }

    // Optional Production Order linkage
    if (v.productionOrderId) {
      const order = await this.productionOrderRepo.findOne({ where: { id: v.productionOrderId, companyId } });
      if (!order) throw new NotFoundException(`Production Order with ID '${v.productionOrderId}' not found in this company`);
      if (order.productId !== v.itemId) {
        throw new BadRequestException(`Daily entry item does not match production order product ('${item.itemCode}' vs order product)`);
      }
      if (v.productionOrderOperationId) {
        const op = await this.productionOrderOperationRepo.findOne({
          where: { id: v.productionOrderOperationId, productionOrderId: v.productionOrderId },
        });
        if (!op) throw new NotFoundException(`Production Order Operation '${v.productionOrderOperationId}' not found on the given production order`);
      }
    }

    if (v.downtimeReasonId) {
      const reason = await this.downtimeReasonRepo.findOne({ where: { id: v.downtimeReasonId, companyId } });
      if (!reason || !reason.isActive) throw new NotFoundException(`Downtime Reason with ID '${v.downtimeReasonId}' not found in this company`);
    }

    // Inventory posting rules: single authoritative posting point
    let shouldPostInventory = false;
    if (v.postToInventory) {
      if (v.productionOrderId) {
        throw new BadRequestException(
          'postToInventory is not allowed for order-linked entries: inventory is posted once when the Production Order is completed',
        );
      }
      if (!isZeroProdShift) {
        if (!v.warehouseId) {
          throw new BadRequestException('warehouseId is required when postToInventory is true');
        }
        shouldPostInventory = true;
      }
    }

    // Planned hours come from the Shift master (ERP-00013). When the shift row
    // carries planned hours they are authoritative: downtime can never exceed
    // them (12h shift cannot have 13h of downtime).
    const plannedHours = await this.resolvePlannedHoursById(companyId, v.shiftId, v.runningHours, v.downtimeHours);
    if (plannedHours > 0 && v.downtimeHours > plannedHours) {
      throw new BadRequestException(
        `downtimeHours (${v.downtimeHours}) cannot exceed the selected shift's planned hours (${plannedHours})`,
      );
    }
    return { machineNo, plannedHours, shouldPostInventory, warehouseId: v.warehouseId ?? null };
  }

  private async validateDepartment(departmentId: string, divisionId?: string, sectionId?: string): Promise<Department> {
    const department = await this.departmentRepo.findOne({ where: { id: departmentId } });
    if (!department) throw new NotFoundException(`Department with ID '${departmentId}' not found`);
    if (department.status !== 'ACTIVE') throw new BadRequestException(`Department '${department.name}' is not ACTIVE`);
    if (divisionId) {
      if (department.divisionId && department.divisionId !== divisionId) {
        throw new BadRequestException(`Department '${department.name}' does not belong to the selected division`);
      }
      if (department.sectionId && sectionId && department.sectionId !== sectionId) {
        throw new BadRequestException(`Department '${department.name}' does not belong to the selected section`);
      }
      if (department.divisionId && !department.sectionId && sectionId) {
        throw new BadRequestException(`Department '${department.name}' has no section assignment; select its own section`);
      }
    }
    return department;
  }

  /**
   * UOM is item-driven: accepted when equal to the item's base UOM, when a
   * conversion path exists in uom_conversions, or when the PROMPT-09
   * conversion calculator can derive one from the item's own data
   * (weightPerPiece / piecesPerKg / weightPerMeter / lengthPerPiece).
   */
  private async assertUomValidForItem(item: Item, uomId: string): Promise<void> {
    if (item.baseUomId === uomId) return;
    const direct = await this.uomConversionRepo.findOne({ where: { fromUomId: uomId, toUomId: item.baseUomId } });
    if (direct) return;
    const inverse = await this.uomConversionRepo.findOne({ where: { fromUomId: item.baseUomId, toUomId: uomId } });
    if (inverse) return;

    // Derived-conversion fallback (PROMPT-09 calculator): same-family UOMs are
    // always compatible; cross-family works when the item carries enough data.
    const uomRepo = this.uomConversionRepo.manager.getRepository('Uom');
    const [requestedUom, baseUom] = await Promise.all([
      (uomRepo as any).findOne({ where: { id: uomId } }),
      (uomRepo as any).findOne({ where: { id: item.baseUomId } }),
    ]);
    const reqFamily = familyOf((requestedUom ?? {}) as any);
    const baseFamily = familyOf((baseUom ?? {}) as any);
    if (reqFamily && baseFamily) {
      if (reqFamily === baseFamily) return;
      const supported = supportedConversions({
        weightPerPiece: item.weightPerPiece,
        piecesPerKg: item.piecesPerKg,
        weightPerMeter: item.weightPerMeter,
        lengthPerPiece: item.lengthPerPiece,
      }).some(
        (c) => c.available &&
          ((c.from === reqFamily && c.to === baseFamily) || (c.from === baseFamily && c.to === reqFamily)),
      );
      if (supported) return;
      throw new BadRequestException(
        `UOM '${(requestedUom as any)?.code ?? uomId}' requires conversion data that item '${item.itemCode}' does not have (e.g. length per piece or piece weight for ${reqFamily} ↔ ${baseFamily}).`,
      );
    }

    throw new BadRequestException(
      `UOM '${(requestedUom as any)?.code ?? uomId}' is not valid for item '${item.itemCode}' (base UOM or a defined conversion required)`,
    );
  }

  private async assertNoDuplicate(
    companyId: string,
    departmentId: string,
    entryDate: string,
    shiftId: string,
    machineNo: string,
    itemId: string,
    remarks?: string | null,
  ): Promise<void> {
    if (this.isHandPackingRef(machineNo) || this.isHandPackingRef(remarks)) {
      // Hand packing operations allow multiple batch entries for the same product in a single shift
      return;
    }
    const dup = await this.entryRepo.findOne({
      where: { companyId, departmentId, entryDate, shiftId, machineNo, itemId, isActive: true },
    });
    if (dup) {
      throw new ConflictException(
        `An active production entry already exists for this department/date/shift/machine/item combination (entry ${dup.id}). Update the existing entry instead.`,
      );
    }
  }

  // ─── Calculations ───────────────────────────────────────────────────────────

  /** Achievement % = Actual / Target × 100 */
  private computeAchievement(actual: number, target: number): number {
    if (!(target > 0)) return 0;
    return Math.round((actual / target) * 100 * 100) / 100;
  }

  /**
   * Efficiency % = Running Hours / Planned Hours × 100.
   *
   * Documented assumption (ERP-00013): there is no formal shift calendar or
   * time-log module yet. Planned hours come from the Shift master row
   * (planned_hours). When the shift has no planned hours, planned time falls
   * back to running + downtime for that entry.
   */
  private computeEfficiency(runningHours: number, plannedHours: number): number {
    if (!(plannedHours > 0)) return 0;
    return Math.round((runningHours / plannedHours) * 100 * 100) / 100;
  }

  /**
   * PHASE 4 — canonical OVERTIME derivation (write side, used by create AND
   * update when the request carries no explicit OT and no `OT: X h` remark).
   *
   *   OT = TOTAL shift hours (running + downtime) − shift planned hours
   *
   * A breakdown hour is still duty time, so it must NEVER eat overtime:
   *   12h duty (11h running + 1h breakdown) on an 8h shift → 4h OT,
   *   NOT `11 − 8 = 3h` (the old running-only rule).
   *
   * The standard is the shift master's planned hours (8h for GENERAL /
   * SHIFT-A/B/C, 12h for GENERAL (Day) / GENERAL (Night) / E2E12) — never a
   * hardcoded 8. A shift without a plan has no standard → no derived OT (0).
   * This mirrors the frontend rule the KPI/column read (see
   * frontend/src/pages/production/entries/overtimeHours.ts): the value derived
   * here is persisted to overtime_hours, which is the ONE source both surfaces
   * report.
   */
  private deriveOvertime(runningHours: number, downtimeHours: number, plannedHours: number): number {
    if (!(plannedHours > 0)) return 0;
    const dutyHours = this.round2(Number(runningHours || 0) + Number(downtimeHours || 0));
    return dutyHours > plannedHours ? this.round2(dutyHours - plannedHours) : 0;
  }

  private resolvePlannedHours(entry: ProductionEntry): number {
    const planned = Number((entry.shift as any)?.plannedHours ?? 0);
    if (planned > 0) return planned;
    return Number(entry.runningHours) + Number(entry.downtimeHours);
  }

  private async resolvePlannedHoursById(companyId: string, shiftId: string, runningHours: number, downtimeHours: number): Promise<number> {
    const shift = await this.shiftRepo.findOne({ where: { id: shiftId, companyId } });
    const planned = Number(shift?.plannedHours ?? 0);
    if (planned > 0) return planned;
    return runningHours + downtimeHours;
  }

  // ─── Inventory integration ─────────────────────────────────────────────────

  /**
   * Make-to-stock receipt: goes through the EXISTING stock ledger mechanism
   * (PRODUCTION_RECEIPT IN + balance update). Scrap follows the existing
   * PRODUCTION_SCRAP audit-trail convention. Order-driven entries never post
   * here — Production Order completion is the single authoritative posting
   * point (avoids double-posting).
   */
  /**
   * Atomic inventory posting for production entries that post to inventory:
   *  1. automatically deduct every ACTIVE BOM raw material from the Raw
   *     Material Source Warehouse (validated up-front, never partial),
   *  2. then post the finished-good production receipt exactly as before.
   * Runs inside a DB transaction so either all inventory changes commit or none do.
   */
  /**
   * The set of production items no longer than 2 (TASK #37-F), each an
   * independent OUTPUT: its own Item Master production IN consumed OUT and its
   * own good output received IN. The entry's own item is always included
   * (it is the first/primary production item); repeatable child lines are the
   * additional items, de-duplicated by item id (lines are authoritative).
   */
  private buildProductionOutputs(
    entry: ProductionEntry,
    lines?: Array<{
      itemId?: string | null;
      uomId?: string | null;
      actualQuantity?: number;
      scrapQuantity?: number;
    }>,
  ): Array<{ itemId: string; uomId: string; actualQuantity: number; scrapQuantity: number }> {
    const outputs = new Map<string, { itemId: string; uomId: string; actualQuantity: number; scrapQuantity: number }>();
    for (const line of lines ?? []) {
      if (!line.itemId) continue;
      if (!outputs.has(line.itemId)) {
        // The entry's own item is the primary/first production item: its
        // quantity is the authoritative ENTRY-level good output + rejection
        // (the UI row for the main item mirrors the entry record). Child rows
        // with any other item id carry their own quantities.
        const isMain = line.itemId === entry.itemId;
        outputs.set(line.itemId, {
          itemId: line.itemId,
          uomId: line.uomId ?? entry.uomId,
          actualQuantity: isMain ? Number(entry.actualQuantity) : Number(line.actualQuantity ?? 0),
          scrapQuantity: isMain ? Number(entry.scrapQuantity) : Number(line.scrapQuantity ?? 0),
        });
      }
    }
    if (!outputs.has(entry.itemId)) {
      outputs.set(entry.itemId, {
        itemId: entry.itemId,
        uomId: entry.uomId,
        actualQuantity: Number(entry.actualQuantity),
        scrapQuantity: Number(entry.scrapQuantity),
      });
    }
    const result = [...outputs.values()];
    const isHandPacking = !entry.machineId ||
      entry.machineNo === 'N/A (Hand Packing)' ||
      (entry.machineNo && entry.machineNo.toLowerCase().includes('hand packing')) ||
      (entry.remarks && entry.remarks.includes('[HAND PACKING]'));

    if (!isHandPacking && result.length > 2) {
      throw new BadRequestException('A maximum of 2 production items per entry is allowed');
    }
    return result;
  }

  private async postInventoryAndConsume(
    manager: EntityManager,
    companyId: string,
    entry: ProductionEntry,
    warehouseId: string,
    sourceStoreId: string | null,
    lines: Array<{
      itemId?: string | null;
      uomId?: string | null;
      actualQuantity?: number;
      scrapQuantity?: number;
    }>,
    userId?: string,
    componentWarehouses?: Array<{ itemId: string; warehouseId: string }>,
  ): Promise<void> {
    // TASK #35/#37: idempotency guard — inventory movement happens EXACTLY ONCE per
    // production entry. When the receipt ledger id is already recorded this entry
    // has already posted its consumption + output; skipping prevents duplicate
    // stock ledger transactions if the posting path is ever invoked again.
    if (entry.inventoryReferenceId) {
      return;
    }

    // Routing-configured raw materials: the ACTIVE (or synthetically derived)
    // routing of the entry's item carries the EXACT configured input item IDs
    // and source warehouses. When available they are authoritative for
    // consumption, replacing the BOM/Item-Master guess. Absent routing (or
    // legacy setups) falls back to the existing BOM + Item Master behavior.
    const routing = await this.safeGetEffectiveRouting(companyId, entry.itemId);

    // Each production item posts independently (input OUT → output IN).
    const outputs = this.buildProductionOutputs(entry, lines);

    const consumedInputs: Array<{ itemId: string; uomId: string | null; required: number; warehouseId: string }> = [];

    for (const output of outputs) {
      if (Number(output.actualQuantity) <= 0 && Number(output.scrapQuantity || 0) <= 0) {
        // Zero production / 100% downtime: no raw material consumption or inventory receipt needed
        continue;
      }
      const configuredInputs = this.resolveRoutingInputsForOutput(routing, output.itemId);
      const consumed = await this.consumeForProductionItem(
        manager, companyId, output, entry, sourceStoreId, configuredInputs, userId, componentWarehouses,
      );
      consumedInputs.push(...consumed);

      const receipt = await this.stockLedgerService.create({
        companyId,
        transactionType: 'PRODUCTION_RECEIPT',
        itemId: output.itemId,
        warehouseId,
        quantity: output.actualQuantity,
        uomId: output.uomId,
        direction: 'IN',
        referenceType: ENTRY_REFERENCE_TYPE,
        referenceId: entry.id,
        referenceNumber: entry.entryNumber || undefined,
        notes: `Daily production receipt (${entry.machineNo}, ${entry.entryDate})`,
        createdBy: userId ?? undefined,
      }, manager);
      if (!entry.inventoryReferenceId) {
        // Write the ledger reference back onto the entry (audit + double-posting guard)
        entry.inventoryReferenceId = receipt.id;
        await manager.getRepository(ProductionEntry).update(entry.id, { inventoryReferenceId: receipt.id });
      }
      await this.inventoryBalanceService.updateBalance(
        companyId, output.itemId, warehouseId, null, null, output.uomId, output.actualQuantity, 'IN', manager,
      );

      if (output.scrapQuantity > 0) {
        await this.stockLedgerService.create({
          companyId,
          transactionType: 'PRODUCTION_SCRAP',
          itemId: output.itemId,
          warehouseId,
          quantity: output.scrapQuantity,
          uomId: output.uomId,
          direction: 'OUT',
          referenceType: ENTRY_REFERENCE_TYPE,
          referenceId: entry.id,
          referenceNumber: entry.entryNumber || undefined,
          notes: `Scrap/rejection recorded for daily production entry (audit trail; no balance impact)`,
          createdBy: userId ?? undefined,
        }, manager);
      }
    }

    // Audit the exact configured inputs that were consumed as INPUT-kind entry
    // lines (deduplicated by item + source warehouse, quantities summed). These
    // rows carry the routing-configured item IDs — never the BOM guess.
    if (consumedInputs.length) {
      const byItem = new Map<string, { itemId: string; uomId: string | null; required: number; warehouseId: string }>();
      for (const c of consumedInputs) {
        const key = `${c.itemId}|${c.warehouseId}`;
        const existing = byItem.get(key);
        if (existing) existing.required += c.required;
        else byItem.set(key, { ...c });
      }
      const rows = [...byItem.values()].map((c, idx) => {
        const row = this.entryItemRepo.create({
          companyId,
          productionEntryId: entry.id,
          lineNumber: 1000 + (idx + 1) * 10,
          entryKind: ProductionEntryItemKind.INPUT,
          itemId: c.itemId,
          uomId: c.uomId,
          sourceWarehouseId: c.warehouseId,
          targetQuantity: this.round4(c.required),
          actualQuantity: this.round4(c.required),
          scrapQuantity: 0,
          runningHours: 0,
          routingCode: (routing as any)?.routingCode ?? null,
          remarks: 'Routing-configured raw material consumption (exact item)',
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        });
        return row;
      });
      await manager.getRepository(ProductionEntryItem).save(rows);
    }
  }

  // ─── Routing-aware raw-material resolution ───────────────────────────────────

  /**
   * Loads the effective routing for an item without letting the absence of one
   * break posting — falling back to the legacy BOM/Item-Master path.
   */
  private async safeGetEffectiveRouting(companyId: string, itemId: string): Promise<any | null> {
    try {
      return await this.productionRoutingService.getEffectiveRouteForItem(itemId, companyId);
    } catch {
      return null;
    }
  }

  /**
   * Returns the EXACT configured input item IDs (and their configured source
   * warehouses) for the operation that produces the given output item. Returns
   * null when the routing carries no operations/inputs, so the caller keeps the
   * legacy BOM path.
   */
  private resolveRoutingInputsForOutput(
    routing: any | null,
    outputItemId: string,
  ): Array<{ itemId: string; uomId: string | null; quantity: number; sourceWarehouseId: string | null }> | null {
    if (!routing || !Array.isArray(routing.operations)) return null;
    const producing = routing.operations.filter(
      (op: any) => Array.isArray(op.outputs) && op.outputs.some((o: any) => o.itemId === outputItemId),
    );
    if (!producing.length) return null;
    const inputs = producing.flatMap((op: any) =>
      (op.inputs ?? []).map((i: any) => ({
        itemId: i.itemId as string,
        uomId: i.uomId ?? null,
        quantity: Number(i.quantity ?? 1),
        sourceWarehouseId: i.sourceWarehouseId ?? null,
      })),
    );
    return inputs.length ? inputs : null;
  }

  // ─── Automatic raw-material consumption per production item ──────────────────

  /**
   * Deducts the raw materials required to produce ONE output item from the Raw
   * Material Source Warehouse, in the same transaction as the output receipt.
   * The exact IN Item (Item Master productionInItemId) is the authoritative
   * consumed material for the output; ACTIVE BOM lines are consumed in addition,
   * and the IN Item is auto-added 1:1 per production unit when the BOM does not
   * already deduct it. Validates ALL component stock before any deduction, so an
   * insufficient component rejects the whole posting with no partial deduction.
   * The consumption basis is the total output (good + scrap) — raw material is
   * consumed for the rejected output too.
   */
  private async consumeForProductionItem(
    manager: EntityManager,
    companyId: string,
    output: { itemId: string; uomId: string; actualQuantity: number; scrapQuantity: number },
    entryRef: { id: string; machineNo: string; entryDate: string; entryNumber?: string | null },
    sourceStoreId: string | null,
    routingInputs?: Array<{ itemId: string; uomId: string | null; quantity: number; sourceWarehouseId: string | null }> | null,
    userId?: string,
    componentWarehouses?: Array<{ itemId: string; warehouseId: string }>,
    plan = false,
  ): Promise<Array<{ itemId: string; uomId: string | null; required: number; warehouseId: string }>> {
    // Routing-configured materials take precedence (exact Item IDs + source
    // warehouses from the operation's inputs, scaled by good + scrap).
    // Manual Hand Packing entries always use the BOM configuration per Finished Good carton.
    if (routingInputs && routingInputs.length && !this.isHandPackingRef(entryRef)) {
      return this.consumeRoutingInputs(manager, companyId, output, entryRef, sourceStoreId, routingInputs, userId, plan);
    }

    const product = await this.itemRepo.findOne({ where: { id: output.itemId }, relations: ['baseUom'] });
    const authoritativeInItemId = product?.productionInItemId ?? null;

    const bom = await this.findActiveBom(companyId, output.itemId);
    if (!bom && !authoritativeInItemId) {
      // No input defined for this output — nothing to consume. An explicitly
      // assigned source store signals intent to consume, so its absence of any
      // mapped input is a configuration error; otherwise this is a valid
      // receipt-only production item.
      if (sourceStoreId) {
        throw new BadRequestException('No ACTIVE BOM exists for this production item and no Item Master production IN item is mapped.');
      }
      return [];
    }
    if (!sourceStoreId && (!componentWarehouses || !componentWarehouses.length)) {
      throw new BadRequestException(
        'Raw Material Source Warehouse could not be determined for this company. Assign an ACTIVE RAW MATERIAL warehouse or pass rawMaterialWarehouseId.',
      );
    }

    const compWarehouseMap = new Map((componentWarehouses || []).map((cw) => [cw.itemId, cw.warehouseId]));
    const lines = bom ? await this.bomLineRepo.find({ where: { bomId: bom.id }, order: { lineNumber: 'ASC' } }) : [];
    // Production basis includes scrap: both the good output and the rejected
    // output consumed raw material.
    const productionQty = Number(output.actualQuantity) + Number(output.scrapQuantity || 0);

    // Hand Packing: BOM is defined per 1 Finished Good Carton (10 GRS / 1,440 PCS).
    const isHandPacking = this.isHandPackingRef(entryRef);
    const handPackingCartons = isHandPacking && bom
      ? (await this.toPcs(output.uomId, Number(output.actualQuantity))) / HAND_PACKING_PCS_PER_CARTON / Number(bom.baseQuantity || 1)
      : 0;

    const requirements: Array<{ line: BomLine; required: number; uomCode: string; available: number; warehouseId: string }> = [];
    for (const line of lines) {
      const required = isHandPacking
        ? await this.computeHandPackingRequirement(line, handPackingCartons)
        : await this.computeBomRequirement(companyId, output, bom!, line, productionQty);
      const component = await this.itemRepo.findOne({ where: { id: line.itemId }, relations: ['baseUom'] });
      const uomCode = component?.baseUom?.code ?? (await this.uomRepo.findOne({ where: { id: line.uomId } }))?.code ?? '';
      let effectiveWh = compWarehouseMap.get(line.itemId);
      if (!effectiveWh && componentWarehouses && componentWarehouses.length > 0) {
        const lineItem = component || (await this.itemRepo.findOne({ where: { id: line.itemId } }));
        if (lineItem) {
          for (const cw of componentWarehouses) {
            const cwItem = await this.itemRepo.findOne({ where: { id: cw.itemId } });
            if (cwItem) {
              const isLineNipple = (lineItem.itemCode?.toLowerCase().includes('np') || lineItem.name?.toLowerCase().includes('nipple'));
              const isCwNipple = (cwItem.itemCode?.toLowerCase().includes('np') || cwItem.name?.toLowerCase().includes('nipple'));
              if ((isLineNipple && isCwNipple) || cwItem.itemCode === lineItem.itemCode) {
                effectiveWh = cw.warehouseId;
                break;
              }
            }
          }
        }
      }
      if (!effectiveWh && isHandPacking) {
        const lineItem = component || (await this.itemRepo.findOne({ where: { id: line.itemId } }));
        const isLineNipple = lineItem && (lineItem.itemCode?.toLowerCase().includes('np') || lineItem.name?.toLowerCase().includes('nipple'));
        if (isLineNipple) {
          const nippleWh = await this.warehouseRepo.findOne({
            where: [
              { warehouseCode: 'WH-002', companyId },
              { warehouseCode: 'WH-001', companyId },
            ],
          });
          if (nippleWh) effectiveWh = nippleWh.id;
        }
      }
      if (!effectiveWh) {
        effectiveWh = sourceStoreId ?? undefined;
      }
      if (!effectiveWh) {
        throw new BadRequestException(
          `Raw Material Source Warehouse could not be determined for component '${component?.itemCode ?? line.itemId}'. Assign an ACTIVE RAW MATERIAL warehouse or select a source store for this component.`,
        );
      }
      let available = await this.inventoryBalanceService.getAvailableStock(
        companyId, line.itemId, effectiveWh, undefined, undefined, manager,
      );
      // A plan only resolves WHERE consumption belongs; stock-driven relocation
      // is a posting decision (and `available` already excludes this entry's own
      // deduction while editing, so it would relocate spuriously).
      if (!plan && available < required) {
        // Fallback: check if the component exists in WH-002 or main warehouse
        const alternateWhs = await this.warehouseRepo.find({
          where: [
            { warehouseCode: 'WH-002', companyId },
            { warehouseCode: 'WH-001', companyId },
          ],
        });
        for (const altWh of alternateWhs) {
          if (altWh.id !== effectiveWh) {
            const altStock = await this.inventoryBalanceService.getAvailableStock(
              companyId, line.itemId, altWh.id, undefined, undefined, manager,
            );
            if (altStock >= required) {
              effectiveWh = altWh.id;
              available = altStock;
              break;
            }
          }
        }
      }
      requirements.push({ line, required, uomCode, available, warehouseId: effectiveWh });
    }

    // The exact IN Item is always consumed. When the ACTIVE BOM does not already
    // deduct it, add a converted per-unit requirement (scrap in KG inclusive basis).
    if (authoritativeInItemId && !(isHandPacking && bom) && !requirements.some((r) => r.line.itemId === authoritativeInItemId)) {
      const component = await this.itemRepo.findOne({ where: { id: authoritativeInItemId }, relations: ['baseUom'] });
      const compUom = (component?.baseUom?.code || '').toUpperCase();
      const productBaseUomId = product?.baseUomId ?? output.uomId;
      const goodQty = Number(output.actualQuantity);
      const scrapKg = Number(output.scrapQuantity || 0);
      const qtyInBase = output.uomId === productBaseUomId
        ? goodQty
        : await this.convertQty(output.uomId, productBaseUomId, goodQty);
      const units = qtyInBase / Number(bom?.baseQuantity || 1);
      const convertedGood = await this.convertProductQtyToComponentUom(product, component, units);
      const scrapInComp = (compUom === 'KG' || compUom === 'KILOGRAM')
        ? scrapKg
        : await this.convertProductQtyToComponentUom(
            { baseUom: { code: 'KG', uomType: 'WEIGHT' }, weightPerPiece: product?.weightPerPiece } as Item,
            component,
            scrapKg,
          );
      const convertedRequired = convertedGood + scrapInComp;
      const uomId = component?.baseUomId ?? output.uomId;
      const uomCode = component?.baseUom?.code ?? '';
      const effectiveInWh = compWarehouseMap.get(authoritativeInItemId) || sourceStoreId;
      if (!effectiveInWh) {
        throw new BadRequestException(
          `Raw Material Source Warehouse could not be determined for authoritative IN item '${component?.itemCode ?? authoritativeInItemId}'.`,
        );
      }
      const available = await this.inventoryBalanceService.getAvailableStock(
        companyId, authoritativeInItemId, effectiveInWh, undefined, undefined, manager,
      );
      requirements.push({
        line: {
          id: `auto-in-${authoritativeInItemId}`,
          itemId: authoritativeInItemId,
          quantity: 1,
          uomId,
          scrapFactor: 0,
          yieldPercentage: 100,
          lineNumber: 999,
        } as BomLine,
        required: this.round4(convertedRequired),
        uomCode,
        available,
        warehouseId: effectiveInWh,
      });
    }

    // Validate ALL components before touching stock — never partial.
    // Skipped while planning: an edit only has to cover the DELTA it adds, which
    // the reconciliation checks against the live balance instead.
    const missing = plan ? undefined : requirements.find((r) => r.available < r.required);
    if (missing) {
      throw new BadRequestException(
        `Raw material stock is insufficient. Required: ${this.round4(missing.required)} ${missing.uomCode} | Available: ${this.round4(missing.available)} ${missing.uomCode}`,
      );
    }

    const consumed: Array<{ itemId: string; uomId: string | null; required: number; warehouseId: string }> = [];
    for (const r of requirements) {
      const effectiveWh = r.warehouseId || sourceStoreId!;
      const compItem = await this.itemRepo.findOne({ where: { id: r.line.itemId }, select: ['id', 'baseUomId'] });
      const targetUomId = compItem?.baseUomId || r.line.uomId;
      consumed.push({ itemId: r.line.itemId, uomId: targetUomId ?? null, required: r.required, warehouseId: effectiveWh });
      if (plan) continue;
      await this.stockLedgerService.create({
        companyId,
        transactionType: 'PRODUCTION_CONSUMPTION',
        itemId: r.line.itemId,
        warehouseId: effectiveWh,
        quantity: r.required,
        uomId: targetUomId,
        direction: 'OUT',
        referenceType: ENTRY_REFERENCE_TYPE,
        referenceId: entryRef.id,
        referenceNumber: entryRef.entryNumber || undefined,
        notes: `Automatic raw material consumption for production entry (${entryRef.machineNo}, ${entryRef.entryDate})`,
        createdBy: userId ?? undefined,
      }, manager);
      await this.inventoryBalanceService.updateBalance(
        companyId, r.line.itemId, effectiveWh, null, null, targetUomId, r.required, 'OUT', manager,
      );
    }
    // INPUT audit lines are only written by the real posting path; planning
    // returns them so the reconciliation can diff against the original state.
    return plan ? consumed : [];
  }

  /**
   * Consumes the EXACT routing-configured inputs for one production output.
   * Per-unit configured quantity is scaled by the output basis (good + scrap);
   * each input's configured source warehouse takes precedence over the company
   * default source store. Validates ALL stock before any deduction (never
   * partial) and records the consumed materials as INPUT-kind entry lines.
   */
  private async consumeRoutingInputs(
    manager: EntityManager,
    companyId: string,
    output: { itemId: string; uomId: string; actualQuantity: number; scrapQuantity: number },
    entryRef: { id: string; machineNo: string; entryDate: string; entryNumber?: string | null },
    sourceStoreId: string | null,
    routingInputs: Array<{ itemId: string; uomId: string | null; quantity: number; sourceWarehouseId: string | null }>,
    userId?: string,
    plan = false,
  ): Promise<Array<{ itemId: string; uomId: string | null; required: number; warehouseId: string }>> {
    const productionQty = Number(output.actualQuantity) + Number(output.scrapQuantity || 0);

    const checks: Array<{ itemId: string; warehouseId: string; required: number; uomCode: string; available: number }> = [];
    const consumed: Array<{ itemId: string; uomId: string; required: number; warehouseId: string }> = [];
    for (const inp of routingInputs) {
      const warehouseId = inp.sourceWarehouseId ?? sourceStoreId;
      if (!warehouseId) {
        const componentForCode = await this.itemRepo.findOne({ where: { id: inp.itemId } });
        throw new BadRequestException(
          `Raw Material Source Warehouse could not be determined for routing input '${componentForCode?.itemCode ?? inp.itemId}'. Assign an ACTIVE RAW MATERIAL warehouse, pass rawMaterialWarehouseId, or set a source warehouse on the routing input.`,
        );
      }
      const component = await this.itemRepo.findOne({ where: { id: inp.itemId }, relations: ['baseUom'] });
      const product = await this.itemRepo.findOne({ where: { id: output.itemId }, relations: ['baseUom'] });
      const compUom = (component?.baseUom?.code || '').toUpperCase();
      const goodQty = Number(output.actualQuantity);
      const scrapKg = Number(output.scrapQuantity || 0);
      let required: number;
      if (Number(inp.quantity || 1) === 1) {
        const goodReq = await this.convertProductQtyToComponentUom(product, component, goodQty);
        const scrapInComp = (compUom === 'KG' || compUom === 'KILOGRAM') ? scrapKg : 0;
        required = this.round4(goodReq + scrapInComp);
      } else {
        required = this.round4(Number(inp.quantity || 1) * goodQty + scrapKg);
      }
      const uomCode = component?.baseUom?.code ?? '';
      const available = await this.inventoryBalanceService.getAvailableStock(
        companyId, inp.itemId, warehouseId, undefined, undefined, manager,
      );
      checks.push({ itemId: inp.itemId, warehouseId, required, uomCode, available });
      consumed.push({
        itemId: inp.itemId,
        uomId: inp.uomId ?? component?.baseUomId ?? output.uomId,
        required,
        warehouseId,
      });
    }

    // Planning skips the availability gate: the edit only has to cover the DELTA
    // it adds, which `applyInventoryDelta` validates against the live balance.
    const missing = plan ? undefined : checks.find((c) => c.available < c.required);
    if (missing) {
      throw new BadRequestException(
        `Raw material stock is insufficient. Required: ${this.round4(missing.required)} ${missing.uomCode} | Available: ${this.round4(missing.available)} ${missing.uomCode}`,
      );
    }

    if (plan) return consumed;

    for (const c of consumed) {
      await this.stockLedgerService.create({
        companyId,
        transactionType: 'PRODUCTION_CONSUMPTION',
        itemId: c.itemId,
        warehouseId: c.warehouseId,
        quantity: c.required,
        uomId: c.uomId,
        direction: 'OUT',
        referenceType: ENTRY_REFERENCE_TYPE,
        referenceId: entryRef.id,
        referenceNumber: entryRef.entryNumber || undefined,
        notes: `Routing-configured raw material consumption for production entry (${entryRef.machineNo}, ${entryRef.entryDate})`,
        createdBy: userId ?? undefined,
      }, manager);
      await this.inventoryBalanceService.updateBalance(
        companyId, c.itemId, c.warehouseId, null, null, c.uomId, c.required, 'OUT', manager,
      );
    }
    return consumed;
  }

  /**
   * Loads the ACTIVE BOM for an item, scoped to the company and effective on
   * today's date. Falls back to any company-matching BOM for test setups.
   */
  private async findActiveBom(companyId: string, productId: string): Promise<BillOfMaterials | null> {
    const boms = await this.bomRepo.find({ where: { companyId, productId, status: BomStatus.ACTIVE } });
    if (!boms.length) return null;
    const now = new Date();
    const valid = boms.filter((b) =>
      (!b.effectiveFrom || new Date(b.effectiveFrom) <= now) &&
      (!b.effectiveTo || new Date(b.effectiveTo) >= now),
    );
    return (valid.length ? valid : boms)[0];
  }

  /** True when the production entry is a manual Hand Packing entry (no machine). */
  private isHandPackingRef(entryRef: any): boolean {
    if (!entryRef) return false;
    if (typeof entryRef === 'string') {
      const s = entryRef.toLowerCase();
      return s.includes('hand packing') || s.includes('hand-pack') || s.includes('[hand packing]') || s.includes('pkg-');
    }
    const machineNo = String(entryRef?.machineNo || '').toLowerCase();
    const remarks = String(entryRef?.remarks || '').toLowerCase();
    return (
      machineNo.includes('hand packing') ||
      machineNo.includes('hand-pack') ||
      remarks.includes('[hand packing]') ||
      remarks.includes('hand packing') ||
      remarks.includes('pkg-')
    );
  }

  /** Factory packing unit factors by UOM code (PCS / GRS / CTN). */
  private packingFactorToPcs(code: string): number | null {
    const c = (code || '').toUpperCase();
    if (c === 'PCS' || c === 'PC' || c === 'EA' || c === 'NOS') return 1;
    if (c === 'GRS' || c === 'GROSS') return HAND_PACKING_PCS_PER_GROSS;
    if (c === 'CTN' || c === 'CARTON') return HAND_PACKING_PCS_PER_CARTON;
    return null;
  }

  /** Converts a quantity expressed in the given UOM into PCS. */
  private async toPcs(uomId: string | null, qty: number): Promise<number> {
    if (!uomId) return qty;
    const uom = await this.uomRepo.findOne({ where: { id: uomId } });
    const factor = this.packingFactorToPcs(uom?.code || '');
    return factor !== null ? qty * factor : qty;
  }

  /**
   * Hand Packing requirement: BOM line quantity is per 1 Finished Good Carton.
   * Result is expressed in the component's base UOM (the unit its stock is kept in).
   */
  private async computeHandPackingRequirement(line: BomLine, cartons: number): Promise<number> {
    const qtyInLineUom = Number(line.quantity) * cartons;
    const component = await this.itemRepo.findOne({ where: { id: line.itemId }, relations: ['baseUom'] });
    const lineUom = await this.uomRepo.findOne({ where: { id: line.uomId } });
    const lineFactor = this.packingFactorToPcs(lineUom?.code || '');
    const compFactor = this.packingFactorToPcs(component?.baseUom?.code || '');
    if (lineFactor !== null && compFactor !== null) {
      return this.round4((qtyInLineUom * lineFactor) / compFactor);
    }
    if (component?.baseUomId && component.baseUomId !== line.uomId) {
      return this.round4(await this.convertQty(line.uomId, component.baseUomId, qtyInLineUom));
    }
    return this.round4(qtyInLineUom);
  }

  /**
   * Correct BOM requirement for the output's total production quantity
   * (good converted + scrap in KG):
   */
  private async computeBomRequirement(
    companyId: string,
    output: { itemId: string; uomId: string; actualQuantity?: number; scrapQuantity?: number },
    bom: BillOfMaterials,
    line: BomLine,
    productionQty: number,
  ): Promise<number> {
    const product = await this.itemRepo.findOne({ where: { id: output.itemId }, relations: ['baseUom'] });
    const productBaseUomId = product?.baseUomId ?? output.uomId;
    const goodQty = output.actualQuantity !== undefined ? Number(output.actualQuantity) : productionQty;
    const scrapKg = Number(output.scrapQuantity || 0);
    const qtyInBase = output.uomId === productBaseUomId
      ? goodQty
      : await this.convertQty(output.uomId, productBaseUomId, goodQty);
    const units = qtyInBase / Number(bom.baseQuantity || 1);
    const component = await this.itemRepo.findOne({ where: { id: line.itemId }, relations: ['baseUom'] });
    const compUom = (component?.baseUom?.code || '').toUpperCase();
    let req: number;
    if (Number(line.quantity || 1) === 1 && line.uomId === component?.baseUomId) {
      const convertedGood = await this.convertProductQtyToComponentUom(product, component, units);
      const scrapInComp = (compUom === 'KG' || compUom === 'KILOGRAM')
        ? scrapKg
        : await this.convertProductQtyToComponentUom(
            { baseUom: { code: 'KG', uomType: 'WEIGHT' }, weightPerPiece: product?.weightPerPiece } as Item,
            component,
            scrapKg,
          );
      req = (convertedGood + scrapInComp) * (1 + Number(line.scrapFactor || 0)) / (Number(line.yieldPercentage || 100) / 100);
    } else {
      req = units * Number(line.quantity) * (1 + Number(line.scrapFactor || 0)) / (Number(line.yieldPercentage || 100) / 100);
      if (component?.baseUomId && component.baseUomId !== line.uomId) {
        req = await this.convertQty(line.uomId, component.baseUomId, req);
      }
      if (compUom === 'KG' || compUom === 'KILOGRAM') {
        req += scrapKg;
      }
    }
    return this.round4(req);
  }

  /**
   * Converts a product quantity into its raw-material component's UOM
   * using Item Master conversions (weightPerPiece, piecesPerKg, weightPerMeter)
   * or standard UOM conversions table.
   */
  private async convertProductQtyToComponentUom(
    product: Item | null,
    component: Item | null,
    quantity: number,
  ): Promise<number> {
    if (!product || !component || quantity <= 0) return quantity;

    const prodUom = (product.baseUom?.code || '').toUpperCase();
    const compUom = (component.baseUom?.code || '').toUpperCase();
    const prodFamily = (product.baseUom?.uomType || '').toUpperCase();
    const compFamily = (component.baseUom?.uomType || '').toUpperCase();

    // If both UOM codes match, 1:1
    if (prodUom && compUom && prodUom === compUom) return quantity;

    const isProdCount = prodFamily === 'COUNT' || prodUom === 'PCS' || prodUom === 'EA';
    const isCompWeight = compFamily === 'WEIGHT' || compUom === 'KG';
    const isProdLength = prodFamily === 'LENGTH' || prodUom === 'M' || prodUom === 'METER';
    const isProdWeight = prodFamily === 'WEIGHT' || prodUom === 'KG';
    const isCompCount = compFamily === 'COUNT' || compUom === 'PCS' || compUom === 'EA';
    const isCompLength = compFamily === 'LENGTH' || compUom === 'M' || compUom === 'METER';

    // Product in PCS/COUNT and Component in KG/WEIGHT: qty × weightPerPiece (or qty ÷ piecesPerKg)
    if (isProdCount && isCompWeight) {
      const wpp = Number(product.weightPerPiece || 0);
      const ppk = Number(product.piecesPerKg || 0);
      if (wpp > 0) return this.round4(quantity * wpp);
      if (ppk > 0) return this.round4(quantity / ppk);
    }

    // Product in METER/LENGTH and Component in KG/WEIGHT: qty × weightPerMeter
    if (isProdLength && isCompWeight) {
      const wpm = Number(product.weightPerMeter || 0);
      if (wpm > 0) return this.round4(quantity * wpm);
    }

    // Product in KG/WEIGHT and Component in PCS/COUNT: qty ÷ weightPerPiece (or qty × piecesPerKg)
    if (isProdWeight && isCompCount) {
      const wpp = Number(product.weightPerPiece || 0);
      const ppk = Number(product.piecesPerKg || 0);
      if (wpp > 0) return this.round4(quantity / wpp);
      if (ppk > 0) return this.round4(quantity * ppk);
    }

    // Product in KG/WEIGHT and Component in METER/LENGTH: qty ÷ weightPerMeter
    if (isProdWeight && isCompLength) {
      const wpm = Number(product.weightPerMeter || 0);
      if (wpm > 0) return this.round4(quantity / wpm);
    }

    // Fallback: check standard uomConversion table
    try {
      if (product.baseUomId && component.baseUomId) {
        return await this.convertQty(product.baseUomId, component.baseUomId, quantity);
      }
    } catch {
      // no UOM conversion record found
    }

    return quantity;
  }

  private async convertQty(fromUomId: string | null, toUomId: string, quantity: number): Promise<number> {
    if (!fromUomId || fromUomId === toUomId) return quantity;
    let conv = await this.uomConversionRepo.findOne({ where: { fromUomId, toUomId } });
    if (conv) return quantity * Number(conv.conversionFactor);
    conv = await this.uomConversionRepo.findOne({ where: { fromUomId: toUomId, toUomId: fromUomId } });
    if (conv && Number(conv.conversionFactor) !== 0) return quantity / Number(conv.conversionFactor);
    throw new BadRequestException(`No UOM conversion defined between UOMs '${fromUomId}' and '${toUomId}'`);
  }

  private async validateRawMaterialWarehouse(warehouseId: string, companyId: string): Promise<void> {
    const wh = await this.warehouseRepo.findOne({ where: { id: warehouseId, companyId } });
    if (!wh) throw new BadRequestException('Raw Material Source Warehouse not found for this company.');
    if (wh.status !== 'ACTIVE') throw new BadRequestException('Raw Material Source Warehouse is not ACTIVE.');
  }

  /**
   * TASK #37-C: resolve the store where the Item Master production IN items are
   * deducted from. An explicit value is validated and honored; otherwise the
   * company's ACTIVE RAW_MATERIAL warehouse is used, falling back to its first
   * ACTIVE warehouse. Never hardcoded, and independent of the production
   * department (the input belongs to its own source store).
   */
  private async resolveRawMaterialSourceStore(companyId: string, explicitId: string | null): Promise<string | null> {
    if (explicitId) {
      await this.validateRawMaterialWarehouse(explicitId, companyId);
      return explicitId;
    }
    let stores = await this.warehouseRepo.find({
      where: { companyId, warehouseType: WarehouseType.RAW_MATERIAL, status: 'ACTIVE' } as any,
    });
    if (!stores?.length) {
      stores = await this.warehouseRepo.find({ where: { companyId, status: 'ACTIVE' } as any });
    }
    return stores?.[0]?.id ?? null;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private round4(n: number): number {
    return Math.round(n * 10000) / 10000;
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private async getRawEntry(id: string, companyId: string): Promise<ProductionEntry> {
    const entry = await this.entryRepo.findOne({ where: { id, companyId } });
    if (!entry || !entry.isActive) {
      throw new NotFoundException(`Production Entry with ID '${id}' not found`);
    }
    return entry;
  }

  /**
   * Generate the human-readable entry reference (PE-YYYY-NNNNN), year-based and
   * company-scoped. Mirrors the production-order sequence pattern: scans the
   * most recent entries for the max numeric suffix, then increments. The year
   * prefix guarantees year transitions never collide and keeps refs readable.
   */
  private async generateEntryNumber(companyId: string): Promise<string> {
    const year = String(new Date().getFullYear());
    let rows: any[] = [];
    if (typeof this.entryRepo.query === 'function') {
      rows = await this.entryRepo.query(
        `SELECT entry_number FROM production_entries
         WHERE company_id = $1 AND entry_number LIKE $2
         ORDER BY created_at DESC LIMIT 200`,
        [companyId, `PE-${year}-%`],
      );
    } else if (typeof this.entryRepo.find === 'function') {
      rows = await this.entryRepo.find({
        where: { companyId },
        select: ['entryNumber'],
        take: 200,
      });
    }
    let maxSeq = 0;
    for (const row of rows) {
      const num = row.entry_number ?? row.entryNumber;
      const match = new RegExp(`^PE-${year}-(\\d+)$`).exec(String(num ?? ''));
      if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
    }
    return `PE-${year}-${String(maxSeq + 1).padStart(5, '0')}`;
  }
}
