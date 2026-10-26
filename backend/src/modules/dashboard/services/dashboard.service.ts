import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull, Not, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { ProductionEntry } from '../../production/entities/production-entry.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Shift } from '../../production/entities/shift.entity';
import { MachineTarget } from '../../machine-target/entities/machine-target.entity';
import { Item, ItemStatus } from '../../item/entities/item.entity';
import { StockLedger } from '../../inventory/entities/stock-ledger.entity';
import { InventoryBalance } from '../../inventory/entities/inventory-balance.entity';
import { PurchaseOrder } from '../../procurement/entities/purchase-order.entity';
import { PurchaseOrderLine } from '../../procurement/entities/purchase-order-line.entity';
import { SalesOrder } from '../../sales/entities/sales-order.entity';
import { ActivityLog } from '../../audit/entities/activity-log.entity';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { BomLine } from '../../bom/entities/bom-line.entity';
import { ProductionRouting, RoutingOperation, RoutingStatus } from '../../production-routing/entities';
import { ItemBarcode } from '../../item/entities/item-barcode.entity';
import { UomConversion } from '../../item/entities/uom-conversion.entity';
import { applyDivisionScopeFilter } from '../../../common/division-scope.util';
import { floorWiseDepartmentRank, sortDepartmentsFloorWise } from '../../../common/floor-wise-department.util';

