import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComponentChange, TOOL_DISPOSITION_TYPES } from '../entities/component-change.entity';
import { MachineComponent } from '../entities/machine-component.entity';
import { MachineComponentItem } from '../entities/machine-component-item.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { MaintenanceJobCard } from '../../maintenance/entities/maintenance-job-card.entity';
import { MaterialIssue } from '../../store/entities/material-issue.entity';
import {
  InstallToolDto,
  RemoveToolDto,
  UpdateDispositionDto,
  CreateComponentItemDto,
  UpdateComponentItemDto,
} from '../dto';
import { numOrNull } from './machine-component.service';

/**
 * TASK26 — Machine Tool & Component LIFECYCLE engine.
 *
 * The lifecycle is stored in `component_changes` (TASK25 extension):
 *   - install   → creates an OPEN change (closed_at IS NULL); a partial unique
 *                 index makes at most ONE active tool per company+component.
 *   - remove    → closes the open change, computes the automatic production
 *                 life = counterBefore − counterAfter (negative → rejected).
 *   - dispose   → records where the removed tool went (return/rework/scrap/...).
 *   - link-issue→ points the change at an existing POSTED material_issues row
 *                 (the store ledger already moved the stock — nothing is
 *                 duplicated).
 *
 * The machine counter is DERIVED from real `production_entries.actual_quantity`
 * (dated variant of the TASK25 SUM); the ERP has no native machine counter.
 */
