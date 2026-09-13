import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComponentChange } from '../entities/component-change.entity';
import { MachineComponent } from '../entities/machine-component.entity';
import { Machine } from '../../production/entities/machine.entity';
import { MaintenanceJobCard } from '../../maintenance/entities/maintenance-job-card.entity';
import {
  CreateComponentChangeDto,
  UpdateComponentChangeDto,
  ComponentChangeQueryDto,
} from '../dto';
import { numOrNull } from './machine-component.service';

/** Sort key tuple so changes order deterministically by date → time → recorded-at. */
const changeSortKey = (c: { changeDate: string; changeTime?: string | null; changedAt?: Date | string | null }): string =>
  `${c.changeDate}T${(c.changeTime || '00:00:00').substring(0, 8)}+${c.changedAt ? new Date(c.changedAt).toISOString() : ''}`;

@Injectable()
export class ComponentChangeService {
  constructor(
    @InjectRepository(ComponentChange)
    private readonly changeRepo: Repository<ComponentChange>,
    @InjectRepository(MachineComponent)
    private readonly componentRepo: Repository<MachineComponent>,
    @InjectRepository(Machine)
    private readonly machineRepo: Repository<Machine>,
    @InjectRepository(MaintenanceJobCard)
    private readonly jobCardRepo: Repository<MaintenanceJobCard>,
  ) {}

  // ─── Queries ────────────────────────────────────────────────────────────────

