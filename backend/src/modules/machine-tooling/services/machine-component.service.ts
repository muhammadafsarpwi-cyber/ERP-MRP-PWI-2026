import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MachineComponent, ComponentType } from '../entities/machine-component.entity';
import { ComponentChange } from '../entities/component-change.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import {
  CreateMachineComponentDto,
  UpdateMachineComponentDto,
  MachineComponentQueryDto,
} from '../dto';

export interface ComponentHistoryStats {
  expectedLifeQuantity: number | null;
  minThreshold: number | null;
  maxThreshold: number | null;
  totalChanges: number;
  firstChangeDate: string | null;
  lastChangeDate: string | null;
  installedToolCode: string | null;
  counterAtInstall: number | null;
  avgLife: number | null;
  minLife: number | null;
  maxLife: number | null;
  usedByInstalled: number | null;
  remainingByInstalled: number | null;
}

export const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

@Injectable()
export class MachineComponentService {
  constructor(
    @InjectRepository(MachineComponent)
    private readonly componentRepo: Repository<MachineComponent>,
    @InjectRepository(ComponentChange)
    private readonly changeRepo: Repository<ComponentChange>,
    @InjectRepository(Machine)
    private readonly machineRepo: Repository<Machine>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Uom)
    private readonly uomRepo: Repository<Uom>,
  ) {}

  // ─── Queries ────────────────────────────────────────────────────────────────

  async findAll(
    companyId: string,
    query: MachineComponentQueryDto,
  ): Promise<{ data: MachineComponent[]; total: number; page: number; limit: number }> {
    const {
      page = 1,
      limit = 20,
      machineId,
      componentType,
      search,
      sortBy,
      sortDir = 'ASC',
    } = query || {};

    const qb = this.componentRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.machine', 'machine')
      .leftJoinAndSelect('c.item', 'item')
      .leftJoinAndSelect('c.uom', 'uom')
      .where('c.companyId = :companyId', { companyId })
      .andWhere('c.isActive = true');

    if (machineId) qb.andWhere('c.machineId = :machineId', { machineId });
    if (componentType) qb.andWhere('c.componentType = :componentType', { componentType });
    if (search) {
      qb.andWhere(
        '(c.componentCode ILIKE :search OR c.componentName ILIKE :search OR machine.machineCode ILIKE :search OR machine.name ILIKE :search OR item.itemCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const sortMap: Record<string, string> = {
      componentCode: 'c.componentCode',
      componentName: 'c.componentName',
      componentType: 'c.componentType',
      expectedLifeQuantity: 'c.expectedLifeQuantity',
      machineCode: 'machine.machineCode',
      createdAt: 'c.createdAt',
    };
    const orderColumn = sortMap[sortBy ?? 'componentCode'] ?? 'c.componentCode';
    qb.orderBy(orderColumn, sortDir === 'DESC' ? 'DESC' : 'ASC');
    qb.addOrderBy('c.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<MachineComponent> {
    const component = await this.componentRepo.findOne({
      where: { id, companyId },
      relations: ['machine', 'item', 'uom'],
    });
    if (!component) {
      throw new NotFoundException(`Tool / component '${id}' not found`);
    }
    return component;
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  async create(
    dto: CreateMachineComponentDto,
    companyId: string,
    userId?: string,
  ): Promise<MachineComponent> {
    const machine = await this.assertMachineValid(companyId, dto.machineId);
    const itemId = dto.itemId ? await this.assertItemValid(companyId, dto.itemId) : null;
    const uomId = dto.uomId ? await this.assertUom(dto.uomId) : null;

    const existing = await this.componentRepo.findOne({
      where: { companyId, machineId: dto.machineId, componentCode: dto.componentCode.trim(), isActive: true },
    });
    if (existing) {
      throw new ConflictException(
        `A ${dto.componentCode} component already exists on machine '${machine.machineCode}'`,
      );
    }

    const component = this.componentRepo.create({
      companyId,
      machineId: dto.machineId,
      itemId,
      uomId,
      componentType: dto.componentType ?? ComponentType.COMPONENT,
      componentName: dto.componentName.trim(),
      componentCode: dto.componentCode.trim(),
      expectedLifeQuantity: dto.expectedLifeQuantity != null ? String(dto.expectedLifeQuantity) : null,
      minThreshold: dto.minThreshold != null ? String(dto.minThreshold) : null,
      maxThreshold: dto.maxThreshold != null ? String(dto.maxThreshold) : null,
      description: dto.description?.trim() || null,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });
    const saved = await this.componentRepo.save(component);
    return this.findOne(saved.id, companyId);
  }

  async update(
    id: string,
    dto: UpdateMachineComponentDto,
    companyId: string,
    userId?: string,
  ): Promise<MachineComponent> {
    const existing = await this.findOne(id, companyId);
    const merged: Partial<MachineComponent> = { ...existing };
    delete (merged as any).machine;
    delete (merged as any).item;
    delete (merged as any).uom;

    if (dto.machineId !== undefined) {
      const machine = await this.assertMachineValid(companyId, dto.machineId ?? (existing.machineId as string));
      merged.machineId = machine.id;
    }
    if (dto.componentType !== undefined) merged.componentType = dto.componentType;
    if (dto.componentName !== undefined) merged.componentName = dto.componentName.trim();
    if (dto.componentCode !== undefined) {
      const code = dto.componentCode.trim();
      const clash = await this.componentRepo.findOne({
        where: { companyId, machineId: existing.machineId, componentCode: code, isActive: true },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException(`A '${code}' component already exists on this machine`);
      }
      merged.componentCode = code;
    }
    if (dto.itemId !== undefined) merged.itemId = dto.itemId ? await this.assertItemValid(companyId, dto.itemId) : null;
    if (dto.uomId !== undefined) merged.uomId = dto.uomId ? await this.assertUom(dto.uomId) : null;
    if (dto.expectedLifeQuantity !== undefined) merged.expectedLifeQuantity = dto.expectedLifeQuantity != null ? String(dto.expectedLifeQuantity) : null;
    if (dto.minThreshold !== undefined) merged.minThreshold = dto.minThreshold != null ? String(dto.minThreshold) : null;
    if (dto.maxThreshold !== undefined) merged.maxThreshold = dto.maxThreshold != null ? String(dto.maxThreshold) : null;
    if (dto.description !== undefined) merged.description = dto.description?.trim() || null;
    merged.updatedBy = userId ?? null;

    Object.assign(existing, merged);
    await this.componentRepo.save(existing);
    return this.findOne(id, companyId);
  }

  async changeStatus(id: string, status: 'ACTIVE' | 'INACTIVE', companyId: string, userId?: string): Promise<MachineComponent> {
    const existing = await this.findOne(id, companyId);
    existing.isActive = status === 'ACTIVE';
    existing.updatedBy = userId ?? null;
    await this.componentRepo.save(existing);
    return this.findOne(id, companyId);
  }

  /** Soft delete per ERP convention — change history keeps its FK alive. */
  async remove(id: string, companyId: string, userId?: string): Promise<void> {
    const existing = await this.findOne(id, companyId);
    const changeCount = await this.changeRepo.count({ where: { componentId: id, companyId, isActive: true } });
    if (changeCount > 0) {
      throw new BadRequestException(
        `Component '${existing.componentCode}' has ${changeCount} change transaction(s); deactivate it instead of deleting.`,
      );
    }
    existing.isActive = false;
    existing.updatedBy = userId ?? null;
    await this.componentRepo.save(existing);
  }

  // ─── History + stats ────────────────────────────────────────────────────────

  /**
   * Derive the current machine production counter from the production-entries
   * sum. This is the documented approximation — the ERP has no native
   * per-machine counter — and is the exact integration point for a future
   * production-counter table.
   */
  async deriveMachineCounter(companyId: string, machineId: string): Promise<number | null> {
    const rows = await this.changeRepo.manager.query(
      `SELECT COALESCE(SUM(actual_quantity), 0)::numeric(19,4) AS total_quantity
         FROM production_entries
        WHERE company_id = $1 AND machine_id = $2 AND is_active = true`,
      [companyId, machineId],
    );
    return numOrNull(rows[0]?.total_quantity);
  }

  /**
   * Component detail payload: master + machine + replacement history + life
   * stats. The current machine production counter is DERIVED from the
   * production-entries sum (the ERP has no native per-machine counter; see
   * ComponentChangeService.currentCounter for the documented contract).
   */
  async getHistory(
    companyId: string,
    id: string,
    counterValue: number | null,
  ): Promise<any> {
    const component = await this.findOne(id, companyId);

    const changes = await this.changeRepo
      .createQueryBuilder('cc')
      .leftJoinAndSelect('cc.machine', 'machine')
      .leftJoinAndSelect('cc.jobCard', 'jobCard')
      .leftJoinAndSelect('cc.changedByUser', 'changedByUser')
      .where('cc.companyId = :companyId', { companyId })
      .andWhere('cc.componentId = :componentId', { componentId: id })
      .andWhere('cc.isActive = true')
      .orderBy('cc.changeDate', 'ASC')
      .addOrderBy('cc.changedAt', 'ASC')
      .getMany();

    const stats = this.computeStats(component, changes, counterValue);

    return {
      component,
      machine: {
        id: component.machine?.id ?? component.machineId,
        machineId: component.machine?.machineId ?? null,
        machineCode: component.machine?.machineCode ?? null,
        machineNumber: component.machine?.machineNumber ?? null,
        name: component.machine?.name ?? null,
      },
      counter: {
        value: counterValue,
        base: 'PRODUCTION_ENTRIES_SUM',
      },
      summary: stats,
      changes,
    };
  }

  private computeStats(
    component: MachineComponent,
    changes: ComponentChange[],
    counterValue: number | null,
  ): ComponentHistoryStats {
    const lives = changes
      .map((c) => numOrNull(c.productionSincePrevious))
      .filter((v): v is number => v !== null);

    const last = changes.length > 0 ? changes[changes.length - 1] : null;
    const counterAtInstall = last ? numOrNull(last.productionCounterAfter) : null;
    const usedByInstalled =
      counterValue !== null && counterAtInstall !== null && counterAtInstall >= 0
        ? counterValue - counterAtInstall
        : null;
    const expected = numOrNull(component.expectedLifeQuantity);
    const remainingByInstalled =
      usedByInstalled !== null && expected !== null ? Math.max(0, expected - usedByInstalled) : null;

    return {
      expectedLifeQuantity: expected,
      minThreshold: numOrNull(component.minThreshold),
      maxThreshold: numOrNull(component.maxThreshold),
      totalChanges: changes.length,
      firstChangeDate: changes.length > 0 ? changes[0].changeDate : null,
      lastChangeDate: last ? last.changeDate : null,
      installedToolCode: last ? last.newToolCode : null,
      counterAtInstall,
      avgLife: lives.length > 0 ? Number((lives.reduce((a, b) => a + b, 0) / lives.length).toFixed(4)) : null,
      minLife: lives.length > 0 ? Math.min(...lives) : null,
      maxLife: lives.length > 0 ? Math.max(...lives) : null,
      usedByInstalled,
      remainingByInstalled,
    };
  }

  // ─── Validation helpers ─────────────────────────────────────────────────────

  private async assertMachineValid(companyId: string, machineId: string): Promise<Machine> {
    const machine = await this.machineRepo.findOne({ where: { id: machineId, companyId } });
    if (!machine || !machine.isActive) {
      throw new NotFoundException(`Machine '${machineId}' not found in this company`);
    }
    return machine;
  }

  private async assertItemValid(companyId: string, itemId: string): Promise<string> {
    const item = await this.itemRepo.findOne({ where: { id: itemId, companyId } });
    if (!item || !item.isActive) {
      throw new NotFoundException(`Item '${itemId}' not found in this company`);
    }
    return item.id;
  }

  private async assertUom(uomId: string): Promise<string> {
    const uom = await this.uomRepo.findOne({ where: { id: uomId } });
    if (!uom) throw new NotFoundException(`UOM '${uomId}' not found`);
    if (uom.status !== 'ACTIVE') throw new BadRequestException(`UOM '${uom.code}' is not ACTIVE`);
    return uom.id;
  }
}