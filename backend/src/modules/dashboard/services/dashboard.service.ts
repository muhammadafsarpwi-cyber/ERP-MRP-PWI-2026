import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull, Not } from 'typeorm';
import { ProductionEntry } from '../../production/entities/production-entry.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Shift } from '../../production/entities/shift.entity';
import { MachineTarget } from '../../machine-target/entities/machine-target.entity';
import { Item } from '../../item/entities/item.entity';
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
import { ProductionRouting, RoutingOperation } from '../../production-routing/entities';
import { ItemBarcode } from '../../item/entities/item-barcode.entity';
import { UomConversion } from '../../item/entities/uom-conversion.entity';

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

  async getFilterDivisions(companyId: string) {
    return this.divisionRepo.find({
      where: { companyId, isActive: true },
      select: ['id', 'divisionCode', 'name'],
      order: { divisionCode: 'ASC' },
    });
  }

  async getFilterSections(companyId: string, divisionId?: string) {
    if (divisionId) {
      return this.sectionRepo
        .createQueryBuilder('s')
        .innerJoin(Department, 'd', 'd.section_id = s.id')
        .where('s.company_id = :companyId', { companyId })
        .andWhere('s.is_active = true')
        .andWhere('d.division_id = :divisionId', { divisionId })
        .select(['s.id', 's.section_code', 's.name'])
        .distinct(true)
        .orderBy('s.section_code', 'ASC')
        .getMany();
    }
    return this.sectionRepo.find({
      where: { companyId, isActive: true },
      select: ['id', 'sectionCode', 'name'],
      order: { sectionCode: 'ASC' },
    });
  }

  async getFilterDepartments(companyId: string, opts: { divisionId?: string; sectionId?: string }) {
    const qb = this.departmentRepo
      .createQueryBuilder('d')
      .where('d.company_id = :companyId', { companyId })
      .andWhere('d.is_active = true');

    if (opts.sectionId) {
      qb.andWhere('d.section_id = :sectionId', { sectionId: opts.sectionId });
    }
    if (opts.divisionId) {
      qb.innerJoin(Division, 'div', 'div.id = d.division_id')
        .andWhere('d.division_id = :divisionId', { divisionId: opts.divisionId });
    }

    return qb.select(['d.id', 'd.name']).orderBy('d.name', 'ASC').getMany();
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

    const qb = (repo: Repository<any>, alias: string) => {
      const q = repo.createQueryBuilder(alias).where(`${alias}."company_id" = :companyId`, { companyId });
      if (filters?.departmentId) q.andWhere(`${alias}."department_id" = :departmentId`, { departmentId: filters.departmentId });
      return q;
    };

    const [totalItems, activeItems] = await Promise.all([
      this.itemRepo.count({ where: { companyId } }),
      this.itemRepo.count({ where: { companyId, status: 'ACTIVE' as any } }),
    ]);

    let totalMachines = await this.machineRepo.count({ where: { companyId } });
    let activeMachines = await this.machineRepo.count({ where: { companyId, status: 'ACTIVE' as any } });
    let machineStatusMap: Record<string, number> = {};

    if (filters?.departmentId) {
      const statusRows = await this.machineRepo
        .createQueryBuilder('m')
        .select('m.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('m."company_id" = :companyId', { companyId })
        .andWhere('m."department_id" = :departmentId', { departmentId: filters.departmentId })
        .groupBy('m.status')
        .getRawMany();
      totalMachines = statusRows.reduce((s, r) => s + parseInt(r.count, 10), 0);
      activeMachines = statusRows.find(r => r.status === 'ACTIVE') ? parseInt(statusRows.find(r => r.status === 'ACTIVE').count, 10) : 0;
      for (const row of statusRows) machineStatusMap[row.status] = parseInt(row.count, 10);
    } else {
      const statusRows = await this.machineRepo
        .createQueryBuilder('m')
        .select('m.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('m."company_id" = :companyId', { companyId })
        .andWhere('m.is_active = true')
        .groupBy('m.status')
        .getRawMany();
      for (const row of statusRows) machineStatusMap[row.status] = parseInt(row.count, 10);
    }

    let entryQb = this.entryRepo.createQueryBuilder('pe')
      .where('pe.company_id = :companyId', { companyId })
      .andWhere('pe.is_active = true');
    if (filters?.departmentId) entryQb.andWhere('pe.department_id = :departmentId', { departmentId: filters.departmentId });

    const [totalEntries, todayEntries] = await Promise.all([
      entryQb.getCount(),
      entryQb.clone().andWhere('pe.entry_date = :today', { today }).getCount(),
    ]);

    let targetCountQb = this.machineTargetRepo.createQueryBuilder('mt')
      .where('mt."company_id" = :companyId', { companyId });
    let targetActiveCountQb = this.machineTargetRepo.createQueryBuilder('mt')
      .where('mt."company_id" = :companyId', { companyId });
    if (filters?.departmentId) {
      targetCountQb.andWhere('mt."department_id" = :departmentId', { departmentId: filters.departmentId });
      targetActiveCountQb.andWhere('mt."department_id" = :departmentId', { departmentId: filters.departmentId });
    }

    const [totalTargets, activeTargets, totalWarehouses, totalPOs, totalSOs] = await Promise.all([
      targetCountQb.getCount(),
      targetActiveCountQb.andWhere('mt.status = :status', { status: 'ACTIVE' }).getCount(),
      this.warehouseRepo.count({ where: { companyId } }),
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
    const lowStockItems = await lowStockQb.getCount();

    const totalStockValue = await this.inventoryBalanceRepo
      .createQueryBuilder('ib')
      .select('COALESCE(SUM(ib.on_hand), 0)', 'total')
      .where('ib."company_id" = :companyId', { companyId })
      .andWhere('ib.status = :status', { status: 'ACTIVE' })
      .getRawOne();

    const activePOs = await this.purchaseOrderRepo.count({
      where: { companyId, status: In(['DRAFT', 'APPROVED', 'PARTIAL']) },
    });
    const activeSOs = await this.salesOrderRepo.count({
      where: { companyId, status: In(['Draft', 'CONFIRMED', 'PARTIAL']) },
    });

    return {
      items: { total: totalItems, active: activeItems },
      machines: { total: totalMachines, active: activeMachines, statusBreakdown: machineStatusMap },
      productionEntries: { total: totalEntries, today: todayEntries },
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

  async getProductionSummary(companyId: string, filters?: DashboardFilters) {
    const qb = this.entryRepo
      .createQueryBuilder('pe')
      .leftJoinAndSelect('pe.department', 'department')
      .leftJoinAndSelect('pe.item', 'item')
      .leftJoinAndSelect('pe.uom', 'uom')
      .leftJoinAndSelect('pe.shift', 'shift')
      .where('pe.company_id = :companyId', { companyId })
      .andWhere('pe.is_active = true');

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
        .innerJoin(Division, 'div', 'div.id = d2.division_id')
        .andWhere('d2.division_id = :divisionId', { divisionId: filters.divisionId });
    }

    const entries = await qb.getMany();

    let totalTarget = 0;
    let totalActual = 0;
    let totalScrap = 0;
    let totalRunningHours = 0;
    let totalDowntimeHours = 0;

    const departmentMap = new Map<string, {
      departmentId: string;
      departmentName: string;
      targetQuantity: number;
      actualQuantity: number;
      scrapQuantity: number;
      runningHours: number;
      downtimeHours: number;
      entryCount: number;
    }>();

    for (const e of entries) {
      totalTarget += Number(e.targetQuantity);
      totalActual += Number(e.actualQuantity);
      totalScrap += Number(e.scrapQuantity);
      totalRunningHours += Number(e.runningHours);
      totalDowntimeHours += Number(e.downtimeHours);

      const deptId = e.departmentId;
      if (!departmentMap.has(deptId)) {
        departmentMap.set(deptId, {
          departmentId: deptId,
          departmentName: e.department?.name ?? 'Unknown',
          targetQuantity: 0,
          actualQuantity: 0,
          scrapQuantity: 0,
          runningHours: 0,
          downtimeHours: 0,
          entryCount: 0,
        });
      }
      const dept = departmentMap.get(deptId)!;
      dept.targetQuantity += Number(e.targetQuantity);
      dept.actualQuantity += Number(e.actualQuantity);
      dept.scrapQuantity += Number(e.scrapQuantity);
      dept.runningHours += Number(e.runningHours);
      dept.downtimeHours += Number(e.downtimeHours);
      dept.entryCount += 1;
    }

    const departments = [...departmentMap.values()].map(d => ({
      ...d,
      achievementPercentage: d.targetQuantity > 0 ? Math.round((d.actualQuantity / d.targetQuantity) * 100 * 100) / 100 : 0,
    }));

    return {
      dateRange: { dateFrom: filters?.dateFrom ?? null, dateTo: filters?.dateTo ?? null },
      totalEntries: entries.length,
      summary: {
        totalTarget: Math.round(totalTarget * 10000) / 10000,
        totalActual: Math.round(totalActual * 10000) / 10000,
        totalScrap: Math.round(totalScrap * 10000) / 10000,
        totalRunningHours: Math.round(totalRunningHours * 100) / 100,
        totalDowntimeHours: Math.round(totalDowntimeHours * 100) / 100,
        achievementPercentage: totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100 * 100) / 100 : 0,
        efficiencyPercentage: (totalRunningHours + totalDowntimeHours) > 0
          ? Math.round((totalRunningHours / (totalRunningHours + totalDowntimeHours)) * 100 * 100) / 100
          : 0,
      },
      departments,
    };
  }

  async getProductionTrend(companyId: string, days: number = 14, filters?: DashboardFilters) {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    const dateStr = dateFrom.toISOString().slice(0, 10);

    const qb = this.entryRepo
      .createQueryBuilder('pe')
      .select('pe.entry_date', 'date')
      .addSelect('COUNT(*)', 'entryCount')
      .addSelect('SUM(pe.target_quantity)', 'target')
      .addSelect('SUM(pe.actual_quantity)', 'actual')
      .addSelect('SUM(pe.scrap_quantity)', 'scrap')
      .addSelect('SUM(pe.running_hours)', 'runningHours')
      .addSelect('SUM(pe.downtime_hours)', 'downtimeHours')
      .where('pe.company_id = :companyId', { companyId })
      .andWhere('pe.is_active = true')
      .andWhere('pe.entry_date >= :dateStr', { dateStr });

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
      .leftJoinAndSelect('m.department', 'department')
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

    machineQb.orderBy('m.machine_code', 'ASC');
    const machines = await machineQb.getMany();

    const entryQb = this.entryRepo
      .createQueryBuilder('pe')
      .select('pe.machine_no', 'machineNo')
      .addSelect('COUNT(*)', 'entryCount')
      .addSelect('SUM(pe.target_quantity)', 'target')
      .addSelect('SUM(pe.actual_quantity)', 'actual')
      .addSelect('SUM(pe.scrap_quantity)', 'scrap')
      .addSelect('SUM(pe.running_hours)', 'runningHours')
      .addSelect('SUM(pe.downtime_hours)', 'downtimeHours')
      .addSelect('AVG(pe.achievement_percentage)', 'avgAchievement')
      .where('pe.company_id = :companyId', { companyId })
      .andWhere('pe.is_active = true');

    if (filters?.dateFrom) entryQb.andWhere('pe.entry_date >= :dateFrom', { dateFrom: filters.dateFrom });
    if (filters?.dateTo) entryQb.andWhere('pe.entry_date <= :dateTo', { dateTo: filters.dateTo });
    if (filters?.departmentId) entryQb.andWhere('pe.department_id = :departmentId', { departmentId: filters.departmentId });
    if (filters?.shiftId) entryQb.andWhere('pe.shift_id = :shiftId', { shiftId: filters.shiftId });

    entryQb.groupBy('pe.machine_no').orderBy('pe.machine_no', 'ASC');
    const performance = await entryQb.getRawMany();

    const perfMap = new Map<string, any>();
    for (const p of performance) {
      perfMap.set(p.machineNo.toLowerCase(), {
        machineNo: p.machineNo,
        entryCount: parseInt(p.entryCount, 10),
        targetQuantity: Math.round(Number(p.target) * 100) / 100,
        actualQuantity: Math.round(Number(p.actual) * 100) / 100,
        scrapQuantity: Math.round(Number(p.scrap) * 100) / 100,
        runningHours: Math.round(Number(p.runningHours) * 100) / 100,
        downtimeHours: Math.round(Number(p.downtimeHours) * 100) / 100,
        avgAchievement: p.avgAchievement != null ? Math.round(Number(p.avgAchievement) * 100) / 100 : 0,
      });
    }

    return machines.map(m => {
      const perf = perfMap.get(m.machineCode.toLowerCase()) ?? {
        machineNo: m.machineCode,
        entryCount: 0,
        targetQuantity: 0,
        actualQuantity: 0,
        scrapQuantity: 0,
        runningHours: 0,
        downtimeHours: 0,
        avgAchievement: 0,
      };
      return {
        id: m.id,
        machineCode: m.machineCode,
        machineName: m.name,
        departmentName: m.department?.name ?? null,
        status: m.status,
        criticality: m.criticality,
        ...perf,
      };
    });
  }

  async getItemOverview(companyId: string, filters?: DashboardFilters) {
    const qb = this.itemRepo
      .createQueryBuilder('i')
      .select([
        'i.id', 'i.item_code', 'i.name', 'i.item_type', 'i.status',
        'i.is_manufacturable', 'i.is_purchasable', 'i.is_sellable',
        'i.cost_price', 'i.selling_price',
        'i.minimum_stock_level', 'i.maximum_stock_level', 'i.reorder_level',
        'i.department_id',
      ])
      .where('i."company_id" = :companyId', { companyId });

    if (filters?.itemType) qb.andWhere('i.item_type = :itemType', { itemType: filters.itemType });
    if (filters?.status) qb.andWhere('i.status = :status', { status: filters.status });
    if (filters?.departmentId) qb.andWhere('i.department_id = :departmentId', { departmentId: filters.departmentId });
    if (filters?.search) qb.andWhere('(LOWER(i.item_code) LIKE :search OR LOWER(i.name) LIKE :search)', { search: `%${filters.search.toLowerCase()}%` });

    qb.orderBy('i.item_code', 'ASC');
    const items = await qb.getMany();

    const stockBalances = await this.inventoryBalanceRepo
      .createQueryBuilder('ib')
      .select('ib."item_id"', 'itemId')
      .addSelect('SUM(ib.on_hand)', 'onHand')
      .addSelect('SUM(ib.reserved)', 'reserved')
      .addSelect('SUM(ib.available)', 'available')
      .where('ib."company_id" = :companyId', { companyId })
      .andWhere('ib.status = :status', { status: 'ACTIVE' })
      .groupBy('ib."item_id"')
      .getRawMany();

    const stockMap = new Map<string, any>();
    for (const s of stockBalances) {
      stockMap.set(s.itemId, {
        onHand: Math.round(Number(s.onHand) * 100) / 100,
        reserved: Math.round(Number(s.reserved) * 100) / 100,
        available: Math.round(Number(s.available) * 100) / 100,
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

    return items.map(item => ({
      id: item.id,
      itemCode: item.itemCode,
      name: item.name,
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
      stock: stockMap.get(item.id) ?? { onHand: 0, reserved: 0, available: 0 },
      production: prodMap.get(item.id) ?? { entryCount: 0, totalActual: 0 },
    }));
  }

  async getItemRoute(companyId: string, itemId: string) {
    const routing = await this.routingRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.operations', 'ops')
      .where('r.product_id = :itemId', { itemId })
      .andWhere('r.company_id = :companyId', { companyId })
      .andWhere('r.status = :status', { status: 'ACTIVE' })
      .orderBy('ops.sequence_no', 'ASC')
      .getOne();

    if (!routing) return { routing: null, operations: [] };

    return {
      routing: {
        id: routing.id,
        routingCode: routing.routingCode,
        name: routing.name,
        description: routing.description,
        estimatedTotalTime: routing.estimatedTotalTime,
        isDefault: routing.isDefault,
        baseQuantity: routing.baseQuantity,
      },
      operations: (routing.operations ?? []).map(op => ({
        sequenceNo: op.sequenceNo,
        operationCode: op.operationCode,
        operationName: op.operationName,
        description: op.description,
        departmentId: op.departmentId,
        setupTimeMinutes: Number(op.setupTimeMinutes),
        runTimeMinutes: Number(op.runTimeMinutes),
        queueTimeMinutes: Number(op.queueTimeMinutes),
        machineRequired: op.machineRequired,
        inputQuantity: Number(op.inputQuantity),
        outputQuantity: Number(op.outputQuantity),
        scrapPercentage: Number(op.scrapPercentage),
        status: op.status,
      })),
    };
  }

  async getInventorySummary(companyId: string, filters?: { warehouseId?: string }) {
    const warehouseStockQb = this.inventoryBalanceRepo
      .createQueryBuilder('ib')
      .leftJoinAndSelect('ib.warehouse', 'warehouse')
      .leftJoinAndSelect('ib.item', 'item')
      .leftJoinAndSelect('ib.uom', 'uom')
      .where('ib."company_id" = :companyId', { companyId })
      .andWhere('ib.status = :status', { status: 'ACTIVE' });

    if (filters?.warehouseId) warehouseStockQb.andWhere('ib.warehouse_id = :warehouseId', { warehouseId: filters.warehouseId });
    warehouseStockQb.orderBy('warehouse.warehouse_code', 'ASC');
    const warehouseStock = await warehouseStockQb.getMany();

    const warehousesMap = new Map<string, {
      warehouseId: string;
      warehouseCode: string;
      warehouseName: string;
      totalItems: number;
      totalOnHand: number;
      totalReserved: number;
      totalAvailable: number;
    }>();

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
    const lowStockItems = await lowStockQb.getRawMany();

    const recentTransactionsQb = this.stockLedgerRepo
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.item', 'item')
      .leftJoinAndSelect('sl.warehouse', 'warehouse')
      .where('sl."company_id" = :companyId', { companyId })
      .orderBy('sl.created_at', 'DESC')
      .limit(10);

    if (filters?.warehouseId) recentTransactionsQb.andWhere('sl.warehouse_id = :warehouseId', { warehouseId: filters.warehouseId });
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
    if (filters?.departmentId) expiredTargetsQb.andWhere('mt."department_id" = :departmentId', { departmentId: filters.departmentId });
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
    const mfgItems = await this.itemRepo
      .createQueryBuilder('i')
      .where('i."company_id" = :companyId', { companyId })
      .andWhere('i.status = :status', { status: 'ACTIVE' })
      .andWhere('i.is_manufacturable = true')
      .select(['i.id', 'i.item_code', 'i.name'])
      .getMany();

    const itemsWithRoutes = await this.entryRepo
      .createQueryBuilder('pe')
      .select('DISTINCT pe.item_id', 'itemId')
      .where('pe.company_id = :companyId', { companyId })
      .getRawMany();
    const itemsWithRouteIds = new Set(itemsWithRoutes.map(r => r.itemId));

    const missingRouteItems = mfgItems.filter(item => !itemsWithRouteIds.has(item.id));
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
    const allItems = await this.itemRepo
      .createQueryBuilder('i')
      .where('i."company_id" = :companyId', { companyId })
      .andWhere('i.status = :status', { status: 'ACTIVE' })
      .select('i.id', 'id')
      .getMany();

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
}