  async findAll(
    companyId: string,
    query: ComponentChangeQueryDto,
  ): Promise<{ data: ComponentChange[]; total: number; page: number; limit: number }> {
    const {
      page = 1,
      limit = 20,
      machineId,
      componentId,
      jobCardId,
      type,
      from,
      to,
      conditionStatus,
      search,
      sortBy,
      sortDir = 'DESC',
    } = query || {};

    const qb = this.changeRepo
      .createQueryBuilder('cc')
      .leftJoinAndSelect('cc.machine', 'machine')
      .leftJoinAndSelect('cc.component', 'component')
      .leftJoinAndSelect('component.item', 'componentItem')
      .leftJoinAndSelect('component.uom', 'componentUom')
      .leftJoinAndSelect('cc.jobCard', 'jobCard')
      .leftJoinAndSelect('cc.changedByUser', 'changedByUser')
      .where('cc.companyId = :companyId', { companyId })
      .andWhere('cc.isActive = true');

    if (machineId) qb.andWhere('cc.machineId = :machineId', { machineId });
    if (componentId) qb.andWhere('cc.componentId = :componentId', { componentId });
    if (jobCardId) qb.andWhere('cc.jobCardId = :jobCardId', { jobCardId });
    if (type) qb.andWhere('component.componentType = :type', { type });
    if (conditionStatus) qb.andWhere('cc.conditionStatus = :conditionStatus', { conditionStatus });
    if (from) qb.andWhere('cc.changeDate >= :from', { from });
    if (to) qb.andWhere('cc.changeDate <= :to', { to });
    if (search) {
      qb.andWhere(
        '(component.componentName ILIKE :search OR component.componentCode ILIKE :search OR cc.newToolCode ILIKE :search OR cc.oldToolCode ILIKE :search OR machine.machineCode ILIKE :search OR machine.name ILIKE :search OR jobCard.jobCardNo ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const sortMap: Record<string, string> = {
      changeDate: 'cc.changeDate',
      machineCode: 'machine.machineCode',
      componentCode: 'component.componentCode',
      componentName: 'component.componentName',
      newToolCode: 'cc.newToolCode',
      productionSincePrevious: 'cc.productionSincePrevious',
      changedAt: 'cc.changedAt',
    };
    const orderColumn = sortMap[sortBy ?? 'changeDate'] ?? 'cc.changeDate';
    qb.orderBy(orderColumn, sortDir === 'ASC' ? 'ASC' : 'DESC');
    qb.addOrderBy('cc.changedAt', sortDir === 'ASC' ? 'ASC' : 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<ComponentChange> {
    const change = await this.changeRepo.findOne({
      where: { id, companyId },
      relations: [
        'machine',
        'component',
        'component.item',
        'component.uom',
        'jobCard',
        'changedByUser',
      ],
    });
    if (!change || !change.isActive) {
      throw new NotFoundException(`Component change '${id}' not found`);
    }
    return change;
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  async create(
    dto: CreateComponentChangeDto,
    companyId: string,
    userId?: string,
  ): Promise<ComponentChange> {
    const component = await this.assertComponentForMachine(companyId, dto.machineId, dto.componentId);
    if (dto.jobCardId) await this.assertJobCard(companyId, dto.jobCardId);

    const productionSincePrevious = await this.computeLifeSincePrevious(
      companyId,
      dto.componentId,
      dto.changeDate,
      dto.changeTime,
      dto.productionCounterBefore,
    );

    const change = this.changeRepo.create({
      companyId,
      machineId: dto.machineId,
      componentId: dto.componentId,
      jobCardId: dto.jobCardId ?? null,
      oldToolCode: dto.oldToolCode?.trim() || null,
      newToolCode: dto.newToolCode.trim(),
      newToolDescription: dto.newToolDescription?.trim() || null,
      changeDate: dto.changeDate,
      changeTime: dto.changeTime ?? null,
      productionCounterBefore: dto.productionCounterBefore != null ? String(dto.productionCounterBefore) : null,
      productionCounterAfter: dto.productionCounterAfter != null ? String(dto.productionCounterAfter) : null,
      productionSincePrevious,
      reason: dto.reason?.trim() || null,
      conditionStatus: dto.conditionStatus ?? null,
      remarks: dto.remarks?.trim() || null,
      changedAt: new Date(),
      changedBy: userId ?? null,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });

    const saved = await this.changeRepo.save(change);
    return this.findOne(saved.id, companyId);
  }

  async update(
    id: string,
    dto: UpdateComponentChangeDto,
    companyId: string,
    userId?: string,
  ): Promise<ComponentChange> {
    const existing = await this.findOne(id, companyId);

    if (dto.machineId !== undefined && dto.machineId !== existing.machineId) {
      await this.assertComponentForMachine(companyId, dto.machineId, existing.componentId);
    }
    if (dto.componentId !== undefined && dto.componentId !== existing.componentId) {
      const targetMachineId = dto.machineId ?? existing.machineId;
      await this.assertComponentForMachine(companyId, targetMachineId, dto.componentId);
    }
    if (dto.jobCardId !== undefined && dto.jobCardId) await this.assertJobCard(companyId, dto.jobCardId);

    const changeDate = dto.changeDate ?? (existing.changeDate as string);
    const changeTime = dto.changeTime !== undefined ? dto.changeTime : existing.changeTime;
    const counterBefore = dto.productionCounterBefore !== undefined
      ? dto.productionCounterBefore
      : numOrNull(existing.productionCounterBefore);
    const componentId = dto.componentId ?? (existing.componentId as string);
    const productionSincePrevious = await this.computeLifeSincePrevious(
      companyId,
      componentId,
      changeDate,
      changeTime,
      counterBefore,
    );

    delete (existing as any).machine;
    delete (existing as any).component;
    delete (existing as any).jobCard;
    delete (existing as any).changedByUser;

    if (dto.machineId !== undefined) existing.machineId = dto.machineId;
    if (dto.componentId !== undefined) existing.componentId = dto.componentId;
    if (dto.jobCardId !== undefined) existing.jobCardId = dto.jobCardId ?? null;
    if (dto.oldToolCode !== undefined) existing.oldToolCode = dto.oldToolCode?.trim() || null;
    if (dto.newToolCode !== undefined) existing.newToolCode = dto.newToolCode.trim();
    if (dto.newToolDescription !== undefined) existing.newToolDescription = dto.newToolDescription?.trim() || null;
    if (dto.changeDate !== undefined) existing.changeDate = dto.changeDate;
    if (dto.changeTime !== undefined) existing.changeTime = dto.changeTime ?? null;
    if (dto.productionCounterBefore !== undefined) existing.productionCounterBefore = dto.productionCounterBefore != null ? String(dto.productionCounterBefore) : null;
    if (dto.productionCounterAfter !== undefined) existing.productionCounterAfter = dto.productionCounterAfter != null ? String(dto.productionCounterAfter) : null;
    existing.productionSincePrevious = productionSincePrevious;
    if (dto.reason !== undefined) existing.reason = dto.reason?.trim() || null;
    if (dto.conditionStatus !== undefined) existing.conditionStatus = dto.conditionStatus ?? null;
    if (dto.remarks !== undefined) existing.remarks = dto.remarks?.trim() || null;
    existing.updatedBy = userId ?? null;

    await this.changeRepo.save(existing);
    return this.findOne(id, companyId);
  }

  /** Soft delete per ERP convention — historical snapshots keep their FK alive. */
  async remove(id: string, companyId: string, userId?: string): Promise<void> {
    const existing = await this.findOne(id, companyId);
    existing.isActive = false;
    existing.updatedBy = userId ?? null;
    await this.changeRepo.save(existing);
  }

  // ─── Production life ────────────────────────────────────────────────────────

  /**
   * Life covered by the previous tool = this change's counterBefore minus the
   * previous change's counterAfter (same machine + component). The previous
   * change is the chronologically closest one before this change.
   * Returns null when there is no previous change or counters are missing.
   */
  async computeLifeSincePrevious(
    companyId: string,
    componentId: string,
    changeDate: string,
    changeTime: string | null | undefined,
    counterBefore: number | null | undefined,
  ): Promise<string | null> {
    if (counterBefore === null || counterBefore === undefined) return null;

    const prior = await this.changeRepo
      .createQueryBuilder('cc')
      .where('cc.companyId = :companyId', { companyId })
      .andWhere('cc.componentId = :componentId', { componentId })
      .andWhere('cc.isActive = true')
      .orderBy('cc.changeDate', 'ASC')
      .addOrderBy('cc.changedAt', 'ASC')
      .getMany();

    if (prior.length === 0) return null;

    // Sort with the same deterministic key as the UI, then find the element
    // immediately before this change.
    const key = `${changeDate}T${(changeTime || '00:00:00').substring(0, 8)}++NOW`;
    const ordered = [...prior].sort((a, b) => (changeSortKey(a) < changeSortKey(b) ? -1 : 1));
    const idx = ordered.findIndex((c) => changeSortKey(c) >= key);
    const previous = idx === -1 ? ordered[ordered.length - 1] : idx === 0 ? null : ordered[idx - 1];

    const prevAfter = previous ? numOrNull(previous.productionCounterAfter) : null;
    if (!previous || prevAfter === null || prevAfter < 0) return null;

    const life = counterBefore - prevAfter;
    if (life < 0) {
      throw new BadRequestException(
        `Production counter before (${counterBefore}) is lower than the previous install counter (${prevAfter}); enter a valid counter read or move this change after the previous one.`,
      );
    }
    return String(Number(life.toFixed(4)));
  }

  /**
   * Current machine production counter. The ERP production module has no native
   * per-machine counter, so this derives one from the sum of actual_quantity
   * across production entries. THIS IS DOCUMENTED AS AN APPROXIMATION and is
   * the exact integration point where a machine counter reading could be
   * sourced from a future production-counter table.
   */
  async currentCounter(companyId: string, machineId: string): Promise<any> {
    const machine = await this.machineRepo.findOne({ where: { id: machineId, companyId } });
    if (!machine) throw new NotFoundException(`Machine '${machineId}' not found in this company`);

    const rows = await this.changeRepo.manager.query(
      `SELECT COUNT(*)::int AS entry_count,
              COALESCE(SUM(actual_quantity), 0)::numeric(19,4) AS total_quantity,
              MAX(entry_date)::text AS last_entry_date
         FROM production_entries
        WHERE company_id = $1 AND machine_id = $2 AND is_active = true`,
      [companyId, machineId],
    );
    const row = rows[0] ?? { entry_count: 0, total_quantity: 0, last_entry_date: null };
    return {
      machine: {
        id: machine.id,
        machineId: machine.machineId,
        machineCode: machine.machineCode,
        machineNumber: machine.machineNumber,
        name: machine.name,
      },
      entryCount: row.entry_count ?? 0,
      totalQuantity: numOrNull(row.total_quantity),
      lastEntryDate: row.last_entry_date ?? null,
      base: 'PRODUCTION_ENTRIES_SUM',
      note: 'No native machine production counter exists; the value is the SUM of production entry actual quantities.',
    };
  }

  /**
   * Monthly consumption report. One row per machine + component with the
   * number of changes in the month, the production covered by removed tools
   * (sum production_since_previous) and avg/min/max life observed in the month.
   */
  async monthlyReport(
    companyId: string,
    month: string,
    machineId?: string,
  ): Promise<any> {
    const start = `${month}-01`;
    const endDate = new Date(`${month}-01T00:00:00`);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);
    const end = `${month}-${String(endDate.getDate()).padStart(2, '0')}`;

    const qb = this.changeRepo
      .createQueryBuilder('cc')
      .leftJoinAndSelect('cc.machine', 'machine')
      .leftJoinAndSelect('cc.component', 'component')
      .leftJoinAndSelect('component.uom', 'componentUom')
      .where('cc.companyId = :companyId', { companyId })
      .andWhere('cc.isActive = true')
      .andWhere('cc.changeDate >= :start', { start })
      .andWhere('cc.changeDate <= :end', { end });
    if (machineId) qb.andWhere('cc.machineId = :machineId', { machineId });
    qb.orderBy('cc.changeDate', 'ASC');
    qb.addOrderBy('machine.machineCode', 'ASC');
    qb.addOrderBy('component.componentCode', 'ASC');

    const changes = await qb.getMany();
    const groups = new Map<string, any>();

    for (const c of changes) {
      const key = `${c.machineId}::${c.componentId}`;
      const life = numOrNull(c.productionSincePrevious);
      const g = groups.get(key) ?? {
        machine: c.machine
          ? { id: c.machine.id, machineCode: c.machine.machineCode, machineName: c.machine.name }
          : null,
        component: c.component
          ? {
              id: c.component.id,
              componentCode: c.component.componentCode,
              componentName: c.component.componentName,
              componentType: c.component.componentType,
              uomCode: componentUomCode(c.component),
            }
          : null,
        changes: 0,
        toolsInstalled: 0,
        productionCovered: 0,
        lifeReadings: [] as number[],
        lastChangeDate: null as string | null,
      };
      if (life !== null) g.lifeReadings.push(life);
      g.toolsInstalled += c.newToolCode ? 1 : 0;
      g.changes += 1;
      if (!g.lastChangeDate || c.changeDate > g.lastChangeDate) g.lastChangeDate = c.changeDate;
      groups.set(key, g);
    }

    const rows = Array.from(groups.values()).map((g) => {
      const reads: number[] = g.lifeReadings ?? [];
      return {
        machine: g.machine,
        component: g.component,
        changes: g.changes,
        toolsInstalled: g.toolsInstalled,
        qtyUsed: g.toolsInstalled,
        productionCovered: reads.length ? Number(reads.reduce((a, b) => a + b, 0).toFixed(4)) : 0,
        avgLife: reads.length ? Number((reads.reduce((a, b) => a + b, 0) / reads.length).toFixed(4)) : null,
        minLife: reads.length ? Math.min(...reads) : null,
        maxLife: reads.length ? Math.max(...reads) : null,
        lastChangeDate: g.lastChangeDate,
      };
    });

    rows.sort((a, b) => {
      const m = (a.machine?.machineCode ?? '').localeCompare(b.machine?.machineCode ?? '');
      if (m !== 0) return m;
      return (a.component?.componentCode ?? '').localeCompare(b.component?.componentCode ?? '');
    });

    return {
      month,
      start,
      end,
      rows,
      totals: {
        machines: new Set(rows.map((r) => r.machine?.id)).size,
        components: rows.length,
        changes: rows.reduce((a, b) => a + b.changes, 0),
        qtyUsed: rows.reduce((a, b) => a + b.qtyUsed, 0),
        productionCovered: Number(rows.reduce((a, b) => a + b.productionCovered, 0).toFixed(4)),
      },
    };
  }

  // ─── Validation helpers ─────────────────────────────────────────────────────

  private async assertComponentForMachine(companyId: string, machineId: string, componentId: string): Promise<MachineComponent> {
    const machine = await this.machineRepo.findOne({ where: { id: machineId, companyId } });
    if (!machine || !machine.isActive) {
      throw new NotFoundException(`Machine '${machineId}' not found in this company`);
    }
    if (machine.status !== 'ACTIVE') {
      throw new BadRequestException(`Machine '${machine.machineCode}' is not ACTIVE`);
    }
    const component = await this.componentRepo.findOne({
      where: { id: componentId, companyId, isActive: true },
      relations: ['machine'],
    });
    if (!component) {
      throw new NotFoundException(`Component '${componentId}' not found in this company`);
    }
    if (component.machineId !== machineId) {
      throw new BadRequestException(
        `Component '${component.componentCode}' is tracked on machine '${component.machine?.machineCode ?? component.machineId}' — change the machine first.`,
      );
    }
    return component;
  }

  private async assertJobCard(companyId: string, jobCardId: string): Promise<void> {
    const jobCard = await this.jobCardRepo.findOne({ where: { id: jobCardId, companyId } });
    if (!jobCard || !jobCard.isActive) {
      throw new NotFoundException(`Job Card '${jobCardId}' not found in this company`);
    }
  }
}

function componentUomCode(component: MachineComponent): string | null {
  return (component as any).uom?.code ?? (component as any).componentUom?.code ?? null;
}