export interface DashboardFilters {
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  shiftId?: string;
  machineId?: string;
  itemId?: string;
  dateFrom?: string;
  dateTo?: string;
  itemType?: string;
  status?: string;
  search?: string;
  warehouseId?: string;
  /**
   * Prompt #16 — server-side division scope resolved by `DivisionScopeGuard`.
   * `undefined` = unrestricted (legacy behaviour); a list restricts the query
   * to exactly those divisions; an empty list denies everything.
   */
  allowedDivisionIds?: string[];
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ProductionEntry) private readonly entryRepo: Repository<ProductionEntry>,
    @InjectRepository(Machine) private readonly machineRepo: Repository<Machine>,
    @InjectRepository(Shift) private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(MachineTarget) private readonly machineTargetRepo: Repository<MachineTarget>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(StockLedger) private readonly stockLedgerRepo: Repository<StockLedger>,
    @InjectRepository(InventoryBalance) private readonly inventoryBalanceRepo: Repository<InventoryBalance>,
    @InjectRepository(PurchaseOrder) private readonly purchaseOrderRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLine) private readonly poLineRepo: Repository<PurchaseOrderLine>,
    @InjectRepository(SalesOrder) private readonly salesOrderRepo: Repository<SalesOrder>,
    @InjectRepository(ActivityLog) private readonly activityLogRepo: Repository<ActivityLog>,
    @InjectRepository(Department) private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Division) private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Section) private readonly sectionRepo: Repository<Section>,
    @InjectRepository(Warehouse) private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(BomLine) private readonly bomLineRepo: Repository<BomLine>,
    @InjectRepository(ProductionRouting) private readonly routingRepo: Repository<ProductionRouting>,
    @InjectRepository(RoutingOperation) private readonly routingOpRepo: Repository<RoutingOperation>,
    @InjectRepository(ItemBarcode) private readonly itemBarcodeRepo: Repository<ItemBarcode>,
    @InjectRepository(UomConversion) private readonly uomConversionRepo: Repository<UomConversion>,
  ) {}

  // ── Filter Helpers ──────────────────────────────────────────────

  async getFilterDivisions(companyId: string, allowedDivisionIds?: string[]) {
    const qb = this.divisionRepo
      .createQueryBuilder('d')
      .where('d.companyId = :companyId', { companyId })
      .andWhere('d.isActive = true')
      .andWhere("d.status = 'ACTIVE'")
      .select(['d.id', 'd.divisionCode', 'd.name']);
    // Only the divisions the caller may see are offered to the filter dropdown.
    applyDivisionScopeFilter(qb, 'd.id', allowedDivisionIds);
    return qb.orderBy('d.divisionCode', 'ASC').getMany();
  }

  async getFilterSections(companyId: string, divisionId?: string, allowedDivisionIds?: string[]) {
    if (divisionId) {
      const qb = this.sectionRepo
        .createQueryBuilder('s')
        .innerJoin(Department, 'd', "d.section_id = s.id AND d.is_active = true AND d.status = 'ACTIVE'")
        .where('s.company_id = :companyId', { companyId })
        .andWhere('s.is_active = true')
        .andWhere('d.division_id = :divisionId', { divisionId })
        .select(['s.id', 's.section_code', 's.name'])
        .distinct(true)
        .orderBy('s.section_code', 'ASC');
      applyDivisionScopeFilter(qb, 's.divisionId', allowedDivisionIds);
      return qb.getMany();
    }
    const qb = this.sectionRepo
      .createQueryBuilder('s')
      .where('s.company_id = :companyId', { companyId })
      .andWhere('s.is_active = true')
      .select(['s.id', 's.section_code', 's.name'])
      .orderBy('s.section_code', 'ASC');
    applyDivisionScopeFilter(qb, 's.divisionId', allowedDivisionIds);
    return qb.getMany();
  }

  async getFilterDepartments(companyId: string, opts: { divisionId?: string; sectionId?: string; allowedDivisionIds?: string[] }) {
    const qb = this.departmentRepo
      .createQueryBuilder('d')
      .where('d.company_id = :companyId', { companyId })
      .andWhere('d.is_active = true')
      .andWhere("d.status = 'ACTIVE'");

    if (opts.sectionId) {
      qb.andWhere('d.section_id = :sectionId', { sectionId: opts.sectionId });
    }
    if (opts.divisionId) {
      qb.innerJoin(Division, 'div', 'div.id = d.division_id')
        .andWhere('d.division_id = :divisionId', { divisionId: opts.divisionId });
    }
    applyDivisionScopeFilter(qb, 'd.divisionId', opts.allowedDivisionIds);

    const departments = await qb
      .select([
        'd.id',
        'd.name',
        'd.departmentCode',
        'd.divisionId',
        'd.reportingUom',
        'd.secondaryUom',
      ])
      .orderBy('d.name', 'ASC')
      .getMany();
    // Department listings follow the fixed floor-wise shop-floor sequence
    // (Straightener → Swaging → Spoke → Spoke Plating → Packing → Dispatch)
    // instead of alphabetical ordering.
    return sortDepartmentsFloorWise(departments, (d) => d.name);
  }

  async getFilterShifts(companyId: string) {
    return this.shiftRepo.find({
      where: { companyId, isActive: true },
      select: ['id', 'name', 'startTime', 'endTime'],
      order: { name: 'ASC' },
    });
  }

  // ── Core Dashboard Queries ──────────────────────────────────────

  async getSummary(companyId: string, filters?: DashboardFilters) {
    const today = new Date().toISOString().slice(0, 10);
    const allowedDivisionIds = filters?.allowedDivisionIds;

    const qb = (repo: Repository<any>, alias: string) => {
      const q = repo.createQueryBuilder(alias).where(`${alias}."company_id" = :companyId`, { companyId });
      if (filters?.departmentId) q.andWhere(`${alias}."department_id" = :departmentId`, { departmentId: filters.departmentId });
      return q;
    };

    const itemCountQb = this.itemRepo
      .createQueryBuilder('i')
      .where('i.companyId = :companyId', { companyId });
    if (filters?.departmentId) itemCountQb.andWhere('i.department_id = :departmentId', { departmentId: filters.departmentId });
    if (filters?.sectionId) itemCountQb.andWhere('i.section_id = :sectionId', { sectionId: filters.sectionId });
    if (filters?.divisionId) itemCountQb.andWhere('i.division_id = :divisionId', { divisionId: filters.divisionId });
    applyDivisionScopeFilter(itemCountQb, 'i.divisionId', allowedDivisionIds);
    const [totalItems, activeItems] = await Promise.all([
      itemCountQb.getCount(),
      itemCountQb.clone().andWhere('i.status = :itemStatus', { itemStatus: 'ACTIVE' }).getCount(),
    ]);

    const machineCountQb = this.machineRepo
      .createQueryBuilder('m')
      .innerJoin('m.department', 'd', "d.is_active = true AND d.status = 'ACTIVE'")
      .where('m.companyId = :companyId', { companyId });
    if (filters?.departmentId) machineCountQb.andWhere('m.department_id = :departmentId', { departmentId: filters.departmentId });
    if (filters?.sectionId) machineCountQb.andWhere('d.section_id = :sectionId', { sectionId: filters.sectionId });
    if (filters?.divisionId) machineCountQb.andWhere('(m.division_id = :divisionId OR d.division_id = :divisionId)', { divisionId: filters.divisionId });
    applyDivisionScopeFilter(machineCountQb, 'm.divisionId', allowedDivisionIds);
    let totalMachines = await machineCountQb.getCount();
    let activeMachines = await machineCountQb.clone().andWhere('m.status = :machineStatus', { machineStatus: 'ACTIVE' }).getCount();
    const machineStatusMap: Record<string, number> = {};

    if (filters?.departmentId || filters?.divisionId || filters?.sectionId) {
      const deptStatusQb = this.machineRepo
        .createQueryBuilder('m')
        .innerJoin('m.department', 'd', "d.is_active = true AND d.status = 'ACTIVE'")
        .select('m.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('m."company_id" = :companyId', { companyId });
      if (filters?.departmentId) deptStatusQb.andWhere('m."department_id" = :departmentId', { departmentId: filters.departmentId });
      if (filters?.sectionId) deptStatusQb.andWhere('d.section_id = :sectionId', { sectionId: filters.sectionId });
      if (filters?.divisionId) deptStatusQb.andWhere('(m.division_id = :divisionId OR d.division_id = :divisionId)', { divisionId: filters.divisionId });
      deptStatusQb.groupBy('m.status');
      applyDivisionScopeFilter(deptStatusQb, 'm.divisionId', allowedDivisionIds);
      const statusRows = await deptStatusQb.getRawMany();
      totalMachines = statusRows.reduce((s, r) => s + parseInt(r.count, 10), 0);
      activeMachines = statusRows.find(r => r.status === 'ACTIVE') ? parseInt(statusRows.find(r => r.status === 'ACTIVE').count, 10) : 0;
      for (const row of statusRows) machineStatusMap[row.status] = parseInt(row.count, 10);
    } else {
      const allStatusQb = this.machineRepo
        .createQueryBuilder('m')
        .select('m.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('m."company_id" = :companyId', { companyId })
        .andWhere('m.is_active = true')
        .groupBy('m.status');
      applyDivisionScopeFilter(allStatusQb, 'm.divisionId', allowedDivisionIds);
      const statusRows = await allStatusQb.getRawMany();
      for (const row of statusRows) machineStatusMap[row.status] = parseInt(row.count, 10);
    }

    const entryQb = this.entryRepo.createQueryBuilder('pe')
      .where('pe.company_id = :companyId', { companyId })
      .andWhere('pe.is_active = true');
    if (filters?.departmentId) entryQb.andWhere('pe.department_id = :departmentId', { departmentId: filters.departmentId });
    if (filters?.sectionId) {
      entryQb.innerJoin(Department, 'dSec', 'dSec.id = pe.department_id')
        .andWhere('dSec.section_id = :sectionId', { sectionId: filters.sectionId });
    }
    if (filters?.divisionId) {
      entryQb.innerJoin(Department, 'dDiv', 'dDiv.id = pe.department_id')
        .andWhere('dDiv.division_id = :divisionId', { divisionId: filters.divisionId });
    }
    applyDivisionScopeFilter(entryQb, 'pe.divisionId', allowedDivisionIds);

    const [totalEntries, todayEntries, lastEntryRow] = await Promise.all([
      entryQb.getCount(),
      entryQb.clone().andWhere('pe.entry_date = :today', { today }).getCount(),
      entryQb.clone().select("TO_CHAR(MAX(pe.entry_date), 'YYYY-MM-DD')", 'lastDate').getRawOne<{ lastDate: string | null }>(),
    ]);
    const lastEntryDate = lastEntryRow?.lastDate ?? null;

    const targetCountQb = this.machineTargetRepo.createQueryBuilder('mt')
      .where('mt."company_id" = :companyId', { companyId });
    const targetActiveCountQb = this.machineTargetRepo.createQueryBuilder('mt')
      .where('mt."company_id" = :companyId', { companyId });
    // MachineTarget has no division_id of its own — its division is inherited
    // from the machine it targets (machine.division_id).
    targetCountQb.leftJoin(Machine, 'mtm', 'mtm.id = mt.machine_id');
    targetActiveCountQb.leftJoin(Machine, 'mtm', 'mtm.id = mt.machine_id');
    if (filters?.departmentId) {
      targetCountQb.andWhere('mt."department_id" = :departmentId', { departmentId: filters.departmentId });
      targetActiveCountQb.andWhere('mt."department_id" = :departmentId', { departmentId: filters.departmentId });
    }
    applyDivisionScopeFilter(targetCountQb, 'mtm.divisionId', allowedDivisionIds);
    applyDivisionScopeFilter(targetActiveCountQb, 'mtm.divisionId', allowedDivisionIds);

    const whCountQb = this.warehouseRepo.createQueryBuilder('w').where('w.company_id = :companyId', { companyId }).andWhere('w.is_active = true');
    if (filters?.divisionId) whCountQb.andWhere('w.division_id = :divisionId', { divisionId: filters.divisionId });
    applyDivisionScopeFilter(whCountQb, 'w.divisionId', allowedDivisionIds);

    const [totalTargets, activeTargets, totalWarehouses, totalPOs, totalSOs] = await Promise.all([
      targetCountQb.getCount(),
      targetActiveCountQb.andWhere('mt.status = :status', { status: 'ACTIVE' }).getCount(),
      whCountQb.getCount(),
      this.purchaseOrderRepo.count({ where: { companyId } }),
      this.salesOrderRepo.count({ where: { companyId } }),
    ]);

    const totalBomLines = await this.bomLineRepo.count({});

    const lowStockQb = this.inventoryBalanceRepo
      .createQueryBuilder('ib')
      .innerJoin(Item, 'i', 'i.id = ib.itemId')
      .where('ib."company_id" = :companyId', { companyId })
      .andWhere('ib.status = :status', { status: 'ACTIVE' })
      .andWhere('i."minimum_stock_level" IS NOT NULL')
      .andWhere('ib.on_hand <= i."minimum_stock_level"');
    if (filters?.departmentId) lowStockQb.andWhere('i."department_id" = :departmentId', { departmentId: filters.departmentId });
    applyDivisionScopeFilter(lowStockQb, 'i.divisionId', allowedDivisionIds);
    const lowStockItems = await lowStockQb.getCount();

    const stockValueQb = this.inventoryBalanceRepo
      .createQueryBuilder('ib')
      .select('COALESCE(SUM(ib.on_hand), 0)', 'total')
      .where('ib."company_id" = :companyId', { companyId })
      .andWhere('ib.status = :status', { status: 'ACTIVE' });
    // inventory_balances carries no division_id — scope it through the item.
    stockValueQb.leftJoin(Item, 'svItem', 'svItem.id = ib.item_id');
    applyDivisionScopeFilter(stockValueQb, 'svItem.divisionId', allowedDivisionIds);
    const totalStockValue = await stockValueQb.getRawOne();

    const activePOs = await this.purchaseOrderRepo.count({
      where: { companyId, status: In(['DRAFT', 'APPROVED', 'PARTIAL']) },
    });
    const activeSOs = await this.salesOrderRepo.count({
      where: { companyId, status: In(['Draft', 'CONFIRMED', 'PARTIAL']) },
    });

    return {
      items: { total: totalItems, active: activeItems },
      machines: { total: totalMachines, active: activeMachines, statusBreakdown: machineStatusMap },
      productionEntries: { total: totalEntries, today: todayEntries, lastEntryDate },
      machineTargets: { total: totalTargets, active: activeTargets },
      warehouses: { total: totalWarehouses },
      purchaseOrders: { total: totalPOs, active: activePOs },
      salesOrders: { total: totalSOs, active: activeSOs },
      bomLines: { total: totalBomLines },
      inventory: {
        totalStockValue: Number(totalStockValue?.total ?? 0),
        lowStockItems,
      },
    };
  }

  async getLastEntryDate(companyId: string, filters?: DashboardFilters): Promise<{ lastEntryDate: string | null }> {
    const qb = this.entryRepo.createQueryBuilder('pe')
      .where('pe.company_id = :companyId', { companyId })
      .andWhere('pe.is_active = true')
      .innerJoin(Department, 'depLast', "depLast.id = pe.department_id AND depLast.is_active = true AND depLast.status = 'ACTIVE'")
      .select("TO_CHAR(MAX(pe.entry_date), 'YYYY-MM-DD')", 'lastEntryDate');
    if (filters?.departmentId) qb.andWhere('pe.department_id = :departmentId', { departmentId: filters.departmentId });
    if (filters?.sectionId) {
      qb.innerJoin(Department, 'dSec', 'dSec.id = pe.department_id')
        .andWhere('dSec.section_id = :sectionId', { sectionId: filters.sectionId });
    }
    if (filters?.divisionId) {
      qb.innerJoin(Department, 'dDiv', 'dDiv.id = pe.department_id')
        .andWhere('dDiv.division_id = :divisionId', { divisionId: filters.divisionId });
    }
    applyDivisionScopeFilter(qb, 'pe.divisionId', filters?.allowedDivisionIds);
    const row = await qb.getRawOne<{ lastEntryDate: string | null }>();
    return { lastEntryDate: row?.lastEntryDate ?? null };
  }

  async getProductionSummary(companyId: string, filters?: DashboardFilters) {
    /**
     * This endpoint is an AGGREGATE, not a list. It used to hydrate every
     * matching production entry (four joined relations) and reduce it in JS —
     * an unbounded full scan that grew with company history. Both queries below
     * push the same work into SQL: one totals row, one GROUP BY department.
     */
    const applyScope = <T extends ObjectLiteral>(qb: SelectQueryBuilder<T>): SelectQueryBuilder<T> => {
      qb.innerJoin(Department, 'depScope', "depScope.id = pe.department_id AND depScope.is_active = true AND depScope.status = 'ACTIVE'")
        .where('pe.company_id = :companyId', { companyId }).andWhere('pe.is_active = true');
      if (filters?.dateFrom) qb.andWhere('pe.entry_date >= :dateFrom', { dateFrom: filters.dateFrom });
      if (filters?.dateTo) qb.andWhere('pe.entry_date <= :dateTo', { dateTo: filters.dateTo });
      if (filters?.departmentId) qb.andWhere('pe.department_id = :departmentId', { departmentId: filters.departmentId });
      if (filters?.shiftId) qb.andWhere('pe.shift_id = :shiftId', { shiftId: filters.shiftId });
      if (filters?.machineId) qb.andWhere('pe.machine_no = :machineId', { machineId: filters.machineId });
      if (filters?.itemId) qb.andWhere('pe.item_id = :itemId', { itemId: filters.itemId });
      if (filters?.sectionId) {
        qb.innerJoin(Department, 'd', 'd.id = pe.department_id')
          .andWhere('d.section_id = :sectionId', { sectionId: filters.sectionId });
      }
      if (filters?.divisionId) {
        qb.innerJoin(Department, 'd2', 'd2.id = pe.department_id')
          .andWhere('(pe.division_id = :divisionId OR d2.division_id = :divisionId)', { divisionId: filters.divisionId });
      }
      // Server-side division scoping (Prompt #16) — never trusts a client dropdown.
      applyDivisionScopeFilter(qb, 'pe.divisionId', filters?.allowedDivisionIds);
      return qb;
    };

    const totals = await applyScope(this.entryRepo.createQueryBuilder('pe'))
      .select('COUNT(*)', 'entryCount')
      .addSelect('COALESCE(SUM(pe.target_quantity), 0)', 'totalTarget')
      .addSelect('COALESCE(SUM(pe.actual_quantity), 0)', 'totalActual')
      .addSelect('COALESCE(SUM(pe.scrap_quantity), 0)', 'totalScrap')
      .addSelect('COALESCE(SUM(pe.process_scrap_kg), 0)', 'totalProcessScrap')
      .addSelect('COALESCE(SUM(pe.running_hours), 0)', 'totalRunningHours')
      .addSelect('COALESCE(SUM(pe.downtime_hours), 0)', 'totalDowntimeHours')
      .addSelect(`COALESCE(SUM(
        CASE
          WHEN COALESCE(pe.overtime_hours, 0) > 0 THEN pe.overtime_hours
          WHEN pe.remarks ~* 'OT:\\s*([0-9]+(?:\\.[0-9]+)?)' THEN
            CAST(SUBSTRING(pe.remarks FROM '(?i)OT:\\s*([0-9]+(?:\\.[0-9]+)?)') AS NUMERIC)
          ELSE 0
        END
      ), 0)`, 'totalOvertimeHours')
      .getRawOne<{
        entryCount: string;
        totalTarget: string;
        totalActual: string;
        totalScrap: string;
        totalProcessScrap: string;
        totalRunningHours: string;
        totalDowntimeHours: string;
        totalOvertimeHours: string;
      }>();

    const deptRows = await applyScope(this.entryRepo.createQueryBuilder('pe'))
      .select('pe.department_id', 'departmentId')
      .addSelect('dep.name', 'departmentName')
      .addSelect('dep.division_id', 'divisionId')
      .addSelect('COALESCE(dep.reporting_uom, \'PCS\')', 'reportingUom')
      .addSelect('COALESCE(dep.secondary_uom, \'NONE\')', 'secondaryUom')
      .addSelect('COALESCE(dep.enable_conversion_bridge, false)', 'enableConversionBridge')
      .addSelect('COUNT(*)', 'entryCount')
      .addSelect('COALESCE(SUM(pe.target_quantity), 0)', 'targetQuantity')
      .addSelect('COALESCE(SUM(pe.actual_quantity), 0)', 'actualQuantity')
      .addSelect('COALESCE(SUM(pe.scrap_quantity), 0)', 'scrapQuantity')
      .addSelect('COALESCE(SUM(pe.process_scrap_kg), 0)', 'processScrapKg')
      .addSelect('COALESCE(SUM(pe.running_hours), 0)', 'runningHours')
      .addSelect('COALESCE(SUM(pe.downtime_hours), 0)', 'downtimeHours')
      .addSelect(`COALESCE(SUM(
        CASE
          WHEN COALESCE(pe.overtime_hours, 0) > 0 THEN pe.overtime_hours
          WHEN pe.remarks ~* 'OT:\\s*([0-9]+(?:\\.[0-9]+)?)' THEN
            CAST(SUBSTRING(pe.remarks FROM '(?i)OT:\\s*([0-9]+(?:\\.[0-9]+)?)') AS NUMERIC)
          ELSE 0
        END
      ), 0)`, 'overtimeHours')
      .addSelect('COALESCE(AVG(it.weight_per_meter), 0)', 'avgWeightPerMeter')
      .addSelect('COALESCE(AVG(it.weight_per_piece), 0.008)', 'avgWeightPerPiece')
      .leftJoin(Department, 'dep', 'dep.id = pe.department_id')
      .leftJoin(Item, 'it', 'it.id = pe.item_id')
      .groupBy('pe.department_id')
      .addGroupBy('dep.name')
      .addGroupBy('dep.division_id')
      .addGroupBy('dep.reporting_uom')
      .addGroupBy('dep.secondary_uom')
      .addGroupBy('dep.enable_conversion_bridge')
      .orderBy('dep.name', 'ASC')
      .getRawMany<{
        departmentId: string;
        departmentName: string | null;
        divisionId: string | null;
        reportingUom: string;
        secondaryUom: string;
        enableConversionBridge: boolean;
        entryCount: string;
        targetQuantity: string;
        actualQuantity: string;
        scrapQuantity: string;
        processScrapKg: string;
        runningHours: string;
        downtimeHours: string;
        overtimeHours: string;
        avgWeightPerMeter: string;
        avgWeightPerPiece: string;
      }>();

    const num = (v: string | number | null | undefined) => Number(v ?? 0);
    const round4 = (v: number) => Math.round(v * 10000) / 10000;
    // Round HALF-UP to 2 decimals. (A previous `* 100 * 100` typo inflated
    // every 2-dp value 100× — achievement showed 8265.5% instead of 82.66%.)
    const round2 = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

    const totalTarget = num(totals?.totalTarget);
    const totalActual = num(totals?.totalActual);
    const totalScrap = num(totals?.totalScrap);
    const totalProcessScrap = num(totals?.totalProcessScrap);
    const totalRunningHours = num(totals?.totalRunningHours);
    const totalDowntimeHours = num(totals?.totalDowntimeHours);
    const totalOvertimeHours = num(totals?.totalOvertimeHours);

    // If no single department filter is applied, guarantee all canonical floor-line
    // departments are present on the floor line with 0 baseline even when 0 entries exist on that date.
    let baselineDepts: Array<{
      id: string;
      name: string;
      divisionId?: string;
      reportingUom?: string;
      secondaryUom?: string | null;
      enableConversionBridge?: boolean;
    }> = [];
    if (!filters?.departmentId) {
      try {
        const depQb = this.departmentRepo
          .createQueryBuilder('d')
          .where('d.company_id = :companyId', { companyId })
          .andWhere('d.is_active = true')
      .andWhere("d.status = 'ACTIVE'");

        if (filters?.sectionId) {
          depQb.andWhere('d.section_id = :sectionId', { sectionId: filters.sectionId });
        } else if (filters?.divisionId) {
          depQb.andWhere('d.division_id = :divisionId', { divisionId: filters.divisionId });
        } else {
          depQb.andWhere('(d.division_id = :spokeDivId OR d.name IN (:...floorNames))', {
            spokeDivId: 'd1000000-0000-0000-0000-000000000001',
            floorNames: ['Raw Material (RM)', 'Raw Material Stores', 'SPI Stores', 'Straightener', 'Swagging', 'Spoke', 'Spoke Plating', 'Spoke Packing', 'Packing'],
          });
        }
        applyDivisionScopeFilter(depQb, 'd.divisionId', filters?.allowedDivisionIds);
        const fetchedDepts = await depQb
          .select([
            'd.id',
            'd.name',
            'd.division_id',
            'd.reporting_uom',
            'd.secondary_uom',
            'd.enable_conversion_bridge',
          ])
          .getMany();
        
        if (filters?.divisionId === 'd1000000-0000-0000-0000-000000000001' || !filters?.divisionId) {
          baselineDepts = fetchedDepts.filter((d) => floorWiseDepartmentRank(d.name) !== -1);
        } else if (filters?.divisionId) {
          const nonProdNames = ['facility maintenance', 'accounts', 'hr', 'finance', 'admin', 'warehouse', 'sales', 'it'];
          baselineDepts = fetchedDepts.filter((d) => !nonProdNames.some((np) => d.name.toLowerCase().includes(np)));
        }
      } catch {
        // Fallback gracefully to existing rows if query fails
      }
    }

    // Preserve canonical departments: Spoke Packing aliases merge into Spoke Packing,
    // while Nipple Packing remains its own distinct department.
    const SPOKE_PACKING_ID = 'd3000000-0000-0000-0000-000000000008';
    const normalizedDeptRows: Array<(typeof deptRows)[number]> = [];
    let spokePackingAcc: (typeof deptRows)[number] | null = null;

    for (const r of deptRows) {
      const nameLower = (r.departmentName || '').trim().toLowerCase();
      const isSpokePack =
        r.departmentId === SPOKE_PACKING_ID ||
        nameLower === 'spoke packing' ||
        nameLower === 'hand packing' ||
        nameLower === 'spoke packing department';

      if (isSpokePack) {
        if (!spokePackingAcc) {
          spokePackingAcc = {
            ...r,
            departmentId: SPOKE_PACKING_ID,
            departmentName: 'Spoke Packing',
            reportingUom: 'GRS',
            secondaryUom: 'PCS',
            enableConversionBridge: true,
          };
        } else {
          spokePackingAcc.entryCount = String(Number(spokePackingAcc.entryCount || 0) + Number(r.entryCount || 0));
          spokePackingAcc.targetQuantity = String(Number(spokePackingAcc.targetQuantity || 0) + Number(r.targetQuantity || 0));
          spokePackingAcc.actualQuantity = String(Number(spokePackingAcc.actualQuantity || 0) + Number(r.actualQuantity || 0));
          spokePackingAcc.scrapQuantity = String(Number(spokePackingAcc.scrapQuantity || 0) + Number(r.scrapQuantity || 0));
          spokePackingAcc.processScrapKg = String(Number(spokePackingAcc.processScrapKg || 0) + Number(r.processScrapKg || 0));
          spokePackingAcc.runningHours = String(Number(spokePackingAcc.runningHours || 0) + Number(r.runningHours || 0));
          spokePackingAcc.downtimeHours = String(Number(spokePackingAcc.downtimeHours || 0) + Number(r.downtimeHours || 0));
          spokePackingAcc.overtimeHours = String(Number(spokePackingAcc.overtimeHours || 0) + Number(r.overtimeHours || 0));
        }
      } else {
        normalizedDeptRows.push(r);
      }
    }

    if (spokePackingAcc) {
      normalizedDeptRows.push(spokePackingAcc);
    }

    const rowMap = new Map<string, (typeof deptRows)[number]>();
    for (const r of normalizedDeptRows) {
      if (r.departmentId) rowMap.set(r.departmentId, r);
    }

    const combinedRows = [...normalizedDeptRows];
    for (const bd of baselineDepts) {
      if (!rowMap.has(bd.id)) {
        combinedRows.push({
          departmentId: bd.id,
          departmentName: bd.name,
          divisionId: bd.divisionId ?? null,
          reportingUom: (bd as any).reportingUom || (bd as any).reporting_uom || 'PCS',
          secondaryUom: (bd as any).secondaryUom || (bd as any).secondary_uom || 'NONE',
          enableConversionBridge: Boolean((bd as any).enableConversionBridge ?? (bd as any).enable_conversion_bridge),
          entryCount: '0',
          targetQuantity: '0',
          actualQuantity: '0',
          scrapQuantity: '0',
          processScrapKg: '0',
          runningHours: '0',
          downtimeHours: '0',
          overtimeHours: '0',
          avgWeightPerMeter: '0',
          avgWeightPerPiece: '0.008',
        });
      }
    }

    // Query actual Raw Material Receiving for the period from confirmed raw_material_receipts
    let rmReceivedKg = 0;
    let rmReceiptCount = 0;
    try {
      const rmRes = await this.entryRepo.query(`
        SELECT COALESCE(SUM(rl.received_quantity), 0) AS "totalReceivedKg",
               COUNT(DISTINCT r.id) AS "receiptCount"
        FROM raw_material_receipts r
        INNER JOIN raw_material_receipt_lines rl ON rl.receipt_id = r.id
        WHERE (r.company_id = $1 OR r.company_id IS NULL)
          AND r.status = 'CONFIRMED'
          AND ($2::uuid IS NULL OR r.division_id = $2)
          AND ($3::date IS NULL OR r.receipt_date >= $3)
          AND ($4::date IS NULL OR r.receipt_date <= $4)
      `, [
        companyId,
        filters?.divisionId || null,
        filters?.dateFrom || null,
        filters?.dateTo || null,
      ]);
      rmReceivedKg = Math.round(Number(rmRes?.[0]?.totalReceivedKg || 0) * 10) / 10;
      rmReceiptCount = Number(rmRes?.[0]?.receiptCount || 0);
    } catch {
      // Fallback gracefully if raw_material_receipts query fails
    }

    // Query Target Quantity from Purchase Orders (PO) for Raw Materials
    let rmTargetKg = 0;
    try {
      const poRes = await this.entryRepo.query(`
        SELECT COALESCE(SUM(pol.quantity), 0) AS "totalPoKg",
               COUNT(DISTINCT po.id) AS "poCount"
        FROM purchase_order_lines pol
        INNER JOIN purchase_orders po ON po.id = pol.po_id
        INNER JOIN items itm ON itm.id = pol.item_id
        WHERE (po.company_id = $1 OR po.company_id IS NULL)
          AND po.status NOT IN ('CANCELLED')
          AND itm.item_type = 'RAW_MATERIAL'
          AND ($2::uuid IS NULL OR itm.division_id = $2 OR po.warehouse_id IN (
            SELECT w.id FROM warehouses w WHERE w.division_id = $2
          ))
          AND ($3::date IS NULL OR po.order_date >= $3)
          AND ($4::date IS NULL OR po.order_date <= $4)
      `, [
        companyId,
        filters?.divisionId || null,
        filters?.dateFrom || null,
        filters?.dateTo || null,
      ]);

      const queriedPoKg = Math.round(Number(poRes?.[0]?.totalPoKg || 0) * 10) / 10;
      if (queriedPoKg > 0) {
        rmTargetKg = queriedPoKg;
      } else if (filters?.dateFrom || filters?.dateTo) {
        // Fallback: If date filter was set to a narrow range without new POs, check lifetime POs for that division
        const lifetimePoRes = await this.entryRepo.query(`
          SELECT COALESCE(SUM(pol.quantity), 0) AS "totalPoKg"
          FROM purchase_order_lines pol
          INNER JOIN purchase_orders po ON po.id = pol.po_id
          INNER JOIN items itm ON itm.id = pol.item_id
          WHERE (po.company_id = $1 OR po.company_id IS NULL)
            AND po.status NOT IN ('CANCELLED')
            AND itm.item_type = 'RAW_MATERIAL'
            AND ($2::uuid IS NULL OR itm.division_id = $2);
        `, [companyId, filters?.divisionId || null]);
        rmTargetKg = Math.round(Number(lifetimePoRes?.[0]?.totalPoKg || 0) * 10) / 10;
      }
    } catch {
      // Fallback gracefully if PO query fails
    }

    // Secondary fallback: if no PO is in database, fallback to planned wire or actual received
    if (rmTargetKg === 0) {
      const firstLineRow = combinedRows.find((r) => {
        const n = (r.departmentName || '').toLowerCase();
        return n.includes('straight') || n.includes('flat') || n.includes('spiral');
      });
      const firstTargetPcs = num(firstLineRow?.targetQuantity);
      const pieceWeight = num(firstLineRow?.avgWeightPerPiece) > 0 ? num(firstLineRow?.avgWeightPerPiece) : 0.0114;
      const plannedWireKg = firstTargetPcs > 0 ? Math.round(firstTargetPcs * pieceWeight * 10) / 10 : 0;
      rmTargetKg = plannedWireKg > 0 ? plannedWireKg : rmReceivedKg;
    }

    // Ensure Raw Material (RM) row exists for any active division or all divisions
    const rmRowIdx = combinedRows.findIndex((r) => {
      const n = (r.departmentName || '').toLowerCase();
      return n.includes('raw material') || n.includes('spi stores') || n.includes('ccd stores') || r.departmentId === 'f8312f0c-ba1e-401a-80cd-43d6b5cc8c05' || r.departmentId === 'd8cf64a6-ebfc-4a94-a807-4960d3166752';
    });

    const isCcd = filters?.divisionId === 'd1000000-0000-0000-0000-000000000002';
    const canonicalRmId = isCcd
      ? 'd8cf64a6-ebfc-4a94-a807-4960d3166752' // CCD Stores
      : 'f8312f0c-ba1e-401a-80cd-43d6b5cc8c05'; // Spoke Raw Material (RM)

    if (rmRowIdx !== -1) {
      combinedRows[rmRowIdx].departmentName = 'Raw Material (RM)';
      combinedRows[rmRowIdx].reportingUom = 'KG';
      combinedRows[rmRowIdx].secondaryUom = 'NONE';
      combinedRows[rmRowIdx].enableConversionBridge = true;
      combinedRows[rmRowIdx].entryCount = String(rmReceiptCount);
      combinedRows[rmRowIdx].actualQuantity = String(rmReceivedKg);
      combinedRows[rmRowIdx].targetQuantity = String(rmTargetKg);
      if (filters?.divisionId) {
        combinedRows[rmRowIdx].divisionId = filters.divisionId;
      }
    } else {
      combinedRows.unshift({
        departmentId: canonicalRmId,
        departmentName: 'Raw Material (RM)',
        divisionId: filters?.divisionId || (isCcd ? 'd1000000-0000-0000-0000-000000000002' : 'd1000000-0000-0000-0000-000000000001'),
        reportingUom: 'KG',
        secondaryUom: 'NONE',
        enableConversionBridge: true,
        entryCount: String(rmReceiptCount || 1),
        targetQuantity: String(rmTargetKg),
        actualQuantity: String(rmReceivedKg),
        scrapQuantity: '0',
        processScrapKg: '0',
        runningHours: '0',
        downtimeHours: '0',
        overtimeHours: '0',
        avgWeightPerMeter: '0',
        avgWeightPerPiece: '1',
      });
    }

    // Guarantee Spoke Plating is always reported in GRS and PCS (never mislabeled raw KG)
    for (const r of combinedRows) {
      const n = (r.departmentName || '').toLowerCase();
      if (n.includes('plat') && (n.includes('spoke') || !n.includes('nipple'))) {
        r.reportingUom = 'GRS';
        r.secondaryUom = 'PCS';
        r.enableConversionBridge = true;
      }
    }

    const departments = sortDepartmentsFloorWise(
      combinedRows.map((r) => {
        const targetQuantity = num(r.targetQuantity);
        const actualQuantity = num(r.actualQuantity);
        const rawScrap = num(r.scrapQuantity);
        const rawProcScrap = num(r.processScrapKg);
        const deptLower = (r.departmentName ?? '').toLowerCase();
        const isNoCuttingDept = deptLower.includes('pack') || deptLower.includes('plat');
        // Packing and Plating departments have NO process cutting scrap — all scrap is Product Rejection (Part Reject)
        const scrapQuantity = isNoCuttingDept ? rawScrap + rawProcScrap : rawScrap;
        const processScrapKg = isNoCuttingDept ? 0 : rawProcScrap;
        return {
          departmentId: r.departmentId,
          departmentName: r.departmentName ?? 'Unknown',
          divisionId: (r as any).divisionId ?? null,
          primaryUom: (r as any).primaryUom || (r as any).primary_uom || (r as any).reportingUom || (r as any).reporting_uom || 'PCS',
          reportingUom: (r as any).reportingUom || (r as any).reporting_uom || 'PCS',
          secondaryUom: (r as any).secondaryUom || (r as any).secondary_uom || 'NONE',
          bridgeConversion: Boolean((r as any).bridgeConversion ?? (r as any).bridge_conversion ?? (r as any).enableConversionBridge ?? (r as any).enable_conversion_bridge),
          enableConversionBridge: Boolean((r as any).enableConversionBridge ?? (r as any).enable_conversion_bridge),
          avgWeightPerMeter: num((r as any).avgWeightPerMeter),
          avgWeightPerPiece: num((r as any).avgWeightPerPiece) || 0.008,
          targetQuantity,
          actualQuantity,
          scrapQuantity,
          processScrapKg,
          productRejection: scrapQuantity,
          processCuttingScrap: processScrapKg,
          runningHours: num(r.runningHours),
          downtimeHours: num(r.downtimeHours),
          overtimeHours: round2(num(r.overtimeHours)),
          entryCount: num(r.entryCount),
          // Achievement per department = Actual ÷ Target × 100 with a
          // division-by-zero guard (no target ⇒ 0%, never Infinity/NaN).
          achievementPercentage: targetQuantity > 0
            ? round2((actualQuantity / targetQuantity) * 100)
            : 0,
        };
      }),
      (d) => d.departmentName,
    );

    return {
      dateRange: { dateFrom: filters?.dateFrom ?? null, dateTo: filters?.dateTo ?? null },
      totalEntries: num(totals?.entryCount),
      summary: {
        totalTarget: round4(totalTarget),
        totalActual: round4(totalActual),
        totalScrap: round4(totalScrap),
        productRejection: round4(totalScrap),
        processCuttingScrap: round4(totalProcessScrap),
        totalRunningHours: round2(totalRunningHours),
        totalDowntimeHours: round2(totalDowntimeHours),
        totalOvertimeHours: round2(totalOvertimeHours),
        // Overall achievement = Actual ÷ Target × 100 with a
        // division-by-zero guard (no target ⇒ 0%, never Infinity/NaN).
        achievementPercentage: totalTarget > 0 ? round2((totalActual / totalTarget) * 100) : 0,
        efficiencyPercentage: (totalRunningHours + totalDowntimeHours) > 0
          ? round2((totalRunningHours / (totalRunningHours + totalDowntimeHours)) * 100)
          : 0,
      },
      departments,
    };
  }

  async getProductionTrend(companyId: string, days: number = 31, filters?: DashboardFilters) {
    const qb = this.entryRepo
      .createQueryBuilder('pe')
      .innerJoin(Department, 'depTrend', "depTrend.id = pe.department_id AND depTrend.is_active = true AND depTrend.status = 'ACTIVE'")
      .select("TO_CHAR(pe.entry_date, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'entryCount')
      .addSelect('COALESCE(SUM(pe.target_quantity), 0)', 'target')
      .addSelect('COALESCE(SUM(pe.actual_quantity), 0)', 'actual')
      .addSelect('COALESCE(SUM(pe.scrap_quantity), 0)', 'scrap')
      .addSelect('COALESCE(SUM(pe.running_hours), 0)', 'runningHours')
      .addSelect('COALESCE(SUM(pe.downtime_hours), 0)', 'downtimeHours')
      .where('pe.company_id = :companyId', { companyId })
      .andWhere('pe.is_active = true');

    if (filters?.dateFrom) {
      qb.andWhere('pe.entry_date >= :dateFrom', { dateFrom: filters.dateFrom });
    } else {
      // By default, show all days from the 1st of the current month (or at least `days` days ago)
      const now = new Date();
      const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - days);
      const limitStr = dateLimit.toISOString().slice(0, 10);
      const effectiveDateFrom = firstOfMonth < limitStr ? firstOfMonth : limitStr;
      qb.andWhere('pe.entry_date >= :effectiveDateFrom', { effectiveDateFrom });
    }

    if (filters?.dateTo) {
      qb.andWhere('pe.entry_date <= :dateTo', { dateTo: filters.dateTo });
    }

    if (filters?.departmentId) qb.andWhere('pe.department_id = :departmentId', { departmentId: filters.departmentId });
    if (filters?.shiftId) qb.andWhere('pe.shift_id = :shiftId', { shiftId: filters.shiftId });
    if (filters?.machineId) qb.andWhere('pe.machine_no = :machineId', { machineId: filters.machineId });
    if (filters?.itemId) qb.andWhere('pe.item_id = :itemId', { itemId: filters.itemId });
    if (filters?.sectionId) {
      qb.innerJoin(Department, 'd', 'd.id = pe.department_id')
        .andWhere('d.section_id = :sectionId', { sectionId: filters.sectionId });
    }
    if (filters?.divisionId) {
      qb.innerJoin(Department, 'd2', 'd2.id = pe.department_id')
        .innerJoin(Division, 'div', 'div.id = d2.division_id')
        .andWhere('d2.division_id = :divisionId', { divisionId: filters.divisionId });
    }
    applyDivisionScopeFilter(qb, 'pe.divisionId', filters?.allowedDivisionIds);

    qb.groupBy('pe.entry_date').orderBy('pe.entry_date', 'ASC');

    const entries = await qb.getRawMany();

    return entries.map(e => ({
      date: e.date,
      entryCount: parseInt(e.entryCount, 10),
      targetQuantity: Math.round(Number(e.target) * 100) / 100,
      actualQuantity: Math.round(Number(e.actual) * 100) / 100,
      scrapQuantity: Math.round(Number(e.scrap) * 100) / 100,
      runningHours: Math.round(Number(e.runningHours) * 100) / 100,
      downtimeHours: Math.round(Number(e.downtimeHours) * 100) / 100,
      achievementPercentage: Number(e.target) > 0 ? Math.round((Number(e.actual) / Number(e.target)) * 100 * 100) / 100 : 0,
    }));
  }

  async getMachinePerformance(companyId: string, filters?: DashboardFilters) {
    const machineQb = this.machineRepo
      .createQueryBuilder('m')
      .innerJoinAndSelect('m.department', 'department', "department.is_active = true AND department.status = 'ACTIVE'")
      .where('m.company_id = :companyId', { companyId })
      .andWhere('m.is_active = true');

    if (filters?.departmentId) machineQb.andWhere('m.department_id = :departmentId', { departmentId: filters.departmentId });
    if (filters?.sectionId) {
      machineQb.innerJoin(Department, 'd', 'd.id = m.department_id')
        .andWhere('d.section_id = :sectionId', { sectionId: filters.sectionId });
    }
    if (filters?.divisionId) {
      machineQb.innerJoin(Department, 'd2', 'd2.id = m.department_id')
        .innerJoin(Division, 'div', 'div.id = d2.division_id')
        .andWhere('d2.division_id = :divisionId', { divisionId: filters.divisionId });
    }
    applyDivisionScopeFilter(machineQb, 'm.divisionId', filters?.allowedDivisionIds);

    machineQb.orderBy('m.machine_code', 'ASC');
    const machines = await machineQb.getMany();

    const entryQb = this.entryRepo
      .createQueryBuilder('pe')
      .innerJoin(Department, 'depPerf', "depPerf.id = pe.department_id AND depPerf.is_active = true AND depPerf.status = 'ACTIVE'")
      .leftJoin(Machine, 'm', 'm.id = pe.machine_id')
      .select('COALESCE(pe.machine_id::text, m.id::text)', 'machineId')
      .addSelect('COALESCE(m.machine_code, pe.machine_no)', 'machineCode')
      .addSelect('pe.machine_no', 'machineNo')
      .addSelect('COUNT(*)', 'entryCount')
      .addSelect('SUM(pe.target_quantity)', 'target')
      .addSelect('SUM(pe.actual_quantity)', 'actual')
      .addSelect('SUM(pe.scrap_quantity)', 'scrap')
      .addSelect('COALESCE(SUM(pe.process_scrap_kg), 0)', 'processScrap')
      .addSelect('SUM(pe.running_hours)', 'runningHours')
      .addSelect('SUM(pe.downtime_hours)', 'downtimeHours')
      .addSelect('AVG(pe.achievement_percentage)', 'avgAchievement')
      .where('pe.company_id = :companyId', { companyId })
      .andWhere('pe.is_active = true');

    if (filters?.dateFrom) entryQb.andWhere('pe.entry_date >= :dateFrom', { dateFrom: filters.dateFrom });
    if (filters?.dateTo) entryQb.andWhere('pe.entry_date <= :dateTo', { dateTo: filters.dateTo });
    if (filters?.departmentId) entryQb.andWhere('pe.department_id = :departmentId', { departmentId: filters.departmentId });
    if (filters?.shiftId) entryQb.andWhere('pe.shift_id = :shiftId', { shiftId: filters.shiftId });
    applyDivisionScopeFilter(entryQb, 'pe.divisionId', filters?.allowedDivisionIds);

    entryQb.groupBy('COALESCE(pe.machine_id::text, m.id::text)')
      .addGroupBy('COALESCE(m.machine_code, pe.machine_no)')
      .addGroupBy('pe.machine_no')
      .orderBy('COALESCE(m.machine_code, pe.machine_no)', 'ASC');
    const performance = await entryQb.getRawMany();

    const normalizeKey = (k?: string | null) => (k || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    const perfMap = new Map<string, any>();
    for (const p of performance) {
      const perfObj = {
        machineNo: p.machineCode || p.machineNo,
        entryCount: parseInt(p.entryCount, 10),
        targetQuantity: Math.round(Number(p.target) * 100) / 100,
        actualQuantity: Math.round(Number(p.actual) * 100) / 100,
        scrapQuantity: Math.round(Number(p.scrap) * 100) / 100,
        processScrapKg: Math.round(Number(p.processScrap) * 100) / 100,
        runningHours: Math.round(Number(p.runningHours) * 100) / 100,
        downtimeHours: Math.round(Number(p.downtimeHours) * 100) / 100,
        avgAchievement: p.avgAchievement != null ? Math.round(Number(p.avgAchievement) * 100) / 100 : 0,
      };

      if (p.machineId) perfMap.set(p.machineId.toLowerCase(), perfObj);
      if (p.machineCode) {
        perfMap.set(p.machineCode.toLowerCase().trim(), perfObj);
        perfMap.set(normalizeKey(p.machineCode), perfObj);
      }
      if (p.machineNo) {
        perfMap.set(p.machineNo.toLowerCase().trim(), perfObj);
        perfMap.set(normalizeKey(p.machineNo), perfObj);
      }
    }

    return machines.map(m => {
      const deptLower = (m.department?.name || '').toLowerCase();
      const isNoCuttingDept = deptLower.includes('pack') || deptLower.includes('plat');
      const perf =
        (m.id && perfMap.get(m.id.toLowerCase())) ||
        (m.machineCode && perfMap.get(m.machineCode.toLowerCase().trim())) ||
        (m.machineCode && perfMap.get(normalizeKey(m.machineCode))) ||
        (m.machineNumber && perfMap.get(m.machineNumber.toLowerCase().trim())) ||
        (m.name && perfMap.get(m.name.toLowerCase().trim())) || {
          machineNo: m.machineCode,
          entryCount: 0,
          targetQuantity: 0,
          actualQuantity: 0,
          scrapQuantity: 0,
          processScrapKg: 0,
          runningHours: 0,
          downtimeHours: 0,
          avgAchievement: 0,
        };

      // In packing and plating departments, all scrap is Part Reject with zero cutting scrap
      const scrapQuantity = isNoCuttingDept ? Math.round((perf.scrapQuantity + perf.processScrapKg) * 100) / 100 : perf.scrapQuantity;
      const processScrapKg = isNoCuttingDept ? 0 : perf.processScrapKg;

      return {
        id: m.id,
        machineCode: m.machineCode,
        machineName: m.name,
        departmentName: m.department?.name ?? null,
        status: m.status,
        criticality: m.criticality,
        ...perf,
        scrapQuantity,
        processScrapKg,
      };
    });
  }

  async getItemOverview(companyId: string, filters?: DashboardFilters) {
    const qb = this.itemRepo
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.department', 'department')
      .select([
        'i.id', 'i.itemCode', 'i.name', 'i.itemType', 'i.status',
        'i.isManufacturable', 'i.isPurchasable', 'i.isSellable',
        'i.costPrice', 'i.sellingPrice',
        'i.minimumStockLevel', 'i.maximumStockLevel', 'i.reorderLevel',
        'i.departmentId', 'department.name',
      ])
      .where('i."company_id" = :companyId', { companyId });

    if (filters?.itemType) qb.andWhere('i.item_type = :itemType', { itemType: filters.itemType });
    if (filters?.status) qb.andWhere('i.status = :status', { status: filters.status });
    if (filters?.departmentId) qb.andWhere('i.department_id = :departmentId', { departmentId: filters.departmentId });
    if (filters?.sectionId) {
      qb.andWhere('(i.section_id = :sectionId OR department.section_id = :sectionId)', { sectionId: filters.sectionId });
    }
    if (filters?.divisionId) {
      qb.andWhere('(i.division_id = :divisionId OR department.division_id = :divisionId)', { divisionId: filters.divisionId });
    }
    if (filters?.search) qb.andWhere('(LOWER(i.item_code) LIKE :search OR LOWER(i.name) LIKE :search)', { search: `%${filters.search.toLowerCase()}%` });
    applyDivisionScopeFilter(qb, 'i.divisionId', filters?.allowedDivisionIds);

    qb.orderBy('i.item_code', 'ASC');
    const items = await qb.getMany();

    const stockBalancesQb = this.inventoryBalanceRepo
      .createQueryBuilder('ib')
      .leftJoin('ib.warehouse', 'w')
      .select('ib."item_id"', 'itemId')
      .addSelect('SUM(ib.on_hand)', 'onHand')
      .addSelect('SUM(ib.reserved)', 'reserved')
      .addSelect('SUM(ib.available)', 'available')
      .addSelect("STRING_AGG(DISTINCT w.name, ', ')", 'warehouseName')
      .addSelect("STRING_AGG(DISTINCT w.warehouse_code, ', ')", 'warehouseCode')
      .where('ib."company_id" = :companyId', { companyId })
      .andWhere('ib.status = :status', { status: 'ACTIVE' });

    if (filters?.divisionId) {
      stockBalancesQb.andWhere('w.division_id = :divisionId', { divisionId: filters.divisionId });
    }

    stockBalancesQb.groupBy('ib."item_id"');
    const stockBalances = await stockBalancesQb.getRawMany();

    const stockMap = new Map<string, any>();
    for (const s of stockBalances) {
      stockMap.set(s.itemId, {
        onHand: Math.round(Number(s.onHand) * 100) / 100,
        reserved: Math.round(Number(s.reserved) * 100) / 100,
        available: Math.round(Number(s.available) * 100) / 100,
        warehouseName: s.warehouseName || null,
        warehouseCode: s.warehouseCode || null,
      });
    }

    const productionCounts = await this.entryRepo
      .createQueryBuilder('pe')
      .select('pe."item_id"', 'itemId')
      .addSelect('COUNT(*)', 'entryCount')
      .addSelect('SUM(pe.actual_quantity)', 'totalActual')
      .where('pe.company_id = :companyId', { companyId })
      .andWhere('pe.is_active = true')
      .groupBy('pe."item_id"')
      .getRawMany();

    const prodMap = new Map<string, any>();
    for (const p of productionCounts) {
      prodMap.set(p.itemId, {
        entryCount: parseInt(p.entryCount, 10),
        totalActual: Math.round(Number(p.totalActual) * 100) / 100,
      });
    }

    return items.map(item => {
      const stock = stockMap.get(item.id) ?? {
        onHand: 0,
        reserved: 0,
        available: 0,
        warehouseName: null,
        warehouseCode: null,
      };
      return {
        id: item.id,
        itemCode: item.itemCode,
        name: item.name,
        departmentName: (item.department as any)?.name ?? null,
        wireSizeMm: item.wireSizeMm != null ? Number(item.wireSizeMm) : null,
        itemType: item.itemType,
        status: item.status,
        isManufacturable: item.isManufacturable,
        isPurchasable: item.isPurchasable,
        isSellable: item.isSellable,
        costPrice: item.costPrice,
        sellingPrice: item.sellingPrice,
        minimumStockLevel: item.minimumStockLevel,
        maximumStockLevel: item.maximumStockLevel,
        reorderLevel: item.reorderLevel,
        warehouseName: stock.warehouseName ?? null,
        warehouseCode: stock.warehouseCode ?? null,
        stock,
        production: prodMap.get(item.id) ?? { entryCount: 0, totalActual: 0 },
      };
    });
  }

  async getItemRoute(companyId: string, itemId: string) {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, companyId },
      relations: ['department', 'baseUom', 'productionInItem', 'productionInItem.baseUom', 'productionInItem.department', 'routeTypeRef'],
    });

    if (!item) {
      return { routing: null, operations: [], productionFlow: null };
    }

    const routing = await this.routingRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.operations', 'ops')
      .leftJoinAndSelect('ops.inputs', 'opInputs')
      .leftJoinAndSelect('opInputs.item', 'inputItem')
      .leftJoinAndSelect('ops.outputs', 'opOutputs')
      .leftJoinAndSelect('opOutputs.item', 'outputItem')
      .where('r.product_id = :itemId', { itemId })
      .andWhere('r.company_id = :companyId', { companyId })
      .andWhere('r.status = :status', { status: 'ACTIVE' })
      .orderBy('ops.sequence_no', 'ASC')
      .getOne();

    // Output Item is ALWAYS the current Item
    const outputItem = {
      id: item.id,
      itemCode: item.itemCode,
      name: item.name,
      itemType: item.itemType,
      wireSizeMm: item.wireSizeMm != null ? Number(item.wireSizeMm) : null,
      uom: item.baseUom?.code || null,
      departmentName: item.department?.name || null,
    };

    // Input Material from exact productionInItemId
    let inputItem: any = null;
    if (item.productionInItemId) {
      const inItem = item.productionInItem ?? (await this.itemRepo.findOne({
        where: { id: item.productionInItemId, companyId },
        relations: ['department', 'baseUom'],
      }));
      if (inItem) {
        inputItem = {
          id: inItem.id,
          itemCode: inItem.itemCode,
          name: inItem.name,
          itemType: inItem.itemType,
          wireSizeMm: inItem.wireSizeMm != null ? Number(inItem.wireSizeMm) : null,
          uom: inItem.baseUom?.code || null,
          departmentName: inItem.department?.name || null,
          storeWarehouseName: inItem.department?.name || null,
        };
      }
    }

    // Operation / Department resolution — always dynamic: no hard-coded
    // department/operation names (PVC/CCD/Spoke mappings intentionally removed).
    const deptName = item.department?.name || null;
    let operationName = deptName;
    if (!operationName && routing?.operations?.[0]?.operationName) operationName = routing.operations[0].operationName;
    else if (!operationName) operationName = item.process1 || (item.isManufacturable ? 'Manufacturing' : null);

    const isRawMaterial = item.itemType === 'RAW_MATERIAL' || (!item.isManufacturable && !item.productionInItemId);
    const hasConfiguredRoute = Boolean(item.productionInItemId || (routing && routing.operations?.length > 0));
    let statusMessage = 'Configured';
    if (!hasConfiguredRoute) {
      if (isRawMaterial) {
        statusMessage = 'Raw Material / No upstream production route';
      } else {
        statusMessage = 'Manufacturing Item with missing route configuration';
      }
    }

    // Multi-stage chain resolution. When an ACTIVE routing with operations exists,
    // the chain is derived from the routing relationship GRAPH (the exact
    // configured input/output item IDs per operation) — never from hard-coded
    // department or item names. Legacy Item-Master productionInItemId walk is
    // used only as the fallback (still dynamic per-item names).
    const chain =
      routing && routing.operations?.length
        ? await this.buildChainFromRouting(routing, item, companyId)
        : await this.buildLegacyChain(item, companyId);

    const legacyRouting = routing
      ? {
          id: routing.id,
          routingCode: routing.routingCode,
          name: routing.name,
          description: routing.description,
          estimatedTotalTime: routing.estimatedTotalTime,
          isDefault: routing.isDefault,
          baseQuantity: routing.baseQuantity,
        }
      : hasConfiguredRoute
      ? {
          id: `syn-rtg-${item.id}`,
          routingCode: `RTG-${item.itemCode}`,
          name: `${operationName || 'Production'} — ${item.name}`,
          description: `Authoritative Item Master production flow for ${item.itemCode}`,
          estimatedTotalTime: 0,
          isDefault: true,
          baseQuantity: 1,
        }
      : null;

    const legacyOps =
      routing && routing.operations?.length > 0
        ? routing.operations.map((op) => ({
            sequenceNo: op.sequenceNo,
            operationCode: op.operationCode,
            operationName: op.operationName,
            description: op.description,
            departmentId: op.departmentId,
            setupTimeMinutes: Number(op.setupTimeMinutes || 0),
            runTimeMinutes: Number(op.runTimeMinutes || 0),
            queueTimeMinutes: Number(op.queueTimeMinutes || 0),
            machineRequired: op.machineRequired,
            inputQuantity: Number(op.inputQuantity || 1),
            outputQuantity: Number(op.outputQuantity || 1),
            scrapPercentage: Number(op.scrapPercentage || 0),
            status: op.status,
          }))
        : hasConfiguredRoute
        ? [
            {
              sequenceNo: 10,
              operationCode: `OP-${(item.department?.departmentCode || 'MFG').toUpperCase()}`,
              operationName: operationName || 'Manufacturing',
              description: `Stage Operation: ${operationName || 'Manufacturing'}`,
              departmentId: item.departmentId,
              setupTimeMinutes: 0,
              runTimeMinutes: 0,
              queueTimeMinutes: 0,
              machineRequired: false,
              inputQuantity: 1,
              outputQuantity: 1,
              scrapPercentage: 0,
              status: 'ACTIVE',
            },
          ]
        : [];

    return {
      routing: legacyRouting,
      operations: legacyOps,
      productionFlow: {
        isRawMaterial,
        hasConfiguredRoute,
        statusMessage,
        operationName,
        departmentName: item.department?.name || null,
        routeTypeName: item.routeTypeRef?.name || item.routeType || null,
        wireSizeMm: item.wireSizeMm != null ? Number(item.wireSizeMm) : null,
        diameterMm: item.diameterMm != null ? Number(item.diameterMm) : (item.wireSizeMm != null ? Number(item.wireSizeMm) : null),
        thicknessMm: item.thicknessMm != null ? Number(item.thicknessMm) : null,
        widthMm: item.widthMm != null ? Number(item.widthMm) : null,
        lengthPerPiece: item.lengthPerPiece != null ? Number(item.lengthPerPiece) : null,
        finalProduct: item.finalProduct || null,
        packingNextStep: item.packingNextStep || null,
        processes: Array.isArray(item.processes) && item.processes.length > 0
          ? item.processes.map((p, idx) => ({ step: p.sequence ?? (idx + 1), name: p.name }))
          : [
              item.process1 ? { step: 1, name: item.process1 } : null,
              item.process2 ? { step: 2, name: item.process2 } : null,
              item.process3 ? { step: 3, name: item.process3 } : null,
              item.process4 ? { step: 4, name: item.process4 } : null,
              item.process5 ? { step: 5, name: item.process5 } : null,
              item.process6 ? { step: 6, name: item.process6 } : null,
            ].filter(Boolean),
        inputItem,
        outputItem,
        chain,
      },
    };
  }

  /**
   * Builds the production-flow chain from the routing RELATIONSHIP GRAPH only:
   * each operation's exact configured input/output item IDs, with stage names
   * coming from the operation name (or its department) — no hard-coded names.
   * Items that appear only as inputs and are not produced by any operation in
   * the route are treated as raw-material/store source nodes.
   */
  private async buildChainFromRouting(
    routing: ProductionRouting,
    item: Item,
    companyId: string,
  ): Promise<any[]> {
    const ops = [...(routing.operations ?? [])].sort(
      (a, b) => Number(a.sequenceNo) - Number(b.sequenceNo),
    );
    const opInputs = (op: RoutingOperation): string[] =>
      (Array.isArray(op.inputs) && op.inputs.length ? op.inputs.map((i: any) => i.itemId) : [op.inputItemId])
        .filter((id): id is string => Boolean(id));
    const opOutputs = (op: RoutingOperation): string[] =>
      (Array.isArray(op.outputs) && op.outputs.length ? op.outputs.map((o: any) => o.itemId) : [op.outputItemId])
        .filter((id): id is string => Boolean(id));

    const stageByItem = new Map<string, { name: string; departmentName: string | null }>();
    for (const op of ops) {
      for (const oid of opOutputs(op)) {
        if (!stageByItem.has(oid)) {
          stageByItem.set(oid, {
            name: op.operationName?.trim() || (op.department as any)?.name || 'Manufacturing',
            departmentName: (op.department as any)?.name ?? null,
          });
        }
      }
    }

    const ordered: string[] = [];
    const seen = new Set<string>([item.id]);
    for (const op of ops) {
      for (const iid of opInputs(op)) {
        if (!seen.has(iid)) {
          seen.add(iid);
          ordered.push(iid);
        }
      }
      for (const oid of opOutputs(op)) {
        if (!seen.has(oid)) {
          seen.add(oid);
          ordered.push(oid);
        }
      }
    }
    if (!seen.has(item.id)) ordered.push(item.id);

    const entities = await this.itemRepo.find({
      where: { id: In([...seen]), companyId },
      relations: ['department', 'baseUom'],
    });
    const byId = new Map(entities.map((e) => [e.id, e]));

    return ordered.map((id, idx) => {
      const node = byId.get(id);
      const stage = stageByItem.get(id);
      const isSourceMaterial = !stage;
      const stageName = isSourceMaterial
        ? 'RAW MATERIAL / STORE'
        : stage!.name.toUpperCase();
      return {
        stageOrder: idx + 1,
        stageName,
        itemId: id,
        itemCode: node?.itemCode ?? null,
        itemName: node?.name ?? null,
        itemType: node?.itemType ?? null,
        departmentName: node?.department?.name ?? stage?.departmentName ?? null,
        wireSizeMm: node?.wireSizeMm != null ? Number(node.wireSizeMm) : null,
        uom: node?.baseUom?.code ?? null,
        isCurrent: node?.id === item.id,
      };
    });
  }

  /**
   * Legacy fallback: walks the Item-Master productionInItemId chain upstream
   * and downstream. Stage names are always derived dynamically from each item's
   * own department (uppercased) or generic RAW MATERIAL / FINISHED GOODS
   * markers — no hard-coded operation names.
   */
  private async buildLegacyChain(item: Item, companyId: string): Promise<any[]> {
    const chainList: any[] = [];
    const visited = new Set<string>([item.id]);
    let currentUp: any = item;
    while (currentUp?.productionInItemId) {
      const parentId = currentUp.productionInItemId;
      if (visited.has(parentId) || chainList.length > 20) break;
      visited.add(parentId);
      const parent = await this.itemRepo.findOne({
        where: { id: parentId, companyId },
        relations: ['department', 'baseUom'],
      });
      if (!parent) break;
      chainList.unshift(parent);
      currentUp = parent;
    }

    chainList.push(item);

    let currentDown: any = item;
    while (currentDown) {
      const child = await this.itemRepo.findOne({
        where: { productionInItemId: currentDown.id, companyId, status: ItemStatus.ACTIVE },
        relations: ['department', 'baseUom'],
      });
      if (!child || visited.has(child.id) || chainList.length > 20) break;
      visited.add(child.id);
      chainList.push(child);
      currentDown = child;
    }

    return chainList.map((node, idx) => {
      const isRawStore =
        !node.productionInItemId || node.itemType === 'RAW_MATERIAL';
      let stageName = 'MANUFACTURING';
      if (isRawStore) {
        stageName = 'RAW MATERIAL / STORE';
      } else if (node.department?.name) {
        // Dynamic per-item department name — no hard-coded operation labels.
        stageName = node.department.name.toUpperCase();
      } else if (node.itemType === 'FINISHED_GOOD') {
        stageName = 'FINISHED GOODS / STORE';
      }

      return {
        stageOrder: idx + 1,
        stageName,
        itemId: node.id,
        itemCode: node.itemCode,
        itemName: node.name,
        itemType: node.itemType,
        departmentName: node.department?.name || null,
        wireSizeMm: node.wireSizeMm != null ? Number(node.wireSizeMm) : null,
        uom: node.baseUom?.code || null,
        isCurrent: node.id === item.id,
      };
    });
  }

  async getInventorySummary(
    companyId: string,
    filters?: { warehouseId?: string; divisionId?: string; sectionId?: string; departmentId?: string; allowedDivisionIds?: string[] },
  ) {
    const whQb = this.warehouseRepo
      .createQueryBuilder('w')
      .where('w.company_id = :companyId', { companyId })
      .andWhere('w.is_active = true');

    if (filters?.warehouseId) whQb.andWhere('w.id = :warehouseId', { warehouseId: filters.warehouseId });
    if (filters?.divisionId) whQb.andWhere('w.division_id = :divisionId', { divisionId: filters.divisionId });
    applyDivisionScopeFilter(whQb, 'w.divisionId', filters?.allowedDivisionIds);

    whQb.orderBy('w.warehouse_code', 'ASC');
    const allWarehouses = await whQb.getMany();

    const warehousesMap = new Map<string, {
      warehouseId: string;
      warehouseCode: string;
      warehouseName: string;
      totalItems: number;
      totalOnHand: number;
      totalReserved: number;
      totalAvailable: number;
    }>();

    for (const w of allWarehouses) {
      warehousesMap.set(w.id, {
        warehouseId: w.id,
        warehouseCode: w.warehouseCode || '',
        warehouseName: w.name || '',
        totalItems: 0,
        totalOnHand: 0,
        totalReserved: 0,
        totalAvailable: 0,
      });
    }

    const warehouseStockQb = this.inventoryBalanceRepo
      .createQueryBuilder('ib')
      .leftJoinAndSelect('ib.warehouse', 'warehouse')
      .leftJoinAndSelect('ib.item', 'item')
      .leftJoinAndSelect('ib.uom', 'uom')
      .where('ib."company_id" = :companyId', { companyId })
      .andWhere('ib.status = :status', { status: 'ACTIVE' });

    if (filters?.warehouseId) warehouseStockQb.andWhere('ib.warehouse_id = :warehouseId', { warehouseId: filters.warehouseId });
    if (filters?.divisionId) warehouseStockQb.andWhere('warehouse.division_id = :divisionId', { divisionId: filters.divisionId });
    applyDivisionScopeFilter(warehouseStockQb, 'warehouse.divisionId', filters?.allowedDivisionIds);

    const warehouseStock = await warehouseStockQb.getMany();

    for (const bal of warehouseStock) {
      const whId = bal.warehouseId;
      if (!warehousesMap.has(whId)) {
        warehousesMap.set(whId, {
          warehouseId: whId,
          warehouseCode: (bal.warehouse as any)?.warehouseCode ?? '',
          warehouseName: (bal.warehouse as any)?.name ?? '',
          totalItems: 0,
          totalOnHand: 0,
          totalReserved: 0,
          totalAvailable: 0,
        });
      }
      const wh = warehousesMap.get(whId)!;
      wh.totalItems += 1;
      wh.totalOnHand += Number(bal.onHand);
      wh.totalReserved += Number(bal.reserved);
      wh.totalAvailable += Number(bal.available);
    }

    const lowStockQb = this.inventoryBalanceRepo
      .createQueryBuilder('ib')
      .innerJoin(Item, 'i', 'i.id = ib."item_id"')
      .leftJoin('ib.warehouse', 'warehouse')
      .where('ib."company_id" = :companyId', { companyId })
      .andWhere('ib.status = :status', { status: 'ACTIVE' })
      .andWhere('i."minimum_stock_level" IS NOT NULL')
      .andWhere('ib.on_hand <= i."minimum_stock_level"')
      .select(['i.id', 'i.item_code', 'i.name', 'i.minimum_stock_level'])
      .addSelect('SUM(ib.on_hand)', 'onHand')
      .groupBy('i.id')
      .addGroupBy('i.item_code')
      .addGroupBy('i.name')
      .addGroupBy('i."minimum_stock_level"');

    if (filters?.warehouseId) lowStockQb.andWhere('ib.warehouse_id = :warehouseId', { warehouseId: filters.warehouseId });
    if (filters?.divisionId) {
      lowStockQb.andWhere('(warehouse.division_id = :divisionId OR i.division_id = :divisionId)', { divisionId: filters.divisionId });
    }
    applyDivisionScopeFilter(lowStockQb, 'warehouse.divisionId', filters?.allowedDivisionIds);
    const lowStockItems = await lowStockQb.getRawMany();

    const recentTransactionsQb = this.stockLedgerRepo
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.item', 'item')
      .leftJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl."company_id" = :companyId', { companyId })
      .orderBy('sl.created_at', 'DESC')
      .limit(10);

    if (filters?.warehouseId) recentTransactionsQb.andWhere('sl.warehouse_id = :warehouseId', { warehouseId: filters.warehouseId });
    if (filters?.divisionId) {
      recentTransactionsQb.andWhere('(warehouse.division_id = :divisionId OR item.division_id = :divisionId)', { divisionId: filters.divisionId });
    }
    applyDivisionScopeFilter(recentTransactionsQb, 'warehouse.divisionId', filters?.allowedDivisionIds);
    const recentTransactions = await recentTransactionsQb.getMany();

    return {
      warehouses: [...warehousesMap.values()].map(wh => ({
        ...wh,
        totalOnHand: Math.round(wh.totalOnHand * 100) / 100,
        totalReserved: Math.round(wh.totalReserved * 100) / 100,
        totalAvailable: Math.round(wh.totalAvailable * 100) / 100,
      })),
      lowStockItems: lowStockItems.map(ls => ({
        itemId: ls.i_id ?? ls.id,
        itemCode: ls.i_item_code ?? ls.item_code,
        name: ls.i_name ?? ls.name,
        minimumStockLevel: Number(ls.i_minimum_stock_level ?? ls.minimum_stock_level),
        onHand: Math.round(Number(ls.onHand) * 100) / 100,
      })),
      recentTransactions: recentTransactions.map(t => ({
        id: t.id,
        transactionType: t.transactionType,
        itemCode: (t.item as any)?.itemCode ?? '',
        itemName: (t.item as any)?.name ?? '',
        warehouseCode: (t.warehouse as any)?.warehouseCode ?? '',
        quantity: Number(t.quantity),
        direction: t.direction,
        createdAt: t.createdAt,
      })),
    };
  }

  async getPurchaseOrderSummary(companyId: string) {
    const orders = await this.purchaseOrderRepo
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .where('po."company_id" = :companyId', { companyId })
      .orderBy('po.created_at', 'DESC')
      .limit(20)
      .getMany();

    const statusCounts = await this.purchaseOrderRepo
      .createQueryBuilder('po')
      .select('po.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(po.total_amount)', 'totalValue')
      .where('po."company_id" = :companyId', { companyId })
      .groupBy('po.status')
      .getRawMany();

    return {
      recentOrders: orders.map(po => ({
        id: po.id,
        poCode: po.poCode,
        supplierName: (po.supplier as any)?.name ?? '',
        orderDate: po.orderDate,
        expectedDeliveryDate: po.expectedDeliveryDate,
        totalAmount: Number(po.totalAmount),
        status: po.status,
        currencyCode: po.currencyCode,
      })),
      statusBreakdown: statusCounts.map(s => ({
        status: s.status,
        count: parseInt(s.count, 10),
        totalValue: Math.round(Number(s.totalValue) * 100) / 100,
      })),
    };
  }

  async getSalesOrderSummary(companyId: string) {
    const orders = await this.salesOrderRepo
      .createQueryBuilder('so')
      .leftJoinAndSelect('so.customer', 'customer')
      .where('so."company_id" = :companyId', { companyId })
      .orderBy('so.created_at', 'DESC')
      .limit(20)
      .getMany();

    const statusCounts = await this.salesOrderRepo
      .createQueryBuilder('so')
      .select('so.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(so.total_amount)', 'totalValue')
      .where('so."company_id" = :companyId', { companyId })
      .groupBy('so.status')
      .getRawMany();

    return {
      recentOrders: orders.map(so => ({
        id: so.id,
        orderNumber: so.orderNumber,
        customerName: (so.customer as any)?.customerName ?? '',
        orderDate: so.orderDate,
        deliveryDate: so.deliveryDate,
        totalAmount: Number(so.totalAmount),
        status: so.status,
        currency: so.currency,
      })),
      statusBreakdown: statusCounts.map(s => ({
        status: s.status,
        count: parseInt(s.count, 10),
        totalValue: Math.round(Number(s.totalValue) * 100) / 100,
      })),
    };
  }

  async getDashboardSchedule(companyId: string, filters?: DashboardFilters) {
    const ordersQb = this.salesOrderRepo
      .createQueryBuilder('so')
      .leftJoinAndSelect('so.customer', 'customer')
      .where('so.company_id = :companyId', { companyId })
      .andWhere("so.status NOT IN ('CANCELLED', 'CLOSED')")
      .orderBy('so.delivery_date', 'ASC')
      .addOrderBy('so.created_at', 'DESC')
      .limit(10);
    const orders = await ordersQb.getMany();

    const todayStr = new Date().toISOString().slice(0, 10);
    return orders.map((o) => {
      const isToday = o.deliveryDate === todayStr;
      return {
        id: o.id,
        type: 'DISPATCH',
        title: (o.customer as any)?.customerName ?? 'Customer Delivery',
        subtitle: `${o.orderNumber} · Total: ${Number(o.totalAmount || 0).toLocaleString()} ${o.currency || 'PKR'}`,
        time: isToday ? 'Today · Delivery' : o.deliveryDate ? `Due: ${o.deliveryDate}` : 'Scheduled',
        deliveryDate: o.deliveryDate,
        status: o.status === 'CONFIRMED' ? 'Confirmed' : o.status === 'Draft' ? 'Pending' : 'Booked',
      };
    });
  }

  async getCalendarActivity(companyId: string, year: number, month: number, filters?: DashboardFilters) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

    const qb = this.entryRepo
      .createQueryBuilder('pe')
      .innerJoin(Department, 'depTrend', "depTrend.id = pe.department_id AND depTrend.is_active = true AND depTrend.status = 'ACTIVE'")
      .select("TO_CHAR(pe.entry_date, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(pe.actual_quantity), 0)', 'totalActual')
      .where('pe.company_id = :companyId', { companyId })
      .andWhere('pe.is_active = true')
      .andWhere('pe.entry_date >= :startDate', { startDate })
      .andWhere('pe.entry_date < :endDate', { endDate })
      .groupBy('pe.entry_date')
      .orderBy('pe.entry_date', 'ASC');

    if (filters?.departmentId) qb.andWhere('pe.department_id = :departmentId', { departmentId: filters.departmentId });
    if (filters?.divisionId) {
      qb.innerJoin(Department, 'dDiv', 'dDiv.id = pe.department_id')
        .andWhere('dDiv.division_id = :divisionId', { divisionId: filters.divisionId });
    }
    applyDivisionScopeFilter(qb, 'pe.divisionId', filters?.allowedDivisionIds);

    const rows = await qb.getRawMany<{ date: string; count: string; totalActual: string }>();
    return rows.map(r => ({
      date: r.date,
      count: parseInt(r.count, 10),
      totalActual: Number(r.totalActual),
    }));
  }

  async getAlerts(companyId: string, filters?: DashboardFilters) {
    const alerts: Array<{
      type: string;
      severity: 'warning' | 'error' | 'info';
      title: string;
      description: string;
      link?: string;
      count?: number;
    }> = [];

    // ── LOW STOCK ──
    const lowStockQb = this.inventoryBalanceRepo
      .createQueryBuilder('ib')
      .innerJoin(Item, 'i', 'i.id = ib."item_id"')
      .where('ib."company_id" = :companyId', { companyId })
      .andWhere('ib.status = :status', { status: 'ACTIVE' })
      .andWhere('i."minimum_stock_level" IS NOT NULL')
      .andWhere('ib.on_hand <= i."minimum_stock_level"')
      .select('i.id', 'itemId')
      .addSelect('i.item_code', 'itemCode')
      .addSelect('i.name', 'itemName')
      .addSelect('SUM(ib.on_hand)', 'onHand')
      .addSelect('i."minimum_stock_level"', 'minStock')
      .groupBy('i.id')
      .addGroupBy('i.item_code')
      .addGroupBy('i.name')
      .addGroupBy('i."minimum_stock_level"');
    if (filters?.departmentId) lowStockQb.andWhere('i."department_id" = :departmentId', { departmentId: filters.departmentId });
    applyDivisionScopeFilter(lowStockQb, 'i.divisionId', filters?.allowedDivisionIds);
    const lowStockItems = await lowStockQb.getRawMany();

    if (lowStockItems.length > 0) {
      alerts.push({
        type: 'LOW_STOCK',
        severity: lowStockItems.some(ls => Number(ls.onHand) === 0) ? 'error' : 'warning',
        title: `${lowStockItems.length} Item(s) Below Minimum Stock`,
        description: lowStockItems.slice(0, 3).map(ls => `${ls.itemCode}: ${Math.round(Number(ls.onHand) * 100) / 100} / ${ls.minStock}`).join('; '),
        link: '/inventory',
        count: lowStockItems.length,
      });
    }

    // ── MACHINE STATUS ISSUES ──
    const machineQb = this.machineRepo
      .createQueryBuilder('m')
      .where('m."company_id" = :companyId', { companyId })
      .andWhere('m.is_active = true')
      .andWhere('m.status != :status', { status: 'ACTIVE' })
      .andWhere('m.status != :inactiveStatus', { inactiveStatus: 'INACTIVE' });
    if (filters?.departmentId) machineQb.andWhere('m."department_id" = :departmentId', { departmentId: filters.departmentId });
    applyDivisionScopeFilter(machineQb, 'm.divisionId', filters?.allowedDivisionIds);
    const inactiveMachines = await machineQb.getMany();

    if (inactiveMachines.length > 0) {
      alerts.push({
        type: 'MACHINE_STATUS',
        severity: 'warning',
        title: `${inactiveMachines.length} Machine(s) Not Active`,
        description: inactiveMachines.slice(0, 3).map(m => `${m.machineCode} (${m.status})`).join(', '),
        link: '/production/machines',
        count: inactiveMachines.length,
      });
    }

    // ── EXPIRED TARGETS ──
    const expiredTargetsQb = this.machineTargetRepo
      .createQueryBuilder('mt')
      .where('mt."company_id" = :companyId', { companyId })
      .andWhere('mt.status = :status', { status: 'ACTIVE' })
      .andWhere('mt.effective_to < :today', { today: new Date().toISOString().slice(0, 10) });
    // MachineTarget has no division_id — inherit it from the target's machine.
    expiredTargetsQb.leftJoin(Machine, 'mtm', 'mtm.id = mt.machine_id');
    if (filters?.departmentId) expiredTargetsQb.andWhere('mt."department_id" = :departmentId', { departmentId: filters.departmentId });
    applyDivisionScopeFilter(expiredTargetsQb, 'mtm.divisionId', filters?.allowedDivisionIds);
    const expiredTargets = await expiredTargetsQb.getCount();

    if (expiredTargets > 0) {
      alerts.push({
        type: 'EXPIRED_TARGETS',
        severity: 'info',
        title: `${expiredTargets} Expired Machine Target(s)`,
        description: 'Active machine targets past their effective_to date. Review and update.',
        link: '/production/targets',
        count: expiredTargets,
      });
    }

    // ── OVERDUE POs ──
    const overduePOs = await this.purchaseOrderRepo
      .createQueryBuilder('po')
      .where('po."company_id" = :companyId', { companyId })
      .andWhere('po.status IN (:...statuses)', { statuses: ['DRAFT', 'APPROVED', 'PARTIAL'] })
      .andWhere('po."expected_delivery_date" < :today', { today: new Date().toISOString().slice(0, 10) })
      .getCount();

    if (overduePOs > 0) {
      alerts.push({
        type: 'OVERDUE_PO',
        severity: 'warning',
        title: `${overduePOs} Overdue Purchase Order(s)`,
        description: 'Purchase orders past their expected delivery date.',
        link: '/procurement/orders',
        count: overduePOs,
      });
    }

    // ── MISSING ROUTES ──
    const mfgItemsQb = this.itemRepo
      .createQueryBuilder('i')
      .where('i."company_id" = :companyId', { companyId })
      .andWhere('i.status = :status', { status: 'ACTIVE' })
      .andWhere('i.is_manufacturable = true')
      .select(['i.id', 'i.itemCode', 'i.name']);
    applyDivisionScopeFilter(mfgItemsQb, 'i.divisionId', filters?.allowedDivisionIds);
    const mfgItems = await mfgItemsQb.getMany();

    const activeRoutings = await this.routingRepo
      .createQueryBuilder('r')
      .select('DISTINCT r.product_id', 'productId')
      .where('r.company_id = :companyId', { companyId })
      .andWhere('r.status = :status', { status: RoutingStatus.ACTIVE })
      .getRawMany();
    const routedProductIds = new Set(activeRoutings.map(r => r.productId));

    const missingRouteItems = mfgItems.filter(item => !routedProductIds.has(item.id));
    if (missingRouteItems.length > 0) {
      alerts.push({
        type: 'MISSING_ROUTE',
        severity: 'info',
        title: `${missingRouteItems.length} Manufacturable Item(s) Without Route`,
        description: missingRouteItems.slice(0, 3).map(i => `${i.itemCode}: ${i.name}`).join('; '),
        link: '/production/routings',
        count: missingRouteItems.length,
      });
    }

    // ── MISSING BARCODES ──
    const allItemsQb = this.itemRepo
      .createQueryBuilder('i')
      .where('i."company_id" = :companyId', { companyId })
      .andWhere('i.status = :status', { status: 'ACTIVE' })
      .select('i.id', 'id');
    applyDivisionScopeFilter(allItemsQb, 'i.divisionId', filters?.allowedDivisionIds);
    const allItems = await allItemsQb.getMany();

    const itemsWithBarcodes = await this.itemBarcodeRepo
      .createQueryBuilder('ib')
      .innerJoin(Item, 'i', 'i.id = ib.item_id')
      .select('DISTINCT ib.item_id', 'itemId')
      .where('i."company_id" = :companyId', { companyId })
      .getRawMany();
    const itemsWithBarcodeIds = new Set(itemsWithBarcodes.map(r => r.itemId));

    const missingBarcodeItems = allItems.filter(item => !itemsWithBarcodeIds.has(item.id));
    if (missingBarcodeItems.length > 0) {
      alerts.push({
        type: 'MISSING_BARCODE',
        severity: 'info',
        title: `${missingBarcodeItems.length} Item(s) Without Barcode`,
        description: 'Active items missing barcode labels.',
        link: '/master-data/items',
        count: missingBarcodeItems.length,
      });
    }

    alerts.sort((a, b) => {
      const sev = { error: 0, warning: 1, info: 2 };
      return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
    });

    return alerts;
  }

  async getRecentActivity(companyId: string, limit: number = 15) {
    let logs: ActivityLog[];
    try {
      logs = await this.activityLogRepo
        .createQueryBuilder('al')
        .orderBy('al.created_at', 'DESC')
        .limit(Math.min(limit, 50))
        .getMany();
    } catch {
      logs = [];
    }

    return logs.map(log => ({
      id: log.id,
      actorEmail: log.actorEmail ?? 'System',
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      targetName: log.targetName,
      details: log.details,
      createdAt: log.createdAt,
    }));
  }

  async getDepartmentProductionLedger(
    companyId: string,
    filters: {
      departmentId?: string;
      divisionId?: string;
      dateFrom?: string;
      dateTo?: string;
      allowedDivisionIds?: string[];
    } = {},
  ) {
    const SPOKE_STAGES = [
      { key: 'rm-store', code: 'RM-STORE', name: 'Raw Material Stores (RM Wire Coil)', stageOrder: 1, prevCode: 'SUPPLIER-IN', prevName: 'Vendor / Mill Wire Coil Receipt', nextCode: 'SPD-DEPT001', nextName: 'Wire Straightening (Straightener)' },
      { key: 'straightener', code: 'SPD-DEPT001', name: 'Straightener', stageOrder: 2, prevCode: 'RM-STORE', prevName: 'Raw Material Stores (RM Wire Coil)', nextCode: 'SPD-DEPT002', nextName: 'Swaging / Spoke Heading (Dynamic Route)' },
      { key: 'swaging', code: 'SPD-DEPT002', name: 'Swagging', stageOrder: 3, prevCode: 'SPD-DEPT001', prevName: 'Straightener (Swaged Route Only)', nextCode: 'SPD-DEPT003', nextName: 'Spoke Heading' },
      { key: 'spoke', code: 'SPD-DEPT003', name: 'Spoke', stageOrder: 4, prevCode: 'SPD-DEPT002', prevName: 'Swaging + Direct Straightener Bypass', nextCode: 'SPD-DEPT006', nextName: 'Spoke Plating' },
      { key: 'plating', code: 'SPD-DEPT006', name: 'Spoke Plating', stageOrder: 5, prevCode: 'SPD-DEPT003', prevName: 'Spoke Heading', nextCode: 'SPD-DEPT008', nextName: 'Spoke Packing' },
      { key: 'packing', code: 'SPD-DEPT008', name: 'Spoke Packing', stageOrder: 6, prevCode: 'SPD-DEPT006', prevName: 'Spoke Plating', nextCode: 'FG-DISPATCH', nextName: 'Dispatch / FG Logistics' },
      { key: 'dispatch', code: 'FG-DISPATCH', name: 'Dispatch / FG Logistics', stageOrder: 7, prevCode: 'SPD-DEPT008', prevName: 'Spoke Packing', nextCode: 'CUSTOMER-GATE', nextName: 'Customer Gate / Sales Dispatch' },
    ];

    const CONTROL_CABLE_STAGES = [
      { key: 'rm-store-ccd', code: 'RM-STORE', name: 'Raw Material Stores (RM Wire Coil)', stageOrder: 1, prevCode: 'SUPPLIER-IN', prevName: 'Vendor / Wire Rod Receipt', nextCode: 'CCD-DEPT001', nextName: 'Flattening' },
      { key: 'flattening', code: 'CCD-DEPT001', name: 'Flattening', stageOrder: 2, prevCode: 'RM-STORE', prevName: 'Raw Material Stores (RM Wire Coil)', nextCode: 'CCD-DEPT002', nextName: 'Spiral' },
      { key: 'spiral', code: 'CCD-DEPT002', name: 'Spiral', stageOrder: 3, prevCode: 'CCD-DEPT001', prevName: 'Flattening', nextCode: 'CCD-DEPT003', nextName: 'PVC Coating' },
      { key: 'pvc', code: 'CCD-DEPT003', name: 'PVC Coating', stageOrder: 4, prevCode: 'CCD-DEPT002', prevName: 'Spiral', nextCode: 'CCD-DEPT004', nextName: 'Assembly' },
      { key: 'assembly', code: 'CCD-DEPT004', name: 'Assembly', stageOrder: 5, prevCode: 'CCD-DEPT003', prevName: 'PVC Coating', nextCode: 'CCD-DEPT005', nextName: 'Packing' },
      { key: 'packing', code: 'CCD-DEPT005', name: 'Packing', stageOrder: 6, prevCode: 'CCD-DEPT004', prevName: 'Assembly', nextCode: 'FG-DISPATCH', nextName: 'Dispatch / FG Logistics' },
      { key: 'dispatch-ccd', code: 'FG-DISPATCH', name: 'Dispatch / FG Logistics', stageOrder: 7, prevCode: 'CCD-DEPT005', prevName: 'Packing', nextCode: 'CUSTOMER-GATE', nextName: 'Customer Gate / Sales Dispatch' },
    ];

    // Load all active departments to build selector options
    const allDepts = await this.departmentRepo.find({
      where: { status: 'ACTIVE' as any, isActive: true },
      order: { name: 'ASC' },
    });

    const isAnchorCode = filters.departmentId === 'RM-STORE' || filters.departmentId === 'FG-DISPATCH';
    const isControlCableDiv = filters.divisionId === 'd1000000-0000-0000-0000-000000000002';
    const activeStageCatalog = isControlCableDiv ? CONTROL_CABLE_STAGES : SPOKE_STAGES;

    // Identify target department adhering to division filter (or virtual anchor node RM-STORE / FG-DISPATCH)
    let targetDept: { id: string; departmentCode: string; name: string; divisionId?: string } | undefined;
    if (isAnchorCode) {
      const anchorStage = activeStageCatalog.find(s => s.code === filters.departmentId)!;
      targetDept = {
        id: anchorStage.code,
        departmentCode: anchorStage.code,
        name: anchorStage.name,
        divisionId: filters.divisionId || 'd1000000-0000-0000-0000-000000000001',
      };
    } else {
      targetDept = allDepts.find(
        d => (d.id === filters.departmentId || d.departmentCode === filters.departmentId) && (!filters.divisionId || d.divisionId === filters.divisionId),
      );
      if (!targetDept) {
        targetDept = allDepts.find(d => d.id === filters.departmentId || d.departmentCode === filters.departmentId);
      }
      if (!targetDept) {
        if (filters.divisionId && filters.divisionId !== 'd1000000-0000-0000-0000-000000000001') {
          targetDept = allDepts.find(d => d.divisionId === filters.divisionId) || allDepts[0];
        } else {
          targetDept = allDepts.find(d => d.departmentCode === 'SPD-DEPT001') || allDepts.find(d => d.departmentCode === 'SPD-DEPT008') || allDepts[0];
        }
      }
    }

    const isCcd = isControlCableDiv
      || targetDept?.divisionId === 'd1000000-0000-0000-0000-000000000002'
      || (targetDept?.departmentCode && targetDept.departmentCode.startsWith('CCD'));

    const currentStageInfo =
      SPOKE_STAGES.find(s => s.code === targetDept?.departmentCode) ||
      CONTROL_CABLE_STAGES.find(s => s.code === targetDept?.departmentCode);
    const sourceDeptName = currentStageInfo ? currentStageInfo.prevName : 'Preceding Process / Stores';
    const targetDeptName = currentStageInfo ? currentStageInfo.nextName : 'Next Sequential Process / Warehouse';

    // Identify items that pass through Swaging vs items that bypass Swaging directly (Straightener -> Spoke Heading)
    const swagedUpstreamItemIds = new Set<string>();
    try {
      const swagingDept = allDepts.find(d => d.departmentCode === 'SPD-DEPT002');
      if (swagingDept) {
        const swagingItems = await this.itemRepo.find({
          where: { departmentId: swagingDept.id },
          select: ['id', 'productionInItemId', 'productionInItemId2', 'productionInItemId3'],
        });
        for (const si of swagingItems) {
          if (si.productionInItemId) swagedUpstreamItemIds.add(si.productionInItemId);
          if (si.productionInItemId2) swagedUpstreamItemIds.add(si.productionInItemId2);
          if (si.productionInItemId3) swagedUpstreamItemIds.add(si.productionInItemId3);
        }
      }
    } catch {
      // Fallback to item routeType / process inspection if query fails
    }

    // Query item-wise daily aggregates across active departments for dynamic multi-path routing
    const dailyQb = this.entryRepo
      .createQueryBuilder('pe')
      .innerJoin('pe.department', 'd', "d.is_active = true AND d.status = 'ACTIVE'")
      .leftJoin('pe.item', 'i')
      .where('pe.company_id = :companyId', { companyId })
      .andWhere('pe.deleted_at IS NULL')
      .select("TO_CHAR(pe.entry_date, 'YYYY-MM-DD')", 'entryDate')
      .addSelect('d.department_code', 'departmentCode')
      .addSelect('i.id', 'itemId')
      .addSelect('i.item_code', 'itemCode')
      .addSelect('i.name', 'itemName')
      .addSelect('i.route_type', 'routeType')
      .addSelect('i.process_1', 'process1')
      .addSelect('i.process_2', 'process2')
      .addSelect('i.process_3', 'process3')
      .addSelect('COALESCE(i.weight_per_piece, CASE WHEN i.pieces_per_kg > 0 THEN 1.0 / i.pieces_per_kg ELSE 0.008 END)', 'unitWeightKg')
      .addSelect('COALESCE(SUM(pe.actual_quantity), 0)', 'outQty')
      .addSelect('COALESCE(SUM(pe.scrap_quantity), 0)', 'scrapQty')
      .addSelect('COALESCE(SUM(pe.process_scrap_kg), 0)', 'processScrapKg')
      .addSelect('COUNT(pe.id)', 'entryCount')
      .addSelect('COALESCE(SUM(pe.overtime_hours), 0)', 'otHours')
      .groupBy("TO_CHAR(pe.entry_date, 'YYYY-MM-DD')")
      .addGroupBy('d.department_code')
      .addGroupBy('i.id')
      .addGroupBy('i.item_code')
      .addGroupBy('i.name')
      .addGroupBy('i.route_type')
      .addGroupBy('i.process_1')
      .addGroupBy('i.process_2')
      .addGroupBy('i.process_3')
      .addGroupBy('i.weight_per_piece')
      .addGroupBy('i.pieces_per_kg')
      .orderBy("TO_CHAR(pe.entry_date, 'YYYY-MM-DD')", 'ASC');

    const dailyItemRows = await dailyQb.getRawMany();

    // Helper: does a Straightener item require Swaging or bypass Swaging directly to Spoke Heading?
    const doesStraightenerItemRequireSwaging = (r: any): boolean => {
      const p2 = String(r.process2 || '').toLowerCase().trim();
      const p3 = String(r.process3 || '').toLowerCase().trim();
      const nameAndCode = `${r.itemCode || ''} ${r.itemName || ''}`.toLowerCase();
      // If item explicitly says Straight or process_2/process_3 is 'spoke' without swaging, it goes Direct to Spoke Heading
      if (p3 === 'spoke' || p2 === 'spoke' || nameAndCode.includes('straight')) {
        return false;
      }
      if (p3.includes('swag') || p2.includes('swag') || nameAndCode.includes('butted') || nameAndCode.includes('swag')) {
        return true;
      }
      if (r.itemId && swagedUpstreamItemIds.has(r.itemId)) return true;
      const rt = String(r.routeType || '').toUpperCase().trim();
      if (rt === 'DIRECT_SPOKE') return false;
      if (rt === 'STANDARD_SPD') return true;
      return false;
    };

    interface DailyStageBucket {
      outQty: number;
      outWeightKg: number;
      toSwagingQty: number;
      toSwagingKg: number;
      directToSpokeQty: number;
      directToSpokeKg: number;
      scrapQty: number;
      scrapWeightKg: number;
      entryCount: number;
      otHours: number;
    }

    const emptyBucket = (): DailyStageBucket => ({
      outQty: 0,
      outWeightKg: 0,
      toSwagingQty: 0,
      toSwagingKg: 0,
      directToSpokeQty: 0,
      directToSpokeKg: 0,
      scrapQty: 0,
      scrapWeightKg: 0,
      entryCount: 0,
      otHours: 0,
    });

    const dailyByDate: Record<string, Record<string, DailyStageBucket>> = {};
    for (const r of dailyItemRows) {
      const dt = typeof r.entryDate === 'string' ? r.entryDate.slice(0, 10) : '';
      if (!dt) continue;
      if (!dailyByDate[dt]) dailyByDate[dt] = {};
      const deptCode = r.departmentCode || 'UNKNOWN';
      if (!dailyByDate[dt][deptCode]) dailyByDate[dt][deptCode] = emptyBucket();

      const unitWt = parseFloat(r.unitWeightKg) || 0.008;
      const outQty = parseFloat(r.outQty) || 0;
      const outWeightKg = outQty * unitWt;
      // CRITICAL: On Production EntryForm, pe.scrap_quantity (Part Rejection) AND pe.process_scrap_kg (Process Scrap)
      // are BOTH recorded in KILOGRAMS (KG), e.g., 0.14 KG, 0.245 KG, 79.341 KG.
      // Equivalent defective pieces are derived by dividing KG by Item Master weight_per_piece.
      const partRejectKg = parseFloat(r.scrapQty) || 0;
      const procScrapKg = parseFloat(r.processScrapKg) || 0;
      const calcScrapKg = partRejectKg + procScrapKg;
      const calcScrapPcs = unitWt > 0 ? Math.round(calcScrapKg / unitWt) : 0;

      const b = dailyByDate[dt][deptCode];
      b.outQty += outQty;
      b.outWeightKg += outWeightKg;
      b.scrapQty += calcScrapPcs;
      b.scrapWeightKg += calcScrapKg;
      b.entryCount += parseInt(r.entryCount, 10) || 0;
      b.otHours += parseFloat(r.otHours) || 0;

      if (deptCode === 'SPD-DEPT001') {
        if (doesStraightenerItemRequireSwaging(r)) {
          b.toSwagingQty += outQty;
          b.toSwagingKg += outWeightKg;
        } else {
          b.directToSpokeQty += outQty;
          b.directToSpokeKg += outWeightKg;
        }
      }
    }

    // Query discrete stock_ledger transfer / receipt / issue / dispatch vouchers
    const ledgerVouchersByDate: Record<string, {
      rmInPcs: number;
      rmInKg: number;
      rmOutPcs: number;
      rmOutKg: number;
      fgDispatchOutPcs: number;
      fgDispatchOutKg: number;
      deptInByCode: Record<string, { pcs: number; kg: number }>;
    }> = {};

    try {
      const slQb = this.stockLedgerRepo
        .createQueryBuilder('sl')
        .leftJoin(Warehouse, 'w', 'w.id = sl.warehouse_id')
        .leftJoin(Department, 'd', 'd.id = COALESCE(sl.department_id, w.department_id)')
        .leftJoin(Item, 'i', 'i.id = sl.item_id')
        .where('sl.company_id = :companyId', { companyId });

      if (isCcd) {
        slQb.andWhere(
          "(w.division_id = 'd1000000-0000-0000-0000-000000000002' OR d.division_id = 'd1000000-0000-0000-0000-000000000002' OR w.warehouse_code LIKE 'CCD%' OR w.warehouse_code = 'RM-001-CCD')"
        );
      } else {
        slQb.andWhere(
          "(w.division_id = 'd1000000-0000-0000-0000-000000000001' OR d.division_id = 'd1000000-0000-0000-0000-000000000001' OR w.warehouse_code LIKE 'SPI%' OR w.warehouse_code = 'RM-002-SPI' OR (w.warehouse_code NOT LIKE 'CCD%' AND w.warehouse_code != 'RM-001-CCD'))"
        );
      }

      const slRows = await slQb
        .select("TO_CHAR(sl.transaction_date, 'YYYY-MM-DD')", 'txDate')
        .addSelect('sl.direction', 'direction')
        .addSelect('sl.transaction_type', 'txType')
        .addSelect('w.warehouse_type', 'whType')
        .addSelect('w.warehouse_code', 'whCode')
        .addSelect('d.department_code', 'deptCode')
        .addSelect('COALESCE(i.weight_per_piece, CASE WHEN i.pieces_per_kg > 0 THEN 1.0 / i.pieces_per_kg ELSE 0.008 END)', 'unitWt')
        .addSelect('COALESCE(SUM(sl.quantity), 0)', 'qty')
        .groupBy("TO_CHAR(sl.transaction_date, 'YYYY-MM-DD')")
        .addGroupBy('sl.direction')
        .addGroupBy('sl.transaction_type')
        .addGroupBy('w.warehouse_type')
        .addGroupBy('w.warehouse_code')
        .addGroupBy('d.department_code')
        .addGroupBy('i.weight_per_piece')
        .addGroupBy('i.pieces_per_kg')
        .getRawMany();

      for (const s of slRows) {
        const dt = s.txDate;
        if (!dt) continue;
        if (!ledgerVouchersByDate[dt]) {
          ledgerVouchersByDate[dt] = {
            rmInPcs: 0,
            rmInKg: 0,
            rmOutPcs: 0,
            rmOutKg: 0,
            fgDispatchOutPcs: 0,
            fgDispatchOutKg: 0,
            deptInByCode: {},
          };
        }
        const v = ledgerVouchersByDate[dt];
        const qty = Math.abs(parseFloat(s.qty) || 0);
        const unitWt = parseFloat(s.unitWt) || 0.008;
        const dir = String(s.direction || '').toUpperCase();
        const whType = String(s.whType || '').toUpperCase();
        const whCode = String(s.whCode || '').toUpperCase();
        const txType = String(s.txType || '').toUpperCase();

        // Raw Material Store movements — scoped strictly to active division
        const isDivRmWh = isCcd
          ? (whCode === 'RM-001-CCD' || (whType === 'RAW_MATERIAL' && (whCode.includes('CCD') || !whCode.includes('SPI'))))
          : (whCode === 'RM-002-SPI' || (whType === 'RAW_MATERIAL' && !whCode.includes('CCD') && !whCode.includes('RM-001')));

        if (isDivRmWh) {
          // RM wire coil is typically tracked in KG or PCS; convert appropriately
          const kgVal = qty < 5000 ? qty : qty * unitWt;
          const pcsVal = qty < 5000 ? Math.round(qty / unitWt) : qty;
          if (dir === 'IN') {
            v.rmInPcs += pcsVal;
            v.rmInKg += kgVal;
          } else if (dir === 'OUT') {
            v.rmOutPcs += pcsVal;
            v.rmOutKg += kgVal;
          }
        }

        // Finished Goods / Dispatch movements — scoped strictly to active division
        const isDivFgWh = isCcd
          ? (whCode.includes('CCD') || whType === 'FINISHED_GOODS')
          : (!whCode.includes('CCD') && (whType === 'FINISHED_GOODS' || whCode.includes('FGDW') || whCode.includes('WH-00')));
        if (isDivFgWh && (whType === 'FINISHED_GOODS' || whCode.includes('FGDW') || whCode.includes('WH-00') || txType.includes('DISPATCH') || txType.includes('SALE'))) {
          if (dir === 'OUT') {
            v.fgDispatchOutPcs += qty;
            v.fgDispatchOutKg += qty * unitWt;
          }
        }

        // Department-specific discrete transfer-in vouchers
        if (s.deptCode && dir === 'IN' && (txType.includes('TRANSFER') || txType.includes('ISSUE'))) {
          if (!v.deptInByCode[s.deptCode]) {
            v.deptInByCode[s.deptCode] = { pcs: 0, kg: 0 };
          }
          v.deptInByCode[s.deptCode].pcs += qty;
          v.deptInByCode[s.deptCode].kg += qty * unitWt;
        }
      }
    } catch {
      // Proceed gracefully if stock_ledger table is empty
    }

    // Load individual production tickets for target department
    const ticketsByDate: Record<string, any[]> = {};
    if (!isAnchorCode && targetDept?.id) {
      const ticketsQb = this.entryRepo
        .createQueryBuilder('pe')
        .leftJoinAndSelect('pe.item', 'i')
        .leftJoinAndSelect('pe.shift', 's')
        .where('pe.company_id = :companyId', { companyId })
        .andWhere('pe.department_id = :deptId', { deptId: targetDept.id })
        .andWhere('pe.deleted_at IS NULL')
        .orderBy('pe.entry_date', 'ASC')
        .addOrderBy('pe.created_at', 'ASC');

      if (filters.dateFrom) {
        ticketsQb.andWhere('pe.entry_date >= :dateFrom', { dateFrom: filters.dateFrom });
      }
      if (filters.dateTo) {
        ticketsQb.andWhere('pe.entry_date <= :dateTo', { dateTo: filters.dateTo });
      }

      const tickets = await ticketsQb.getMany();
      const formatLocalYmd = (val: any): string => {
        if (!val) return '';
        if (typeof val === 'string') return val.slice(0, 10);
        if (val instanceof Date) {
          const y = val.getFullYear();
          const m = String(val.getMonth() + 1).padStart(2, '0');
          const d = String(val.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
        return '';
      };
      for (const t of tickets) {
        const dt = formatLocalYmd(t.entryDate);
        if (!dt) continue;
        if (!ticketsByDate[dt]) ticketsByDate[dt] = [];
        const unitWt = t.item?.weightPerPiece
          ? Number(t.item.weightPerPiece)
          : (t.item?.piecesPerKg && Number(t.item.piecesPerKg) > 0 ? 1.0 / Number(t.item.piecesPerKg) : 0.008);
        const actQty = Number(t.actualQuantity) || 0;
        // Both scrapQuantity (Part Rejection) and processScrapKg are stored in KG on ProductionEntry
        const partRejectKg = Number(t.scrapQuantity) || 0;
        const procScKg = Number(t.processScrapKg) || 0;
        const calcScrapKg = partRejectKg + procScKg;
        const calcScrapPcs = unitWt > 0 ? Math.round(calcScrapKg / unitWt) : 0;

        let ticketNextProcess = targetDeptName;
        if (targetDept?.departmentCode === 'SPD-DEPT001') {
          const requiresSwaging = doesStraightenerItemRequireSwaging({
            itemId: t.itemId,
            itemCode: t.item?.itemCode,
            itemName: t.item?.name,
            routeType: (t.item as any)?.routeType,
            process1: (t.item as any)?.process1,
            process2: (t.item as any)?.process2,
            process3: (t.item as any)?.process3,
          });
          ticketNextProcess = requiresSwaging ? '3. Swaging (Butted Route)' : '4. Spoke (Header) [Direct]';
        }

        ticketsByDate[dt].push({
          id: t.id,
          entryNumber: t.entryNumber,
          itemCode: t.item?.itemCode || 'N/A',
          itemName: t.item?.name || 'N/A',
          shiftName: t.shift?.name || 'General',
          machineNo: t.machineNo || 'N/A',
          operatorName: t.operatorName || 'N/A',
          quantityPcs: actQty,
          quantityKg: Number((actQty * unitWt).toFixed(2)),
          scrapPcs: calcScrapPcs,
          scrapKg: Number(calcScrapKg.toFixed(3)),
          overtimeHours: Number(t.overtimeHours) || 0,
          remarks: t.remarks || '',
          nextProcess: ticketNextProcess,
        });
      }
    }

    // Merge all chronological dates from production entries and stock transfer vouchers
    const dateSet = new Set<string>([...Object.keys(dailyByDate), ...Object.keys(ledgerVouchersByDate)]);
    const allDates = Array.from(dateSet).sort();

    const targetCode = targetDept?.departmentCode || '';

    // Resolve target department's physical/WIP warehouse to query actual on-hand stock and closing balances
    let targetWhCode = '';
    if (targetCode === 'RM-STORE') {
      targetWhCode = isCcd ? 'RM-001-CCD' : 'RM-002-SPI';
    } else if (targetCode === 'SPD-DEPT001') {
      targetWhCode = 'SPI-ST-001';
    } else if (targetCode === 'SPD-DEPT002') {
      targetWhCode = 'SPI-SW-002';
    } else if (targetCode === 'SPD-DEPT003') {
      targetWhCode = 'SPI-SPK-003';
    } else if (targetCode === 'SPD-DEPT006') {
      targetWhCode = 'SPI-PL-004';
    } else if (targetCode === 'SPD-DEPT008') {
      targetWhCode = 'SPI-FGDW-001';
    } else if (targetCode === 'CCD-DEPT001') {
      targetWhCode = 'CCD-FT-001';
    } else if (targetCode === 'CCD-DEPT002') {
      targetWhCode = 'CCD-SP-002';
    } else if (targetCode === 'CCD-DEPT003') {
      targetWhCode = 'CCD-PVC-003';
    } else if (targetCode === 'FG-DISPATCH') {
      targetWhCode = isCcd ? 'WH-001' : 'SPI-FGDW-001';
    }

    let targetWarehouse: Warehouse | null = null;
    try {
      if (targetWhCode) {
        targetWarehouse = await this.warehouseRepo.findOne({ where: { warehouseCode: targetWhCode } });
      }
      if (!targetWarehouse && targetDept?.id && !isAnchorCode) {
        targetWarehouse = await this.warehouseRepo.findOne({
          where: { departmentId: targetDept.id, warehouseType: 'WORK_IN_PROGRESS' as any },
        });
        if (!targetWarehouse) {
          targetWarehouse = await this.warehouseRepo.findOne({ where: { departmentId: targetDept.id } });
        }
      }
    } catch {
      // Continue gracefully if warehouse lookup fails
    }

    // 1. Authoritative Live Current Stock sitting in this department (inventory_balances)
    let liveWipPcs = 0;
    let liveWipKg = 0;
    if (targetWarehouse) {
      try {
        const liveBalRow = await this.inventoryBalanceRepo
          .createQueryBuilder('ib')
          .leftJoin(Item, 'i', 'i.id = ib.item_id')
          .where('ib.warehouse_id = :whId', { whId: targetWarehouse.id })
          .andWhere("ib.status = 'ACTIVE'")
          .select('COALESCE(SUM(ib.on_hand), 0)', 'totalPcs')
          .addSelect(
            'COALESCE(SUM(ib.on_hand * COALESCE(i.weight_per_piece, CASE WHEN i.pieces_per_kg > 0 THEN 1.0 / i.pieces_per_kg ELSE 0.008 END)), 0)',
            'totalKg'
          )
          .getRawOne();

        if (liveBalRow) {
          const rawPcs = parseFloat(liveBalRow.totalPcs) || 0;
          const rawKg = parseFloat(liveBalRow.totalKg) || 0;
          if (targetCode === 'RM-STORE') {
            liveWipKg = Number(rawPcs.toFixed(2));
            liveWipPcs = Math.round(rawPcs / 0.0115);
          } else {
            liveWipPcs = Math.round(rawPcs);
            liveWipKg = Number(rawKg.toFixed(2));
          }
        }
      } catch {
        // Fallback
      }
    }

    // 2. Date-wise closing stock ledger balances for this department's warehouse
    const closingBalByDate: Record<string, { pcs: number; kg: number }> = {};
    if (targetWarehouse) {
      try {
        const slDeltas = await this.stockLedgerRepo
          .createQueryBuilder('sl')
          .leftJoin(Item, 'i', 'i.id = sl.item_id')
          .where('sl.warehouse_id = :whId', { whId: targetWarehouse.id })
          .select("TO_CHAR(sl.transaction_date, 'YYYY-MM-DD')", 'dt')
          .addSelect(
            "SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE -sl.quantity END)",
            'deltaPcs'
          )
          .addSelect(
            "SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity * COALESCE(i.weight_per_piece, CASE WHEN i.pieces_per_kg > 0 THEN 1.0 / i.pieces_per_kg ELSE 0.008 END) ELSE -sl.quantity * COALESCE(i.weight_per_piece, CASE WHEN i.pieces_per_kg > 0 THEN 1.0 / i.pieces_per_kg ELSE 0.008 END) END)",
            'deltaKg'
          )
          .groupBy("TO_CHAR(sl.transaction_date, 'YYYY-MM-DD')")
          .orderBy("TO_CHAR(sl.transaction_date, 'YYYY-MM-DD')", 'ASC')
          .getRawMany();

        let rollingPcs = 0;
        let rollingKg = 0;
        for (const row of slDeltas) {
          rollingPcs += parseFloat(row.deltaPcs) || 0;
          rollingKg += parseFloat(row.deltaKg) || 0;
          if (targetCode === 'RM-STORE') {
            closingBalByDate[row.dt] = {
              pcs: Math.round(rollingPcs / 0.0115),
              kg: Number(rollingPcs.toFixed(2)),
            };
          } else {
            closingBalByDate[row.dt] = {
              pcs: Math.round(rollingPcs),
              kg: Number(rollingKg.toFixed(2)),
            };
          }
        }
      } catch {
        // Fallback
      }
    }

    let cumulativeFloorBalPcs = 0;
    let cumulativeFloorBalKg = 0;

    let openingBalancePcs = 0;
    let openingBalanceKg = 0;
    let totalInflowPcs = 0;
    let totalInflowKg = 0;
    let totalOutflowPcs = 0;
    let totalOutflowKg = 0;
    let totalScrapPcs = 0;
    let totalScrapKg = 0;

    const transactions: any[] = [];

    for (const dt of allDates) {
      const isBeforeDateFrom = filters.dateFrom && dt < filters.dateFrom;
      const isAfterDateTo = filters.dateTo && dt > filters.dateTo;

      const dayData = dailyByDate[dt] || {};
      const voucherData = ledgerVouchersByDate[dt];
      const deptData = dayData[targetCode] || emptyBucket();

      let inflowPcs = 0;
      let inflowKg = 0;
      let outflowPcs = deptData.outQty;
      let outflowKg = deptData.outWeightKg;
      let scrapPcs = deptData.scrapQty;
      let scrapKg = deptData.scrapWeightKg;
      let rowSourceDept = sourceDeptName;
      let rowTargetDept = targetDeptName;

      const stData = dayData['SPD-DEPT001'];
      const swData = dayData['SPD-DEPT002'];
      const spData = dayData['SPD-DEPT003'];
      const plData = dayData['SPD-DEPT006'];
      const pkData = dayData['SPD-DEPT008'];

      if (targetCode === 'RM-STORE') {
        // Position 1: Entry Anchor — Raw Material Stores (RM Wire Coil)
        // Raw material is tracked in KG (Wire Coil) and issued strictly to 2. Straightener (or 2. Flattening for CCD)
        const firstStageData = stData || dayData['CCD-DEPT001'];
        const firstStageConsumptionPcs = firstStageData ? firstStageData.outQty + firstStageData.scrapQty : 0;
        const firstStageConsumptionKg = firstStageData ? firstStageData.outWeightKg + firstStageData.scrapWeightKg : 0;

        outflowPcs = firstStageConsumptionPcs;
        outflowKg = firstStageConsumptionKg;
        inflowPcs = voucherData && voucherData.rmInPcs > 0 ? voucherData.rmInPcs : 0;
        inflowKg = voucherData && voucherData.rmInKg > 0 ? voucherData.rmInKg : 0;
        scrapPcs = 0;
        scrapKg = 0;
        rowSourceDept = 'Vendor / Steel Wire Mill (GRN Receipt)';
        rowTargetDept = isCcd ? '2. Flattening' : '2. Straightener';
      } else if (targetCode === 'SPD-DEPT001') {
        // Position 2: Wire Straightening — Inflow pulls from RM Wire Coil in KG & PCS
        // In Wire Straightening, wire coil is drawn and cut on the machine to fulfill the shift tickets.
        // Professional ERP Material Balance: Wire Drawn (Inflow) = Good Output Spoke Pieces + Cutting/Rejection Scrap.
        const discreteIn = voucherData?.deptInByCode['SPD-DEPT001'];
        if (discreteIn && discreteIn.pcs > 0) {
          inflowPcs = discreteIn.pcs;
          inflowKg = discreteIn.kg;
        } else if (outflowPcs > 0 || scrapKg > 0 || scrapPcs > 0) {
          inflowPcs = outflowPcs + scrapPcs;
          inflowKg = outflowKg + scrapKg;
        } else {
          inflowPcs = 0;
          inflowKg = 0;
        }
        rowSourceDept = '1. Raw Material Stores (RM Wire Coil)';
        if (deptData.toSwagingQty > 0 && deptData.directToSpokeQty > 0) {
          rowTargetDept = '4. Spoke (Header) [Direct] + 3. Swaging [Butted]';
        } else if (deptData.directToSpokeQty > 0 && deptData.toSwagingQty === 0) {
          rowTargetDept = '4. Spoke (Header) [Direct — No Swaging]';
        } else if (deptData.toSwagingQty > 0) {
          rowTargetDept = '3. Swaging';
        }
      } else if (targetCode === 'SPD-DEPT002') {
        // Position 3: Swaging — ONLY receives items from Straightener that require Swaging (Direct Spoke items bypass Swaging!)
        const discreteIn = voucherData?.deptInByCode['SPD-DEPT002'];
        if (discreteIn && discreteIn.pcs > 0) {
          inflowPcs = discreteIn.pcs;
          inflowKg = discreteIn.kg;
        } else if (stData) {
          inflowPcs = stData.toSwagingQty;
          inflowKg = stData.toSwagingKg;
        }
      } else if (targetCode === 'SPD-DEPT003') {
        // Position 4: Spoke Heading — Dynamically receives Swaging Outflow + Direct Spoke items bypassing Swaging from Straightener!
        const discreteIn = voucherData?.deptInByCode['SPD-DEPT003'];
        if (discreteIn && discreteIn.pcs > 0) {
          inflowPcs = discreteIn.pcs;
          inflowKg = discreteIn.kg;
        } else {
          const fromSwagingPcs = swData ? swData.outQty : 0;
          const fromSwagingKg = swData ? swData.outWeightKg : 0;
          const directFromStraightenerPcs = stData ? stData.directToSpokeQty : 0;
          const directFromStraightenerKg = stData ? stData.directToSpokeKg : 0;

          inflowPcs = fromSwagingPcs + directFromStraightenerPcs;
          inflowKg = fromSwagingKg + directFromStraightenerKg;

          if (fromSwagingPcs > 0 && directFromStraightenerPcs > 0) {
            rowSourceDept = 'Swaging + Straightener (Direct Bypass)';
          } else if (directFromStraightenerPcs > 0) {
            rowSourceDept = 'Straightener (Direct Bypass)';
          } else if (fromSwagingPcs > 0) {
            rowSourceDept = 'Swaging';
          }
        }
      } else if (targetCode === 'SPD-DEPT006') {
        // Position 5: Spoke Plating — Inflow strictly from preceding Spoke Heading outflow
        const discreteIn = voucherData?.deptInByCode['SPD-DEPT006'];
        if (discreteIn && discreteIn.pcs > 0) {
          inflowPcs = discreteIn.pcs;
          inflowKg = discreteIn.kg;
        } else if (spData) {
          inflowPcs = spData.outQty;
          inflowKg = spData.outWeightKg;
        }
      } else if (targetCode === 'SPD-DEPT008') {
        // Position 6: Spoke Packing — Inflow strictly from preceding Spoke Plating outflow
        const discreteIn = voucherData?.deptInByCode['SPD-DEPT008'];
        if (discreteIn && discreteIn.pcs > 0) {
          inflowPcs = discreteIn.pcs;
          inflowKg = discreteIn.kg;
        } else if (plData) {
          inflowPcs = plData.outQty;
          inflowKg = plData.outWeightKg;
        }
      } else if (targetCode === 'FG-DISPATCH') {
        // Position 7: Exit Anchor — Dispatch Department / Finished Goods Logistics
        const packSource = pkData || dayData['CCD-DEPT005'];
        inflowPcs = packSource ? packSource.outQty : 0;
        inflowKg = packSource ? packSource.outWeightKg : 0;
        outflowPcs = voucherData && voucherData.fgDispatchOutPcs > 0 ? voucherData.fgDispatchOutPcs : 0;
        outflowKg = voucherData && voucherData.fgDispatchOutKg > 0 ? voucherData.fgDispatchOutKg : 0;
        scrapPcs = 0;
        scrapKg = 0;
      } else if (currentStageInfo && currentStageInfo.prevCode && dayData[currentStageInfo.prevCode]) {
        // Control Cable & other multi-stage sequential departments: pull strictly from preceding stage outflow
        const prevStageData = dayData[currentStageInfo.prevCode];
        inflowPcs = prevStageData.outQty;
        inflowKg = prevStageData.outWeightKg;
      } else {
        const discreteIn = voucherData?.deptInByCode[targetCode];
        if (discreteIn && discreteIn.pcs > 0) {
          inflowPcs = discreteIn.pcs;
          inflowKg = discreteIn.kg;
        } else {
          inflowPcs = outflowPcs + scrapPcs;
          inflowKg = outflowKg + scrapKg;
        }
      }

      // Authoritative day-ending WIP stock sitting in this department on date dt
      const dayClosing = closingBalByDate[dt];
      if (dayClosing) {
        cumulativeFloorBalPcs = dayClosing.pcs;
        cumulativeFloorBalKg = dayClosing.kg;
      } else {
        cumulativeFloorBalPcs = (cumulativeFloorBalPcs + inflowPcs) - (outflowPcs + scrapPcs);
        cumulativeFloorBalKg = (cumulativeFloorBalKg + inflowKg) - (outflowKg + scrapKg);
      }

      if (isBeforeDateFrom) {
        openingBalancePcs = cumulativeFloorBalPcs;
        openingBalanceKg = cumulativeFloorBalKg;
        continue;
      }

      if (isAfterDateTo) {
        continue;
      }

      if (inflowPcs > 0 || outflowPcs > 0 || scrapKg > 0 || scrapPcs > 0 || (ticketsByDate[dt] && ticketsByDate[dt].length > 0)) {
        totalInflowPcs += inflowPcs;
        totalInflowKg += inflowKg;
        totalOutflowPcs += outflowPcs;
        totalOutflowKg += outflowKg;
        totalScrapPcs += scrapPcs;
        totalScrapKg += scrapKg;

        transactions.push({
          date: dt,
          sourceDepartment: rowSourceDept,
          targetDepartment: rowTargetDept,
          inflowPcs: Math.round(inflowPcs),
          inflowKg: Number(inflowKg.toFixed(2)),
          outflowPcs: Math.round(outflowPcs),
          outflowKg: Number(outflowKg.toFixed(2)),
          toSwagingPcs: Math.round(deptData.toSwagingQty),
          toSwagingKg: Number(deptData.toSwagingKg.toFixed(2)),
          directToSpokePcs: Math.round(deptData.directToSpokeQty),
          directToSpokeKg: Number(deptData.directToSpokeKg.toFixed(2)),
          scrapPcs: Math.round(scrapPcs),
          scrapKg: Number(scrapKg.toFixed(3)),
          runningFloorBalancePcs: Math.round(cumulativeFloorBalPcs),
          runningFloorBalanceKg: Number(cumulativeFloorBalKg.toFixed(2)),
          entryCount: deptData.entryCount,
          overtimeHours: deptData.otHours,
          tickets: ticketsByDate[dt] || [],
        });
      }
    }

    // Authoritative Current Net Floor Balance: Real live on-hand WIP stock sitting in this department
    const netFloorBalancePcs = liveWipPcs > 0 ? liveWipPcs : Math.round(cumulativeFloorBalPcs);
    const netFloorBalanceKg = liveWipKg > 0 ? liveWipKg : Number(cumulativeFloorBalKg.toFixed(2));

    transactions.sort((a, b) => b.date.localeCompare(a.date));

    let stages = SPOKE_STAGES.map(s => {
      const matched = allDepts.find(d => d.departmentCode === s.code);
      return {
        key: s.key,
        code: s.code,
        name: s.name,
        departmentId: matched?.id || s.code,
        active: targetDept?.departmentCode === s.code || targetDept?.id === (matched?.id || s.code),
      };
    });

    if (filters.divisionId && filters.divisionId !== 'd1000000-0000-0000-0000-000000000001') {
      const divDepts = allDepts.filter(d => d.divisionId === filters.divisionId);
      if (isControlCableDiv) {
        stages = CONTROL_CABLE_STAGES.map(s => {
          const matched = divDepts.find(d => d.departmentCode === s.code || d.name.toLowerCase().includes(s.name.toLowerCase()));
          return {
            key: s.key,
            code: s.code,
            name: s.name,
            departmentId: matched?.id || s.code,
            active: Boolean(targetDept?.departmentCode === s.code || targetDept?.id === (matched?.id || s.code) || (matched && targetDept?.name === matched.name)),
          };
        });
      } else if (divDepts.length > 0) {
        stages = [
          {
            key: 'rm-store-div',
            code: 'RM-STORE',
            name: 'Raw Material Stores (RM Wire Coil)',
            departmentId: 'RM-STORE',
            active: targetDept?.departmentCode === 'RM-STORE',
          },
          ...divDepts.map(d => ({
            key: d.id,
            code: d.departmentCode || d.id,
            name: d.name,
            departmentId: d.id,
            active: targetDept?.id === d.id || targetDept?.departmentCode === d.departmentCode,
          })),
          {
            key: 'fg-dispatch-div',
            code: 'FG-DISPATCH',
            name: 'Dispatch / FG Logistics',
            departmentId: 'FG-DISPATCH',
            active: targetDept?.departmentCode === 'FG-DISPATCH',
          },
        ];
      }
    }

    const activeDivisionIdForAnchors = filters.divisionId || 'd1000000-0000-0000-0000-000000000001';
    const allDepartmentOptions = [
      {
        id: 'RM-STORE',
        code: 'RM-STORE',
        name: 'Raw Material Stores (RM Wire Coil)',
        divisionId: activeDivisionIdForAnchors,
      },
      ...(filters.divisionId
        ? allDepts.filter(d => d.divisionId === filters.divisionId)
        : allDepts
      ).map(d => ({
        id: d.id,
        code: d.departmentCode,
        name: d.name,
        divisionId: d.divisionId,
      })),
      {
        id: 'FG-DISPATCH',
        code: 'FG-DISPATCH',
        name: 'Dispatch / FG Logistics',
        divisionId: activeDivisionIdForAnchors,
      },
    ];

    return {
      department: {
        id: targetDept?.id,
        code: targetDept?.departmentCode,
        name: targetDept?.name,
        sourceDepartment: sourceDeptName,
        targetDepartment: targetDeptName,
      },
      summary: {
        openingBalancePcs: Math.round(openingBalancePcs),
        openingBalanceKg: Number(openingBalanceKg.toFixed(2)),
        totalInflowPcs: Math.round(totalInflowPcs),
        totalInflowKg: Number(totalInflowKg.toFixed(2)),
        totalOutflowPcs: Math.round(totalOutflowPcs),
        totalOutflowKg: Number(totalOutflowKg.toFixed(2)),
        totalScrapPcs: Math.round(totalScrapPcs),
        totalScrapKg: Number(totalScrapKg.toFixed(2)),
        currentFloorBalancePcs: netFloorBalancePcs,
        currentFloorBalanceKg: netFloorBalanceKg,
        totalTransactions: transactions.length,
      },
      stages,
      allDepartments: allDepartmentOptions,
      transactions,
    };
  }
}