@Injectable()
export class ToolLifecycleService {
  constructor(
    @InjectRepository(ComponentChange)
    private readonly changeRepo: Repository<ComponentChange>,
    @InjectRepository(MachineComponent)
    private readonly componentRepo: Repository<MachineComponent>,
    @InjectRepository(MachineComponentItem)
    private readonly componentItemRepo: Repository<MachineComponentItem>,
    @InjectRepository(Machine)
    private readonly machineRepo: Repository<Machine>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Uom)
    private readonly uomRepo: Repository<Uom>,
    @InjectRepository(MaintenanceJobCard)
    private readonly jobCardRepo: Repository<MaintenanceJobCard>,
    @InjectRepository(MaterialIssue)
    private readonly materialIssueRepo: Repository<MaterialIssue>,
  ) {}

  // ─── Derived counter ───────────────────────────────────────────────────────

  /**
   * Dated machine production counter = SUM(actual_quantity) of real production
   * entries up to (and including) `date`. This is the automatic, non-fabricated
   * basis for production life:
   *     life = deriveCounterAt(removalDate) − deriveCounterAt(installDate)
   */
  async deriveCounterAt(companyId: string, machineId: string, date: string): Promise<number> {
    const machine = await this.machineRepo.findOne({ where: { id: machineId, companyId } });
    if (!machine || !machine.isActive) {
      throw new NotFoundException(`Machine '${machineId}' not found in this company`);
    }
    const rows = await this.changeRepo.manager.query(
      `SELECT COALESCE(SUM(actual_quantity), 0)::numeric(19,4) AS counter_value
         FROM production_entries
        WHERE company_id = $1 AND machine_id = $2 AND is_active = TRUE AND entry_date <= $3`,
      [companyId, machineId, date],
    );
    return numOrNull(rows[0]?.counter_value) ?? 0;
  }

  /** Current (all-time) derived counter — matches TASK25's documented contract. */
  async currentCounter(companyId: string, machineId: string): Promise<number> {
    const machine = await this.machineRepo.findOne({ where: { id: machineId, companyId } });
    if (!machine || !machine.isActive) {
      throw new NotFoundException(`Machine '${machineId}' not found in this company`);
    }
    const rows = await this.changeRepo.manager.query(
      `SELECT COALESCE(SUM(actual_quantity), 0)::numeric(19,4) AS counter_value
         FROM production_entries
        WHERE company_id = $1 AND machine_id = $2 AND is_active = TRUE`,
      [companyId, machineId],
    );
    return numOrNull(rows[0]?.counter_value) ?? 0;
  }

  // ─── Active tools (currently installed) ────────────────────────────────────

  async activeTools(
    companyId: string,
    query: { machineId?: string; componentId?: string; search?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const { machineId, componentId, search, page = 1, limit = 50 } = query || {};
    const qb = this.changeRepo
      .createQueryBuilder('cc')
      .leftJoinAndSelect('cc.machine', 'machine')
      .leftJoinAndSelect('cc.component', 'component')
      .leftJoinAndSelect('component.item', 'componentItem')
      .leftJoinAndSelect('component.uom', 'componentUom')
      .leftJoinAndSelect('cc.jobCard', 'jobCard')
      .leftJoinAndSelect('cc.storeIssue', 'storeIssue')
      .where('cc.companyId = :companyId', { companyId })
      .andWhere('cc.isActive = true')
      .andWhere('cc.closedAt IS NULL');

    if (machineId) qb.andWhere('cc.machineId = :machineId', { machineId });
    if (componentId) qb.andWhere('cc.componentId = :componentId', { componentId });
    if (search) {
      qb.andWhere(
        '(component.componentCode ILIKE :search OR component.componentName ILIKE :search OR cc.newToolCode ILIKE :search OR machine.machineCode ILIKE :search OR machine.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    qb.orderBy('machine.machineCode', 'ASC').addOrderBy('component.componentCode', 'ASC');

    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const changes = await qb.getMany();

    // One derived counter per machine (all-time SUM), then used/remaining vs
    // the expected life for the currently installed tool.
    const machineIds = [...new Set(changes.map((c) => c.machineId))];
    const counters = new Map<string, number>();
    if (machineIds.length) {
      const rows = await this.changeRepo.manager.query(
        `SELECT machine_id, COALESCE(SUM(actual_quantity), 0)::numeric(19,4) AS counter_value
           FROM production_entries
          WHERE company_id = $1 AND machine_id = ANY($2) AND is_active = TRUE
          GROUP BY machine_id`,
        [companyId, machineIds],
      );
      for (const r of rows) counters.set(r.machine_id, numOrNull(r.counter_value) ?? 0);
    }

    const data = changes.map((c) => {
      const installCounter = numOrNull(c.productionCounterAfter);
      const derived = counters.get(c.machineId) ?? 0;
      const expected = numOrNull((c.component as any)?.expectedLifeQuantity);
      const used = installCounter !== null ? derived - installCounter : derived;
      return {
        id: c.id,
        machineId: c.machineId,
        machine: c.machine
          ? { id: c.machine.id, machineCode: c.machine.machineCode, machineNumber: c.machine.machineNumber, name: c.machine.name }
          : null,
        componentId: c.componentId,
        component: c.component
          ? {
              id: c.component.id,
              componentCode: c.component.componentCode,
              componentName: c.component.componentName,
              componentType: c.component.componentType,
              expectedLifeQuantity: expected,
              uomCode: (c.component as any).uom?.code ?? null,
            }
          : null,
        installedToolCode: c.newToolCode,
        newToolDescription: c.newToolDescription,
        installDate: c.changeDate,
        installTime: c.changeTime,
        installCounter,
        derivedCounter: derived,
        usedByInstalled: used,
        remainingByInstalled: expected !== null ? Math.max(0, expected - used) : null,
        storeIssueId: c.storeIssueId,
        storeIssueNumber: (c.storeIssue as any)?.issueNumber ?? null,
        jobCardNo: (c.jobCard as any)?.jobCardNo ?? (c.jobCard as any)?.code ?? null,
        changeDate: c.changeDate,
        closedAt: c.closedAt,
      };
    });
    return { data, total, page, limit };
  }

  async activeToolForComponent(companyId: string, componentId: string): Promise<ComponentChange | null> {
    return this.changeRepo.findOne({
      where: { companyId, componentId, isActive: true, closedAt: null as unknown as Date },
      relations: ['machine', 'component', 'component.uom', 'jobCard', 'storeIssue'],
    });
  }

  // ─── Install ────────────────────────────────────────────────────────────────

  async install(dto: InstallToolDto, companyId: string, userId?: string): Promise<ComponentChange> {
    const machine = await this.assertMachineActive(companyId, dto.machineId);
    const component = await this.assertComponentOnMachine(companyId, dto.machineId, dto.componentId);

    const open = await this.changeRepo.findOne({
      where: { companyId, componentId: dto.componentId, isActive: true, closedAt: null as unknown as Date },
    });
    if (open) {
      throw new ConflictException(
        `Component '${component.componentCode}' already has an ACTIVE tool '${open.newToolCode}' installed since ${open.changeDate}. Remove it before installing a new tool.`,
      );
    }
    if (dto.jobCardId) await this.assertJobCard(companyId, dto.jobCardId);
    if (dto.storeIssueId) await this.assertStoreIssue(companyId, dto.storeIssueId);

    const counterAfter = dto.productionCounterAfter !== undefined && dto.productionCounterAfter !== null
      ? String(dto.productionCounterAfter)
      : String(await this.deriveCounterAt(companyId, dto.machineId, dto.changeDate));

    let change = this.changeRepo.create({
      companyId,
      machineId: dto.machineId,
      componentId: dto.componentId,
      jobCardId: dto.jobCardId ?? null,
      storeIssueId: dto.storeIssueId ?? null,
      oldToolCode: null,
      newToolCode: dto.newToolCode.trim(),
      newToolDescription: dto.newToolDescription?.trim() || null,
      changeDate: dto.changeDate,
      changeTime: dto.changeTime ?? null,
      productionCounterBefore: null,
      productionCounterAfter: counterAfter,
      productionSincePrevious: null,
      reason: null,
      conditionStatus: null,
      remarks: dto.remarks?.trim() || null,
      dispositionType: null,
      dispositionNote: null,
      closedAt: null,
      changedAt: new Date(),
      changedBy: userId ?? null,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });

    change.isActive = true;
    try {
      change = await this.changeRepo.save(change);
    } catch (err: any) {
      if (err?.code === '23505' && String(err?.message ?? '').includes('uq_component_changes_single_active')) {
        throw new ConflictException(
          `Component '${component.componentCode}' already has an ACTIVE tool — remove it before installing a new one.`,
        );
      }
      throw err;
    }
    return this.lifeDetail(companyId, change.id);
  }

  // ─── Remove (close) ────────────────────────────────────────────────────────

  async remove(changeId: string, dto: RemoveToolDto, companyId: string, userId?: string): Promise<ComponentChange> {
    const change = await this.changeRepo.findOne({
      where: { id: changeId, companyId, isActive: true },
      relations: ['component', 'component.uom', 'machine', 'jobCard', 'storeIssue'],
    });
    if (!change) throw new NotFoundException(`Change '${changeId}' not found in this company`);
    if (change.closedAt) {
      throw new BadRequestException(
        `Tool '${change.newToolCode}' was already removed on ${String(change.closedAt)}.`,
      );
    }

    let counterBefore = dto.productionCounterBefore;
    if (counterBefore === undefined || counterBefore === null) {
      counterBefore = await this.deriveCounterAt(companyId, change.machineId, dto.changeDate);
    }
    const counterAfter = numOrNull(change.productionCounterAfter);
    let life: string | null = null;
    if (counterAfter !== null) {
      const lifeNum = counterBefore - counterAfter;
      if (lifeNum < 0) {
        throw new BadRequestException(
          `Production counter before (${counterBefore}) is lower than the install counter (${counterAfter}); production life would be negative. Enter a valid counter read.`,
        );
      }
      life = String(Number(lifeNum.toFixed(4)));
    }

    delete (change as any).component;
    delete (change as any).machine;
    delete (change as any).jobCard;
    delete (change as any).storeIssue;
    change.changeDate = dto.changeDate;
    change.changeTime = dto.changeTime ?? null;
    change.productionCounterBefore = String(counterBefore);
    change.productionSincePrevious = life;
    change.conditionStatus = dto.conditionStatus ?? change.conditionStatus;
    change.dispositionType = dto.dispositionType ?? change.dispositionType;
    change.dispositionNote = dto.dispositionNote?.trim() || change.dispositionNote;
    change.reason = dto.reason?.trim() || change.reason;
    change.remarks = dto.remarks?.trim() || change.remarks;
    change.closedAt = new Date();
    change.updatedBy = userId ?? null;

    await this.changeRepo.save(change);
    return this.lifeDetail(companyId, changeId);
  }

  // ─── Dispose / store-issue link ────────────────────────────────────────────

  async updateDisposition(
    changeId: string,
    dto: UpdateDispositionDto,
    companyId: string,
    userId?: string,
  ): Promise<ComponentChange> {
    const change = await this.findOneOwned(companyId, changeId);
    if (dto.dispositionType !== undefined) change.dispositionType = dto.dispositionType;
    if (dto.dispositionNote !== undefined) change.dispositionNote = dto.dispositionNote?.trim() || null;
    if (dto.reason !== undefined) change.reason = dto.reason?.trim() || change.reason;
    change.updatedBy = userId ?? null;
    await this.changeRepo.save(change);
    return this.lifeDetail(companyId, changeId);
  }

  async linkStoreIssue(changeId: string, storeIssueId: string, companyId: string, userId?: string): Promise<ComponentChange> {
    const change = await this.findOneOwned(companyId, changeId);
    const issue = await this.materialIssueRepo.findOne({ where: { id: storeIssueId, companyId } });
    if (!issue) throw new NotFoundException(`Material issue '${storeIssueId}' not found in this company`);
    if (issue.status !== 'POSTED') {
      throw new BadRequestException(`Material issue '${issue.issueNumber}' is not POSTED; only posted issues can be linked.`);
    }
    change.storeIssueId = issue.id;
    change.updatedBy = userId ?? null;
    await this.changeRepo.save(change);
    return this.lifeDetail(companyId, changeId);
  }

  async lifeDetail(companyId: string, changeId: string): Promise<any> {
    const change = await this.changeRepo.findOne({
      where: { id: changeId, companyId },
      relations: ['machine', 'component', 'component.item', 'component.uom', 'jobCard', 'storeIssue', 'changedByUser'],
    });
    if (!change || !change.isActive) throw new NotFoundException(`Change '${changeId}' not found in this company`);
    const derived = await this.currentCounter(companyId, change.machineId);
    const installCounter = numOrNull(change.productionCounterAfter);
    const used = installCounter !== null ? derived - installCounter : derived;
    const expected = numOrNull((change.component as any)?.expectedLifeQuantity);
    return {
      ...change,
      machine: change.machine,
      component: change.component,
      jobCard: change.jobCard,
      storeIssue: change.storeIssue,
      lifecycle: {
        active: change.closedAt === null,
        derivedCounter: derived,
        usedByInstalled: used,
        remainingByInstalled: expected !== null ? Math.max(0, expected - used) : null,
      },
    };
  }

  // ─── Tool Life History / Report ────────────────────────────────────────────

  async lifeReport(
    companyId: string,
    query: {
      machineId?: string;
      componentId?: string;
      dispositionType?: string;
      conditionStatus?: string;
      from?: string;
      to?: string;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{
    data: any[];
    total: number;
    page: number;
    limit: number;
    summary: {
      installs: number;
      active: number;
      closed: number;
      withDisposition: number;
      totalProductionLife: number;
      avgLife: number | null;
      minLife: number | null;
      maxLife: number | null;
    };
  }> {
    const {
      machineId,
      componentId,
      dispositionType,
      conditionStatus,
      from,
      to,
      status,
      search,
      page = 1,
      limit = 50,
    } = query || {};

    const qb = this.changeRepo
      .createQueryBuilder('cc')
      .leftJoinAndSelect('cc.machine', 'machine')
      .leftJoinAndSelect('cc.component', 'component')
      .leftJoinAndSelect('component.uom', 'componentUom')
      .leftJoinAndSelect('cc.jobCard', 'jobCard')
      .leftJoinAndSelect('cc.storeIssue', 'storeIssue')
      .where('cc.companyId = :companyId', { companyId })
      .andWhere('cc.isActive = true');

    if (machineId) qb.andWhere('cc.machineId = :machineId', { machineId });
    if (componentId) qb.andWhere('cc.componentId = :componentId', { componentId });
    if (dispositionType) qb.andWhere('cc.dispositionType = :dispositionType', { dispositionType });
    if (conditionStatus) qb.andWhere('cc.conditionStatus = :conditionStatus', { conditionStatus });
    if (from) qb.andWhere('cc.changeDate >= :from', { from });
    if (to) qb.andWhere('cc.changeDate <= :to', { to });
    if (status === 'ACTIVE') qb.andWhere('cc.closedAt IS NULL');
    if (status === 'CLOSED') qb.andWhere('cc.closedAt IS NOT NULL');
    if (search) {
      qb.andWhere(
        '(component.componentCode ILIKE :search OR component.componentName ILIKE :search OR cc.newToolCode ILIKE :search OR cc.oldToolCode ILIKE :search OR machine.machineCode ILIKE :search OR machine.name ILIKE :search OR cc.dispositionType ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const total = await qb.getCount();
    qb.orderBy('cc.changeDate', 'DESC').addOrderBy('cc.changedAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);
    const changes = await qb.getMany();

    const data = changes.map((c) => {
      const installCounter = numOrNull(c.productionCounterAfter);
      const removalCounter = numOrNull(c.productionCounterBefore);
      const expected = numOrNull((c.component as any)?.expectedLifeQuantity);
      return {
        id: c.id,
        machineId: c.machineId,
        machine: c.machine
          ? { id: c.machine.id, machineCode: c.machine.machineCode, machineNumber: c.machine.machineNumber, name: c.machine.name }
          : null,
        componentId: c.componentId,
        component: c.component
          ? {
              id: c.component.id,
              componentCode: c.component.componentCode,
              componentName: c.component.componentName,
              componentType: c.component.componentType,
              expectedLifeQuantity: expected,
              uomCode: (c.component as any)?.uom?.code ?? null,
            }
          : null,
        toolCode: c.newToolCode,
        newToolDescription: c.newToolDescription,
        oldToolCode: c.oldToolCode,
        installDate: c.changeDate,
        installTime: c.changeTime,
        removeDate: c.closedAt ? new Date(c.closedAt).toISOString().slice(0, 10) : null,
        installCounter,
        removalCounter,
        productionLife: numOrNull(c.productionSincePrevious),
        conditionStatus: c.conditionStatus,
        dispositionType: c.dispositionType,
        dispositionNote: c.dispositionNote,
        reason: c.reason,
        remarks: c.remarks,
        status: c.closedAt === null ? 'ACTIVE' : 'CLOSED',
        closedAt: c.closedAt,
        jobCardNo: (c.jobCard as any)?.jobCardNo ?? (c.jobCard as any)?.code ?? null,
        storeIssueNumber: (c.storeIssue as any)?.issueNumber ?? null,
        storeIssueId: c.storeIssueId,
        changedAt: c.changedAt,
        changedBy: c.changedBy,
        componentType: (c.component as any)?.componentType,
      };
    });

    const lives = data.map((r) => r.productionLife).filter((v): v is number => v !== null);
    return {
      data,
      total,
      page,
      limit,
      summary: {
        installs: data.length,
        active: data.filter((r) => r.status === 'ACTIVE').length,
        closed: data.filter((r) => r.status === 'CLOSED').length,
        withDisposition: data.filter((r) => r.dispositionType).length,
        totalProductionLife: lives.length ? Number(lives.reduce((a, b) => a + b, 0).toFixed(4)) : 0,
        avgLife: lives.length ? Number((lives.reduce((a, b) => a + b, 0) / lives.length).toFixed(4)) : null,
        minLife: lives.length ? Math.min(...lives) : null,
        maxLife: lives.length ? Math.max(...lives) : null,
      },
    };
  }

  // ─── Multi-item breakdown ──────────────────────────────────────────────────

  async listComponentItems(componentId: string, companyId: string): Promise<MachineComponentItem[]> {
    await this.assertComponentOwner(companyId, componentId);
    return this.componentItemRepo.find({
      where: { componentId, companyId, isActive: true },
      relations: ['item', 'uom'],
      order: { createdAt: 'ASC' as const },
    });
  }

  async addComponentItem(
    componentId: string,
    dto: CreateComponentItemDto,
    companyId: string,
    userId?: string,
  ): Promise<MachineComponentItem> {
    const component = await this.assertComponentOwner(companyId, componentId);
    const itemId = await this.assertItem(companyId, dto.itemId);
    const uomId = dto.uomId ? await this.assertUom(dto.uomId) : null;

    const clash = await this.componentItemRepo.findOne({
      where: { companyId, componentId, itemId, isActive: true },
    });
    if (clash) {
      throw new ConflictException(`Item '${dto.itemId}' is already a breakdown line of '${component.componentCode}'.`);
    }

    const line = this.componentItemRepo.create({
      companyId,
      componentId,
      itemId,
      quantity: String(dto.quantity),
      uomId,
      notes: dto.notes?.trim() || null,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });
    const saved = await this.componentItemRepo.save(line);
    return (await this.componentItemRepo.findOne({
      where: { id: saved.id, companyId },
      relations: ['item', 'uom'],
    })) as MachineComponentItem;
  }

  async updateComponentItem(
    componentId: string,
    itemId: string,
    dto: UpdateComponentItemDto,
    companyId: string,
    userId?: string,
  ): Promise<MachineComponentItem> {
    const existing = await this.componentItemRepo.findOne({
      where: { id: itemId, componentId, companyId, isActive: true },
    });
    if (!existing) throw new NotFoundException(`Breakdown line '${itemId}' not found for this component`);
    if (dto.quantity !== undefined) existing.quantity = String(dto.quantity);
    if (dto.uomId !== undefined) {
      existing.uomId = dto.uomId ? await this.assertUom(dto.uomId) : null;
    }
    if (dto.notes !== undefined) existing.notes = dto.notes?.trim() || null;
    existing.updatedBy = userId ?? null;
    const saved = await this.componentItemRepo.save(existing);
    return (await this.componentItemRepo.findOne({
      where: { id: saved.id, companyId },
      relations: ['item', 'uom'],
    })) as MachineComponentItem;
  }

  async removeComponentItem(componentId: string, itemId: string, companyId: string, userId?: string): Promise<void> {
    const existing = await this.componentItemRepo.findOne({
      where: { id: itemId, componentId, companyId, isActive: true },
    });
    if (!existing) throw new NotFoundException(`Breakdown line '${itemId}' not found for this component`);
    existing.isActive = false;
    existing.updatedBy = userId ?? null;
    await this.componentItemRepo.save(existing);
  }

  // ─── Disposition helpers (exposed for the controller/report) ───────────────

  getDispositionTypes(): ReadonlyArray<string> {
    return TOOL_DISPOSITION_TYPES as ReadonlyArray<string>;
  }

  // ─── Validation helpers ────────────────────────────────────────────────────

  private async findOneOwned(companyId: string, changeId: string): Promise<ComponentChange> {
    const change = await this.changeRepo.findOne({ where: { id: changeId, companyId, isActive: true } });
    if (!change) throw new NotFoundException(`Change '${changeId}' not found in this company`);
    return change;
  }

  private async assertMachineActive(companyId: string, machineId: string): Promise<Machine> {
    const machine = await this.machineRepo.findOne({ where: { id: machineId, companyId } });
    if (!machine || !machine.isActive) throw new NotFoundException(`Machine '${machineId}' not found in this company`);
    if (machine.status !== 'ACTIVE') throw new BadRequestException(`Machine '${machine.machineCode}' is not ACTIVE`);
    return machine;
  }

  private async assertComponentOnMachine(companyId: string, machineId: string, componentId: string): Promise<MachineComponent> {
    const component = await this.componentRepo.findOne({
      where: { id: componentId, companyId, isActive: true },
      relations: ['machine'],
    });
    if (!component) throw new NotFoundException(`Component '${componentId}' not found in this company`);
    if (component.machineId !== machineId) {
      throw new BadRequestException(
        `Component '${component.componentCode}' is tracked on machine '${component.machine?.machineCode ?? component.machineId}' — choose that machine.`,
      );
    }
    return component;
  }

  private async assertComponentOwner(companyId: string, componentId: string): Promise<MachineComponent> {
    const component = await this.componentRepo.findOne({
      where: { id: componentId, companyId, isActive: true },
    });
    if (!component) throw new NotFoundException(`Component '${componentId}' not found in this company`);
    return component;
  }

  private async assertJobCard(companyId: string, jobCardId: string): Promise<void> {
    const jobCard = await this.jobCardRepo.findOne({ where: { id: jobCardId, companyId } });
    if (!jobCard || !jobCard.isActive) throw new NotFoundException(`Job Card '${jobCardId}' not found in this company`);
  }

  private async assertStoreIssue(companyId: string, storeIssueId: string): Promise<void> {
    const issue = await this.materialIssueRepo.findOne({ where: { id: storeIssueId, companyId } });
    if (!issue) throw new NotFoundException(`Material issue '${storeIssueId}' not found in this company`);
    if (issue.status !== 'POSTED') throw new BadRequestException(`Material issue '${issue.issueNumber}' is not POSTED`);
  }

  private async assertItem(companyId: string, itemId: string): Promise<string> {
    const item = await this.itemRepo.findOne({ where: { id: itemId, companyId } });
    if (!item || !item.isActive) throw new NotFoundException(`Item '${itemId}' not found in this company`);
    return item.id;
  }

  private async assertUom(uomId: string): Promise<string> {
    const uom = await this.uomRepo.findOne({ where: { id: uomId } });
    if (!uom) throw new NotFoundException(`UOM '${uomId}' not found`);
    if (uom.status !== 'ACTIVE') throw new BadRequestException(`UOM '${uom.code}' is not ACTIVE`);
    return uom.id;
  }

  /** Public utility (used by specs) — raw component changes of a machine for counter checks. */
  async rawChangesForMachine(companyId: string, machineId: string): Promise<ComponentChange[]> {
    return this.changeRepo.find({
      where: { companyId, machineId, isActive: true },
      order: { changeDate: 'ASC' as const },
    });
  }
}