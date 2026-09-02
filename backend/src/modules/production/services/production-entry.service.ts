import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import {
  ProductionEntry,
  ProductionEntryItem,
  ProductionEntryDowntime,
  Machine,
  Shift,
  DowntimeReason,
} from '../entities';
import { CreateProductionEntryDto, UpdateProductionEntryDto, CreateMachineDto } from '../dto';
import { Item, Uom, UomConversion } from '../../item/entities';
import { Division, Section, Department, Warehouse } from '../../organization/entities';
import { BillOfMaterials, BomLine, BomStatus } from '../../bom/entities';
import { ProductionOrder, ProductionOrderOperation } from '../entities';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import {
  MachineTargetService,
  calculateProratedTarget,
} from '../../machine-target/services/machine-target.service';
import { ProductionRoutingService } from '../../production-routing/services/production-routing.service';
import {
  familyOf,
  supportedConversions,
} from '../../item/services/uom-conversion.calculator';

const ENTRY_REFERENCE_TYPE = 'PRODUCTION_ENTRY';

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
  ) {}

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
  }): Promise<{ data: ProductionEntry[]; total: number; page: number; limit: number }> {
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
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<ProductionEntry> {
    const entry = await this.entryRepo.findOne({
      where: { id, companyId },
      relations: [
        'division', 'section', 'department', 'shift', 'item', 'uom',
        'machine', 'downtimeReason', 'productionOrder',
      ],
    });
    if (!entry || !entry.isActive) {
      throw new NotFoundException(`Production Entry with ID '${id}' not found`);
    }
    // Attach child production item lines + downtime lines for edit-mode UI
    try {
      const [items, downtimes] = await Promise.all([
        this.entryItemRepo.find({ where: { productionEntryId: id }, order: { lineNumber: 'ASC' } }),
        this.entryDowntimeRepo.find({
          where: { productionEntryId: id },
          order: { lineNumber: 'ASC' },
          relations: ['downtimeReason'],
        }),
      ]);
      (entry as any).items = items;
      (entry as any).downtimes = downtimes;
    } catch { /* child tables may not exist for legacy entries */ }
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
  }): Promise<any> {
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

    if (filters.divisionId) qb.andWhere('pe.divisionId = :divisionId', { divisionId: filters.divisionId });
    if (filters.sectionId) qb.andWhere('pe.sectionId = :sectionId', { sectionId: filters.sectionId });
    if (filters.departmentId) qb.andWhere('pe.departmentId = :departmentId', { departmentId: filters.departmentId });
    if (filters.dateFrom) qb.andWhere('pe.entryDate >= :dateFrom', { dateFrom: filters.dateFrom });
    if (filters.dateTo) qb.andWhere('pe.entryDate <= :dateTo', { dateTo: filters.dateTo });
    if (filters.shiftId) qb.andWhere('pe.shiftId = :shiftId', { shiftId: filters.shiftId });
    if (filters.machineNo) qb.andWhere('pe.machineNo ILIKE :machineNo', { machineNo: `%${filters.machineNo}%` });
    if (filters.machineId) qb.andWhere('pe.machineId = :machineId', { machineId: filters.machineId });
    if (filters.itemId) qb.andWhere('pe.itemId = :itemId', { itemId: filters.itemId });
    if (filters.uomId) qb.andWhere('pe.uomId = :uomId', { uomId: filters.uomId });
    if (filters.productionOrderId) qb.andWhere('pe.productionOrderId = :productionOrderId', { productionOrderId: filters.productionOrderId });

    qb.orderBy('division.name', 'ASC').addOrderBy('section.name', 'ASC').addOrderBy('department.name', 'ASC');
    const entries = await qb.getMany();

    interface ItemGroup {
      itemId: string;
      itemCode: string;
      itemName: string;
      uomId: string;
      uomCode: string;
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
      divisionId: string;
      divisionName: string;
      sectionId: string;
      sectionName: string;
      itemsMap: Map<string, ItemGroup>;
    }

    const deptMap = new Map<string, DeptGroup>();
    const grandUomMap = new Map<string, ItemGroup>();

    const addTo = (bucket: Map<string, ItemGroup>, e: ProductionEntry) => {
      const key = `${e.itemId}:${e.uomId}`;
      let g = bucket.get(key);
      if (!g) {
        g = {
          itemId: e.itemId,
          itemCode: e.item?.itemCode ?? '',
          itemName: e.item?.name ?? '',
          uomId: e.uomId,
          uomCode: e.uom?.code ?? '',
          targetQuantity: 0,
          actualQuantity: 0,
          scrapQuantity: 0,
          runningHours: 0,
          downtimeHours: 0,
          plannedHours: 0,
          entryCount: 0,
        };
        bucket.set(key, g);
      }
      g.targetQuantity += Number(e.targetQuantity);
      g.actualQuantity += Number(e.actualQuantity);
      g.scrapQuantity += Number(e.scrapQuantity);
      g.runningHours += Number(e.runningHours);
      g.downtimeHours += Number(e.downtimeHours);
      g.plannedHours += this.resolvePlannedHours(e);
      g.entryCount += 1;
    };

    for (const e of entries) {
      const deptKey = `${e.departmentId}`;
      let d = deptMap.get(deptKey);
      if (!d) {
        d = {
          departmentId: e.departmentId,
          departmentCode: e.department?.departmentCode ?? '',
          departmentName: e.department?.name ?? '',
          divisionId: e.divisionId,
          divisionName: e.division?.name ?? '',
          sectionId: e.sectionId,
          sectionName: e.section?.name ?? '',
          itemsMap: new Map(),
        };
        deptMap.set(deptKey, d);
      }
      addTo(d.itemsMap, e);
      addTo(grandUomMap, e);
    }

    const decorate = (g: ItemGroup) => ({
      itemId: g.itemId,
      itemCode: g.itemCode,
      itemName: g.itemName,
      uomId: g.uomId,
      uomCode: g.uomCode,
      targetQuantity: this.round4(g.targetQuantity),
      actualQuantity: this.round4(g.actualQuantity),
      scrapQuantity: this.round4(g.scrapQuantity),
      runningHours: this.round2(g.runningHours),
      downtimeHours: this.round2(g.downtimeHours),
      plannedHours: this.round2(g.plannedHours),
      entryCount: g.entryCount,
      achievementPercentage: g.targetQuantity > 0 ? this.round2((g.actualQuantity / g.targetQuantity) * 100) : null,
      efficiencyPercentage: g.plannedHours > 0 ? this.round2((g.runningHours / g.plannedHours) * 100) : null,
    });

    const departments = [...deptMap.values()].map((d) => {
      const items = [...d.itemsMap.values()].map(decorate).sort((a, b) => a.itemCode.localeCompare(b.itemCode));
      return {
        departmentId: d.departmentId,
        departmentCode: d.departmentCode,
        departmentName: d.departmentName,
        divisionId: d.divisionId,
        divisionName: d.divisionName,
        sectionId: d.sectionId,
        sectionName: d.sectionName,
        items,
        totalsByUom: [...new Set(items.map((i) => i.uomCode))].map((uomCode) => {
          const groupItems = items.filter((i) => i.uomCode === uomCode);
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
      entryCount: entries.length,
      departments,
      grandTotalsByUom,
    };
  }

  // ─── Masters ────────────────────────────────────────────────────────────────

  async findMachines(companyId: string, filters?: { departmentId?: string; search?: string }): Promise<Machine[]> {
    const qb = this.machineRepo.createQueryBuilder('m')
      .leftJoinAndSelect('m.department', 'department')
      .where('m.companyId = :companyId', { companyId })
      .andWhere('m.isActive = true');
    if (filters?.departmentId) qb.andWhere('m.departmentId = :departmentId', { departmentId: filters.departmentId });
    if (filters?.search) qb.andWhere('(m.machineCode ILIKE :search OR m.name ILIKE :search)', { search: `%${filters.search}%` });
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

  async findShifts(companyId: string): Promise<Shift[]> {
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
      entries: Array<{
        id: string;
        itemId: string;
        itemName: string | null;
        targetQuantity: number;
        actualQuantity: number;
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
    const { entryDate, shiftId, divisionId, sectionId, departmentId } = filters;

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
    if (sectionId) machinesQb.andWhere('m.sectionId = :sectionId', { sectionId });
    if (departmentId) machinesQb.andWhere('m.departmentId = :departmentId', { departmentId });
    machinesQb.orderBy('m.machineCode', 'ASC');
    const machines = await machinesQb.getMany();

    const entriesQb = this.entryRepo
      .createQueryBuilder('pe')
      .leftJoin('pe.item', 'item')
      .select([
        'pe.id',
        'pe.machineNo',
        'pe.itemId',
        'pe.targetQuantity',
        'pe.actualQuantity',
        'item.name',
      ])
      .where('pe.companyId = :companyId', { companyId })
      .andWhere('pe.isActive = true')
      .andWhere('pe.entryDate = :entryDate', { entryDate })
      .andWhere('pe.shiftId = :shiftId', { shiftId });
    if (divisionId) entriesQb.andWhere('pe.divisionId = :divisionId', { divisionId });
    if (sectionId) entriesQb.andWhere('pe.sectionId = :sectionId', { sectionId });
    if (departmentId) entriesQb.andWhere('pe.departmentId = :departmentId', { departmentId });
    const entries = await entriesQb.getMany();

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
      return {
        id: m.id,
        systemCode: m.machineId,
        machineCode: m.machineCode,
        name: m.name,
        status: (machineEntries.length > 0 ? 'ENTERED' : 'ENTRY_REQUIRED') as 'ENTERED' | 'ENTRY_REQUIRED',
        entryCount: machineEntries.length,
        divisionId: m.divisionId,
        sectionId: m.sectionId,
        departmentId: m.departmentId,
        departmentName: m.department?.name ?? null,
        entries: machineEntries.map((e) => ({
          id: e.id,
          itemId: e.itemId,
          itemName: (e.item as { name?: string } | null)?.name ?? null,
          targetQuantity: Number(e.targetQuantity),
          actualQuantity: Number(e.actualQuantity),
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

  async create(dto: CreateProductionEntryDto, companyId: string, userId?: string): Promise<ProductionEntry> {
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

    await this.assertNoDuplicate(companyId, dto.departmentId, dto.entryDate, dto.shiftId, resolved.machineNo, dto.itemId);

    // Raw Material Source Warehouse — where ACTIVE BOM raw materials are deducted
    // when the entry is posted to inventory (optional; improves backward compatibility).
    const rawMaterialWarehouseId = dto.rawMaterialWarehouseId ?? null;
    if (rawMaterialWarehouseId) {
      await this.validateRawMaterialWarehouse(rawMaterialWarehouseId, companyId);
    }

    const entry = this.entryRepo.create({
      companyId,
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
      machineTargetId: mt?.machineTargetId ?? null,
      standardHours: mt?.standardHours ?? null,
      calculatedTarget: mt?.calculatedTarget ?? null,
      actualQuantity: dto.actualQuantity,
      achievementPercentage: this.computeAchievement(
        dto.actualQuantity,
        mt ? mt.calculatedTarget : (dto.targetQuantity as number),
      ),
      efficiencyPercentage: this.computeEfficiency(dto.runningHours, resolved.plannedHours),
      runningHours: dto.runningHours,
      downtimeHours: dto.downtimeHours,
      downtimeReasonId: dto.downtimeReasonId ?? null,
      downtimeReasonText: dto.downtimeReason ?? null,
      scrapQuantity: dto.scrapQuantity,
      remarks: dto.remarks ?? null,
      rawMaterialWarehouseId,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });

    let saved: ProductionEntry;
    if (resolved.shouldPostInventory) {
      // Atomic: entry creation + inventory posting in one transaction. If the
      // posting fails (insufficient stock, invalid warehouse, etc.) the entry
      // row is rolled back too — no orphaned/unposted production records.
      saved = await this.entryRepo.manager.transaction(async (manager) => {
        const saved = await manager.getRepository(ProductionEntry).save(entry);
        await this.postInventoryAndConsume(manager, companyId, saved, resolved.warehouseId!, rawMaterialWarehouseId, userId);
        return saved;
      });
    } else {
      saved = await this.entryRepo.save(entry);
    }

    await this.persistChildren(saved.id, companyId, dto.items ?? [], dto.downtimes ?? [], userId, false);

    return saved;
  }

  async update(id: string, dto: UpdateProductionEntryDto, companyId: string, userId?: string): Promise<ProductionEntry> {
    const entry = await this.getRawEntry(id, companyId);

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
      downtimeHours: dto.downtimeHours ?? Number(entry.downtimeHours),
      rawMaterialWarehouseId: dto.rawMaterialWarehouseId !== undefined ? (dto.rawMaterialWarehouseId ?? null) : entry.rawMaterialWarehouseId ?? null,
    };

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

    Object.assign(entry, {
      ...merged,
      machineNo: resolved.machineNo,
      operatorName: dto.operatorName?.trim() ?? entry.operatorName,
      supervisorName: dto.supervisorName !== undefined ? (dto.supervisorName?.trim() ?? null) : entry.supervisorName,
      coilSize: dto.coilSize !== undefined ? (dto.coilSize?.trim() ?? null) : entry.coilSize,
      machineTargetId: mt?.machineTargetId ?? null,
      standardHours: mt?.standardHours ?? null,
      calculatedTarget: mt?.calculatedTarget ?? null,
      achievementPercentage: this.computeAchievement(merged.actualQuantity, merged.targetQuantity),
      efficiencyPercentage: this.computeEfficiency(merged.runningHours, resolved.plannedHours),
      downtimeReasonText: dto.downtimeReason !== undefined ? (dto.downtimeReason ?? null) : entry.downtimeReasonText,
      remarks: dto.remarks !== undefined ? (dto.remarks ?? null) : entry.remarks,
      updatedBy: userId ?? null,
    });

    const saved = await this.entryRepo.save(entry);
    await this.persistChildren(saved.id, companyId, dto.items ?? [], dto.downtimes ?? [], userId, true);
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
      await this.entryItemRepo.delete({ productionEntryId: entryId });
      await this.entryDowntimeRepo.delete({ productionEntryId: entryId });
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

  async remove(id: string, companyId: string, userId?: string): Promise<void> {
    const entry = await this.getRawEntry(id, companyId);
    entry.isActive = false;
    entry.updatedBy = userId ?? null;
    await this.entryRepo.save(entry);
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
    machineTargetId: string;
    uomId: string;
    uomCode: string;
    standardHours: number;
    standardTarget: number;
    calculatedTarget: number;
    usedGeneralFallback: boolean;
    itemScoped: boolean;
  } | null> {
    if (!v.machineId) return null;

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
    if (v.requestedUomId && v.requestedUomId !== t.uomId) {
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
    // Numeric guards (DTO covers create; update merges raw values)
    if (v.targetQuantity === undefined || v.targetQuantity === null) {
      throw new BadRequestException(
        'targetQuantity is required when the entry is not linked to a machine with a configured target',
      );
    }
    if (!(v.targetQuantity > 0)) throw new BadRequestException('targetQuantity must be greater than 0');
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
      if (!v.warehouseId) {
        throw new BadRequestException('warehouseId is required when postToInventory is true');
      }
      shouldPostInventory = true;
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
  ): Promise<void> {
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
  private async postInventoryAndConsume(
    manager: EntityManager,
    companyId: string,
    entry: ProductionEntry,
    warehouseId: string,
    rawMaterialWarehouseId: string | null,
    userId?: string,
  ): Promise<void> {
    if (rawMaterialWarehouseId) {
      await this.consumeRawMaterials(manager, companyId, entry, rawMaterialWarehouseId, userId);
    }

    const receipt = await this.stockLedgerService.create({
      companyId,
      transactionType: 'PRODUCTION_RECEIPT',
      itemId: entry.itemId,
      warehouseId,
      quantity: Number(entry.actualQuantity),
      uomId: entry.uomId,
      direction: 'IN',
      referenceType: ENTRY_REFERENCE_TYPE,
      referenceId: entry.id,
      notes: `Daily production receipt (${entry.machineNo}, ${entry.entryDate})`,
      createdBy: userId ?? undefined,
    }, manager);
    // Write the ledger reference back onto the entry (audit + double-posting guard)
    entry.inventoryReferenceId = receipt.id;
    await manager.getRepository(ProductionEntry).update(entry.id, { inventoryReferenceId: receipt.id });
    await this.inventoryBalanceService.updateBalance(
      companyId, entry.itemId, warehouseId, null, null, entry.uomId, Number(entry.actualQuantity), 'IN', manager,
    );

    if (Number(entry.scrapQuantity) > 0) {
      await this.stockLedgerService.create({
        companyId,
        transactionType: 'PRODUCTION_SCRAP',
        itemId: entry.itemId,
        warehouseId,
        quantity: Number(entry.scrapQuantity),
        uomId: entry.uomId,
        direction: 'OUT',
        referenceType: ENTRY_REFERENCE_TYPE,
        referenceId: entry.id,
        notes: `Scrap/rejection recorded for daily production entry (audit trail; no balance impact)`,
        createdBy: userId ?? undefined,
      }, manager);
    }
  }

  // ─── Automatic BOM raw-material consumption ───────────────────────────────────

  /**
   * Finds the production item's ACTIVE BOM (respecting effective dates) and
   * deducts the computed requirement of every raw-material line from the Raw
   * Material Source Warehouse, in one transaction. Validates ALL component
   * stock before any deduction, so an insufficient component rejects the whole
   * posting with no partial consumption.
   */
  private async consumeRawMaterials(
    manager: EntityManager,
    companyId: string,
    entry: ProductionEntry,
    rawMaterialWarehouseId: string,
    userId?: string,
  ): Promise<void> {
    const bom = await this.findActiveBom(companyId, entry.itemId);
    if (!bom) {
      throw new BadRequestException('No ACTIVE BOM exists for this production item.');
    }
    const lines = await this.bomLineRepo.find({ where: { bomId: bom.id }, order: { lineNumber: 'ASC' } });
    if (!lines.length) return;

    const requirements: Array<{ line: BomLine; required: number; uomCode: string; available: number }> = [];
    for (const line of lines) {
      const required = await this.computeBomRequirement(companyId, entry, bom, line);
      const component = await this.itemRepo.findOne({ where: { id: line.itemId } });
      const uomCode = component?.baseUom?.code ?? (await this.uomRepo.findOne({ where: { id: line.uomId } }))?.code ?? '';
      const available = await this.inventoryBalanceService.getAvailableStock(
        companyId, line.itemId, rawMaterialWarehouseId, undefined, undefined, manager,
      );
      requirements.push({ line, required, uomCode, available });
    }

    // Validate ALL components before touching stock — never partial.
    const missing = requirements.find((r) => r.available < r.required);
    if (missing) {
      throw new BadRequestException(
        `Raw material stock is insufficient. Required: ${this.round4(missing.required)} ${missing.uomCode} | Available: ${this.round4(missing.available)} ${missing.uomCode}`,
      );
    }

    for (const r of requirements) {
      await this.stockLedgerService.create({
        companyId,
        transactionType: 'PRODUCTION_CONSUMPTION',
        itemId: r.line.itemId,
        warehouseId: rawMaterialWarehouseId,
        quantity: r.required,
        uomId: r.line.uomId,
        direction: 'OUT',
        referenceType: ENTRY_REFERENCE_TYPE,
        referenceId: entry.id,
        notes: `Automatic raw material consumption for production entry (${entry.machineNo}, ${entry.entryDate})`,
        createdBy: userId ?? undefined,
      }, manager);
      await this.inventoryBalanceService.updateBalance(
        companyId, r.line.itemId, rawMaterialWarehouseId, null, null, r.line.uomId, r.required, 'OUT', manager,
      );
    }
  }

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

  /**
   * Correct BOM requirement for the entry's actual production quantity:
   *   productionQty (entry UOM) → product base UOM → divide by BOM base quantity
   *   → × line quantity → × (1 + scrapFactor) ÷ (yield%/100) → line UOM → item base UOM.
   */
  private async computeBomRequirement(companyId: string, entry: ProductionEntry, bom: BillOfMaterials, line: BomLine): Promise<number> {
    const product = await this.itemRepo.findOne({ where: { id: entry.itemId } });
    const productBaseUomId = product?.baseUomId ?? entry.uomId;
    const productionQty = Number(entry.actualQuantity);
    const qtyInBase = entry.uomId === productBaseUomId ? productionQty : await this.convertQty(entry.uomId, productBaseUomId, productionQty);
    const units = qtyInBase / Number(bom.baseQuantity || 1);
    let req = units * Number(line.quantity) * (1 + Number(line.scrapFactor || 0)) / (Number(line.yieldPercentage || 100) / 100);
    const component = await this.itemRepo.findOne({ where: { id: line.itemId } });
    if (component?.baseUomId && component.baseUomId !== line.uomId) {
      req = await this.convertQty(line.uomId, component.baseUomId, req);
    }
    return this.round4(req);
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
}
