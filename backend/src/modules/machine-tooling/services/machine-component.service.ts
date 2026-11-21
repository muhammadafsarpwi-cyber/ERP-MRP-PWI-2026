import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
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
import { computeChangeCumulativeLife, fetchLiveMachineCounters } from './tool-life-calc.helper';

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

export function normalizeComponentType(raw?: string | null): ComponentType {
  const upper = String(raw || '').trim().toUpperCase();
  if (
    upper === 'SPARE_CONSUMABLE' ||
    upper === 'COMPONENT' ||
    upper === 'CHAIN' ||
    upper === 'OTHER' ||
    upper === 'SPARE_PART' ||
    upper === 'CONSUMABLE'
  ) {
    return ComponentType.SPARE_CONSUMABLE;
  }
  return ComponentType.TOOLING;
}

export function componentSupportsMachine(
  component: Pick<MachineComponent, 'machineId' | 'machineIds'>,
  machineId: string,
): boolean {
  if (!machineId) return false;
  if (component.machineId === machineId) return true;
  return Array.isArray(component.machineIds) && component.machineIds.includes(machineId);
}

@Injectable()
export class MachineComponentService implements OnModuleInit {
  private readonly logger = new Logger(MachineComponentService.name);

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

  async onModuleInit(): Promise<void> {
    try {
      const mgr = this.componentRepo.manager;
      if (typeof mgr?.query !== 'function') return;

      // 1. Add machine_ids and unit_cost columns for unified multi-machine setup rows
      await mgr.query(`
        ALTER TABLE machine_components
          ADD COLUMN IF NOT EXISTS machine_ids JSONB NOT NULL DEFAULT '[]'::jsonb
      `);
      await mgr.query(`
        ALTER TABLE machine_components
          ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(19, 4) NULL
      `);

      // Populate empty machine_ids from legacy machine_id
      await mgr.query(`
        UPDATE machine_components
           SET machine_ids = jsonb_build_array(machine_id::text)
         WHERE machine_id IS NOT NULL
           AND (machine_ids IS NULL OR jsonb_array_length(machine_ids) = 0)
      `);

      // 2. Standardize legacy types -> TOOLING & SPARE_CONSUMABLE
      await mgr.query(`
        UPDATE machine_components
           SET component_type = 'TOOLING'
         WHERE UPPER(COALESCE(component_type, '')) IN ('TOOL', 'DIE', 'MOULD', 'FIXTURE')
      `);
      await mgr.query(`
        UPDATE machine_components
           SET component_type = 'SPARE_CONSUMABLE'
         WHERE UPPER(COALESCE(component_type, '')) IN ('COMPONENT', 'CHAIN', 'OTHER', 'SPARE_PART', 'CONSUMABLE')
      `);

      // 3. Backfill missing or zero Expected Life & Life Window defaults
      await mgr.query(`
        UPDATE machine_components
           SET expected_life_quantity = 600000
         WHERE is_active = TRUE
           AND (expected_life_quantity IS NULL OR expected_life_quantity <= 0)
      `);
      await mgr.query(`
        UPDATE machine_components
           SET min_threshold = 300000
         WHERE is_active = TRUE
           AND (min_threshold IS NULL OR min_threshold <= 0)
      `);
      await mgr.query(`
        UPDATE machine_components
           SET max_threshold = GREATEST(COALESCE(expected_life_quantity, 600000), 600000)
         WHERE is_active = TRUE
           AND (max_threshold IS NULL OR max_threshold <= 0)
      `);

      // 4. Scope component_changes uniqueness per machine + component so multi-machine components stay conflict-free
      await mgr.query(`ALTER TABLE component_changes DROP CONSTRAINT IF EXISTS uq_component_changes_single_active`);
      await mgr.query(`DROP INDEX IF EXISTS uq_component_changes_single_active`);
      await mgr.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_component_changes_single_active
          ON component_changes (company_id, machine_id, component_id)
          WHERE (closed_at IS NULL AND is_active = true)
      `);
      await mgr.query(`ALTER TABLE component_changes DROP CONSTRAINT IF EXISTS uq_component_changes_change`);
      await mgr.query(`DROP INDEX IF EXISTS uq_component_changes_change`);
      await mgr.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_component_changes_change
          ON component_changes (machine_id, component_id, new_tool_code, change_date)
      `);

      // 5. Merge duplicate active setup rows sharing the same item_id or component_code into one unified multi-machine row
      const activeRows: Array<any> = await mgr.query(`
        SELECT id, company_id, machine_id, machine_ids, item_id, uom_id,
               component_code, component_name, component_type,
               expected_life_quantity, min_threshold, max_threshold, created_at
          FROM machine_components
         WHERE is_active = TRUE
         ORDER BY created_at ASC
      `);

      const groups = new Map<string, any[]>();
      for (const r of activeRows || []) {
        const identity = r.item_id
          ? `ITEM::${r.item_id}`
          : `CODE::${String(r.component_code || '').trim().toUpperCase()}`;
        const key = `${r.company_id}::${identity}`;
        const arr = groups.get(key) || [];
        arr.push(r);
        groups.set(key, arr);
      }

      let mergedGroups = 0;
      for (const group of groups.values()) {
        if (group.length <= 1) continue;

        // Canonical row prefers existing non-default life window/spec or oldest created row
        const sorted = [...group].sort((a, b) => {
          const aScore = (Number(a.min_threshold || 0) !== 300000 && a.min_threshold ? 2 : 0) + (a.uom_id ? 1 : 0);
          const bScore = (Number(b.min_threshold || 0) !== 300000 && b.min_threshold ? 2 : 0) + (b.uom_id ? 1 : 0);
          if (aScore !== bScore) return bScore - aScore;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
        const canonical = sorted[0];
        const duplicates = sorted.slice(1);
        const dupIds = duplicates.map((d) => d.id);

        const unionMachineIds = Array.from(
          new Set(
            group.flatMap((g) => [
              ...(g.machine_id ? [String(g.machine_id)] : []),
              ...(Array.isArray(g.machine_ids) ? g.machine_ids.map(String) : []),
            ]),
          ),
        );

        // Repoint component_changes to canonical component_id
        await mgr.query(
          `UPDATE component_changes
              SET component_id = $1
            WHERE component_id = ANY($2::uuid[])`,
          [canonical.id, dupIds],
        );

        // Safely repoint machine_component_items without duplicating same (component_id, item_id)
        try {
          await mgr.query(
            `UPDATE machine_component_items mci
                SET is_active = FALSE
              WHERE mci.component_id = ANY($2::uuid[])
                AND EXISTS (
                  SELECT 1 FROM machine_component_items existing
                   WHERE existing.component_id = $1
                     AND existing.item_id = mci.item_id
                     AND existing.is_active = TRUE
                )`,
            [canonical.id, dupIds],
          );
          await mgr.query(
            `UPDATE machine_component_items
                SET component_id = $1
              WHERE component_id = ANY($2::uuid[])
                AND is_active = TRUE`,
            [canonical.id, dupIds],
          );
        } catch {
          // Table may not exist in all environments
        }

        const bestUomId = canonical.uom_id || duplicates.find((d) => d.uom_id)?.uom_id || null;
        const bestItemId = canonical.item_id || duplicates.find((d) => d.item_id)?.item_id || null;
        await mgr.query(
          `UPDATE machine_components
              SET machine_ids = $2::jsonb,
                  uom_id = COALESCE(uom_id, $3::uuid),
                  item_id = COALESCE(item_id, $4::uuid)
            WHERE id = $1`,
          [canonical.id, JSON.stringify(unionMachineIds), bestUomId, bestItemId],
        );
        await mgr.query(
          `UPDATE machine_components
              SET is_active = FALSE
            WHERE id = ANY($1::uuid[])`,
          [dupIds],
        );
        mergedGroups++;
      }

      // 6. Enforce unique active tool code per company across unified rows
      await mgr.query(`ALTER TABLE machine_components DROP CONSTRAINT IF EXISTS uq_machine_components_active_code`);
      await mgr.query(`DROP INDEX IF EXISTS uq_machine_components_active_code`);
      await mgr.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_machine_components_active_code
          ON machine_components (company_id, UPPER(component_code))
          WHERE (is_active = true)
      `);

      this.logger.log(
        `Verified multi-machine tooling schema & standardized types (merged ${mergedGroups} duplicate tool group(s)).`,
      );
    } catch (err: any) {
      this.logger.warn(`MachineComponent multi-machine migration skipped: ${err?.message || err}`);
    }
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  private async hydrateMachinesList(
    companyId: string,
    components: MachineComponent[],
  ): Promise<Array<MachineComponent & { machineIds: string[]; machines: Machine[] }>> {
    if (!components.length) return [];

    const allMachineIds = Array.from(
      new Set(
        components.flatMap((c) => {
          const list = Array.isArray(c.machineIds) ? c.machineIds : [];
          return [...(c.machineId ? [c.machineId] : []), ...list];
        }),
      ),
    );

    const machineList =
      allMachineIds.length > 0 && typeof this.machineRepo.find === 'function'
        ? await this.machineRepo.find({
            select: ['id', 'machineId', 'machineCode', 'machineNumber', 'name', 'departmentId', 'status'],
            where: { companyId, id: In(allMachineIds), isActive: true },
          })
        : [];
    const machineMap = new Map(machineList.map((m) => [m.id, m]));

    return components.map((c) => {
      const rawIds = Array.isArray(c.machineIds) && c.machineIds.length > 0
        ? c.machineIds
        : c.machineId
          ? [c.machineId]
          : [];
      const uniqueIds = Array.from(new Set(rawIds));
      const resolvedMachines = uniqueIds
        .map((id) => machineMap.get(id) || (c.machine && c.machine.id === id ? c.machine : null))
        .filter((m): m is Machine => Boolean(m))
        .sort((a, b) => String(a.machineCode || '').localeCompare(String(b.machineCode || '')));

      return {
        ...c,
        componentType: normalizeComponentType(c.componentType),
        machineIds: uniqueIds,
        machines: resolvedMachines,
      };
    });
  }

  async findAll(
    companyId: string,
    query: MachineComponentQueryDto,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const {
      page = 1,
      limit = 20,
      machineId,
      componentType,
      search,
      sortBy,
      sortDir = 'ASC',
    } = query || {};

    const qb = this.componentRepo.createQueryBuilder('c');
    const canNarrowSelect =
      typeof (qb as any).leftJoin === 'function' &&
      typeof (qb as any).select === 'function' &&
      typeof (qb as any).addSelect === 'function';

    if (canNarrowSelect) {
      qb.select([
        'c.id',
        'c.companyId',
        'c.machineId',
        'c.machineIds',
        'c.itemId',
        'c.componentType',
        'c.componentName',
        'c.componentCode',
        'c.uomId',
        'c.expectedLifeQuantity',
        'c.minThreshold',
        'c.maxThreshold',
        'c.unitCost',
        'c.isActive',
        'c.createdAt',
        'c.updatedAt',
      ])
        .leftJoin('c.machine', 'machine')
        .addSelect(['machine.id', 'machine.machineCode', 'machine.machineNumber', 'machine.machineId', 'machine.name', 'machine.departmentId', 'machine.status'])
        .leftJoin('c.item', 'item')
        .addSelect(['item.id', 'item.itemCode', 'item.name', 'item.itemType', 'item.baseUomId'])
        .leftJoin('c.uom', 'uom')
        .addSelect(['uom.id', 'uom.code', 'uom.name', 'uom.symbol']);
    } else {
      qb.leftJoinAndSelect('c.machine', 'machine')
        .leftJoinAndSelect('c.item', 'item')
        .leftJoinAndSelect('c.uom', 'uom');
    }

    qb.where('c.companyId = :companyId', { companyId })
      .andWhere('c.isActive = true');

    if (machineId) {
      qb.andWhere('(c.machineId = :machineId OR c.machine_ids @> :machineArr::jsonb)', {
        machineId,
        machineArr: JSON.stringify([machineId]),
      });
    }
    if (componentType) {
      const normalized = normalizeComponentType(componentType);
      if (normalized === ComponentType.TOOLING) {
        qb.andWhere("UPPER(c.componentType) IN ('TOOLING', 'TOOL', 'DIE', 'MOULD', 'FIXTURE')");
      } else {
        qb.andWhere("UPPER(c.componentType) IN ('SPARE_CONSUMABLE', 'COMPONENT', 'CHAIN', 'OTHER')");
      }
    }
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

    const [rows, total] = await qb.getManyAndCount();
    const data = await this.hydrateMachinesList(companyId, rows);
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<MachineComponent & { machineIds: string[]; machines: Machine[] }> {
    const component = await this.componentRepo.findOne({
      where: { id, companyId },
      relations: ['machine', 'item', 'uom'],
    });
    if (!component) {
      throw new NotFoundException(`Tool / component '${id}' not found`);
    }
    const [hydrated] = await this.hydrateMachinesList(companyId, [component]);
    return hydrated;
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  private async resolveAndAssertMachineIds(
    companyId: string,
    machineId?: string,
    machineIds?: string[],
  ): Promise<string[]> {
    const raw = [
      ...(Array.isArray(machineIds) ? machineIds : []),
      ...(machineId ? [machineId] : []),
    ].filter(Boolean);
    const uniqueIds = Array.from(new Set(raw));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('At least one machine must be selected');
    }
    for (const id of uniqueIds) {
      await this.assertMachineValid(companyId, id);
    }
    return uniqueIds;
  }

  async create(
    dto: CreateMachineComponentDto,
    companyId: string,
    userId?: string,
  ): Promise<MachineComponent> {
    const resolvedMachineIds = await this.resolveAndAssertMachineIds(
      companyId,
      dto.machineId,
      dto.machineIds,
    );
    const primaryMachineId = resolvedMachineIds[0];
    const itemId = dto.itemId ? await this.assertItemValid(companyId, dto.itemId) : null;
    const uomId = dto.uomId ? await this.assertUom(dto.uomId) : null;
    const codeTrimmed = dto.componentCode.trim();

    const existing = await this.componentRepo
      .createQueryBuilder('c')
      .where('c.companyId = :companyId', { companyId })
      .andWhere('c.isActive = true')
      .andWhere('UPPER(c.componentCode) = UPPER(:code)', { code: codeTrimmed })
      .getOne();

    if (existing) {
      throw new ConflictException(
        `Tool '${codeTrimmed}' already exists in Tool & Component Setup. Edit it to add more machines.`,
      );
    }

    const expectedLife = dto.expectedLifeQuantity != null ? String(dto.expectedLifeQuantity) : '600000';
    const minThresh = dto.minThreshold != null ? String(dto.minThreshold) : '300000';
    const maxThresh = dto.maxThreshold != null ? String(dto.maxThreshold) : '600000';

    const component = this.componentRepo.create({
      companyId,
      machineId: primaryMachineId,
      machineIds: resolvedMachineIds,
      itemId,
      uomId,
      componentType: normalizeComponentType(dto.componentType),
      componentName: dto.componentName.trim(),
      componentCode: codeTrimmed,
      expectedLifeQuantity: expectedLife,
      minThreshold: minThresh,
      maxThreshold: maxThresh,
      unitCost: dto.unitCost != null ? String(dto.unitCost) : null,
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
    const existing = await this.componentRepo.findOne({ where: { id, companyId } });
    if (!existing) throw new NotFoundException(`Tool / component '${id}' not found`);

    const merged: Partial<MachineComponent> = { ...existing };
    delete (merged as any).machine;
    delete (merged as any).machines;
    delete (merged as any).item;
    delete (merged as any).uom;

    if (dto.machineIds !== undefined || dto.machineId !== undefined) {
      const resolvedIds = await this.resolveAndAssertMachineIds(companyId, dto.machineId, dto.machineIds);
      merged.machineId = resolvedIds[0];
      merged.machineIds = resolvedIds;
    }
    if (dto.componentType !== undefined) merged.componentType = normalizeComponentType(dto.componentType);
    if (dto.componentName !== undefined) merged.componentName = dto.componentName.trim();
    if (dto.componentCode !== undefined) {
      const code = dto.componentCode.trim();
      const clash = await this.componentRepo
        .createQueryBuilder('c')
        .where('c.companyId = :companyId', { companyId })
        .andWhere('c.isActive = true')
        .andWhere('UPPER(c.componentCode) = UPPER(:code)', { code })
        .getOne();
      if (clash && clash.id !== id) {
        throw new ConflictException(`Another tool with code '${code}' already exists`);
      }
      merged.componentCode = code;
    }
    if (dto.itemId !== undefined) merged.itemId = dto.itemId ? await this.assertItemValid(companyId, dto.itemId) : null;
    if (dto.uomId !== undefined) merged.uomId = dto.uomId ? await this.assertUom(dto.uomId) : null;
    if (dto.expectedLifeQuantity !== undefined) merged.expectedLifeQuantity = dto.expectedLifeQuantity != null ? String(dto.expectedLifeQuantity) : null;
    if (dto.minThreshold !== undefined) merged.minThreshold = dto.minThreshold != null ? String(dto.minThreshold) : null;
    if (dto.maxThreshold !== undefined) merged.maxThreshold = dto.maxThreshold != null ? String(dto.maxThreshold) : null;
    if (dto.unitCost !== undefined) merged.unitCost = dto.unitCost != null ? String(dto.unitCost) : null;
    if (dto.description !== undefined) merged.description = dto.description?.trim() || null;
    merged.updatedBy = userId ?? null;

    Object.assign(existing, merged);
    await this.componentRepo.save(existing);
    return this.findOne(id, companyId);
  }

  async updateUnitCost(
    id: string,
    unitCost: number,
    companyId: string,
    userId?: string,
  ): Promise<MachineComponent> {
    const existing = await this.componentRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!existing) throw new NotFoundException(`Tool / component '${id}' not found`);

    existing.unitCost = String(unitCost);
    existing.updatedBy = userId ?? null;
    await this.componentRepo.save(existing);

    // Sync to linked Item Master costPrice + inventory_balances + uncosted runs so costing stays consistent
    if (existing.itemId && typeof this.itemRepo?.findOne === 'function') {
      const linkedItem = await this.itemRepo.findOne({ where: { id: existing.itemId, companyId } });
      if (linkedItem && (linkedItem.costPrice === null || linkedItem.costPrice === undefined || Number(linkedItem.costPrice) === 0)) {
        linkedItem.costPrice = unitCost;
        await this.itemRepo.save(linkedItem);
      }
      if (unitCost > 0 && typeof this.changeRepo?.manager?.query === 'function') {
        await this.changeRepo.manager.query(
          `UPDATE inventory_balances
              SET unit_cost = $1,
                  average_cost = COALESCE(NULLIF(average_cost, 0), $1)
            WHERE item_id = $2 AND company_id = $3 AND (unit_cost IS NULL OR unit_cost = 0 OR average_cost IS NULL OR average_cost = 0)`,
          [unitCost, existing.itemId, companyId],
        );
      }
    }
    if (unitCost > 0 && typeof this.changeRepo?.manager?.query === 'function') {
      await this.changeRepo.manager.query(
        `UPDATE component_changes
            SET unit_cost = $1
          WHERE component_id = $2
            AND company_id = $3
            AND (unit_cost IS NULL OR unit_cost = 0 OR closed_at IS NULL)`,
        [unitCost, id, companyId],
      );
    }

    return this.findOne(id, companyId);
  }

  async changeStatus(id: string, status: 'ACTIVE' | 'INACTIVE', companyId: string, userId?: string): Promise<MachineComponent> {
    const existing = await this.componentRepo.findOne({ where: { id, companyId } });
    if (!existing) throw new NotFoundException(`Tool / component '${id}' not found`);
    existing.isActive = status === 'ACTIVE';
    existing.updatedBy = userId ?? null;
    await this.componentRepo.save(existing);
    return this.findOne(id, companyId);
  }

  /** Soft delete per ERP convention — change history keeps its FK alive. */
  async remove(id: string, companyId: string, userId?: string): Promise<void> {
    const existing = await this.componentRepo.findOne({ where: { id, companyId } });
    if (!existing) throw new NotFoundException(`Tool / component '${id}' not found`);
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

  async deriveMachineCounter(companyId: string, machineId: string): Promise<number | null> {
    const rows = await this.changeRepo.manager.query(
      `SELECT COALESCE(SUM(actual_quantity), 0)::numeric(19,4) AS total_quantity
         FROM production_entries
        WHERE company_id = $1 AND machine_id = $2 AND is_active = true`,
      [companyId, machineId],
    );
    return numOrNull(rows[0]?.total_quantity);
  }

  async getHistory(
    companyId: string,
    id: string,
    counterValue: number | null,
    options?: { derive?: boolean; machineId?: string },
  ): Promise<any> {
    const component = await this.findOne(id, companyId);
    const filterMachineId = options?.machineId || undefined;
    const mgr = this.changeRepo.manager;

    // Include historical component IDs sharing the same item_id or component_code (from before multi-machine merge)
    let relatedComponentIds: string[] = [id];
    if (typeof mgr?.query === 'function') {
      try {
        const siblingRows: Array<{ id: string }> = await mgr.query(
          `SELECT id
             FROM machine_components
            WHERE company_id = $1
              AND (
                id = $2
                OR ($3::uuid IS NOT NULL AND item_id = $3::uuid)
                OR ($4::text <> '' AND UPPER(component_code) = UPPER($4::text))
              )`,
          [companyId, id, component.itemId || null, component.componentCode || ''],
        );
        if (siblingRows?.length) {
          relatedComponentIds = Array.from(new Set([id, ...siblingRows.map((r) => r.id)]));
        }
      } catch {
        relatedComponentIds = [id];
      }
    }

    const qb = this.changeRepo
      .createQueryBuilder('cc')
      .leftJoinAndSelect('cc.machine', 'machine')
      .leftJoinAndSelect('cc.jobCard', 'jobCard')
      .leftJoinAndSelect('cc.changedByUser', 'changedByUser')
      .where('cc.companyId = :companyId', { companyId })
      .andWhere('cc.isActive = true')
      .andWhere(
        '(cc.componentId IN (:...relatedComponentIds) OR UPPER(cc.newToolCode) LIKE :toolPrefix)',
        {
          relatedComponentIds,
          toolPrefix: `${String(component.componentCode || '').trim().toUpperCase()}%`,
        },
      );

    if (filterMachineId) {
      qb.andWhere('cc.machineId = :filterMachineId', { filterMachineId });
    }

    const changes = await qb
      .orderBy('cc.changeDate', 'ASC')
      .addOrderBy('cc.changedAt', 'ASC')
      .getMany();

    const assignedMachines =
      Array.isArray(component.machines) && component.machines.length > 0
        ? component.machines
        : component.machine
          ? [component.machine]
          : [];
    const allScopeMachineIds = Array.from(
      new Set([
        ...assignedMachines.map((m) => m.id),
        ...changes.map((c) => c.machineId),
        ...(filterMachineId ? [filterMachineId] : []),
      ]),
    );

    const liveCounters = await fetchLiveMachineCounters(mgr, companyId, allScopeMachineIds);

    const enrichedChanges = changes.map((c) => {
      const currentLifeQty = computeChangeCumulativeLife(c, liveCounters);
      return {
        ...c,
        currentLifeQty,
        uomCode: component.uom?.code ?? null,
        productionSincePrevious: String(currentLifeQty),
      };
    });

    // Derive effective machine counter for the requested filter (specific machine or combined across scope)
    let resolvedCounter: number | null = counterValue;
    if (options?.derive || resolvedCounter === null) {
      if (filterMachineId) {
        resolvedCounter = liveCounters.get(filterMachineId) ?? (await this.deriveMachineCounter(companyId, filterMachineId));
      } else {
        const machineIdsWithActivity = Array.from(new Set(changes.map((c) => c.machineId)));
        const targetIds = machineIdsWithActivity.length > 0 ? machineIdsWithActivity : allScopeMachineIds;
        resolvedCounter = targetIds.reduce((sum, mId) => sum + (liveCounters.get(mId) ?? 0), 0);
      }
    }

    const stats = this.computeStats(component, enrichedChanges as any, resolvedCounter);
    const activeMachineObj = filterMachineId
      ? assignedMachines.find((m) => m.id === filterMachineId) || changes.find((c) => c.machineId === filterMachineId)?.machine || null
      : null;

    return {
      component,
      selectedMachineId: filterMachineId || 'ALL',
      assignedMachines: assignedMachines.map((m) => ({
        id: m.id,
        machineCode: m.machineCode,
        machineNumber: m.machineNumber,
        name: m.name,
        derivedCounter: liveCounters.get(m.id) ?? 0,
      })),
      machine: activeMachineObj
        ? {
            id: activeMachineObj.id,
            machineId: (activeMachineObj as any).machineId ?? null,
            machineCode: activeMachineObj.machineCode ?? null,
            machineNumber: activeMachineObj.machineNumber ?? null,
            name: activeMachineObj.name ?? null,
          }
        : {
            id: assignedMachines.length <= 1 ? (component.machine?.id ?? component.machineId) : 'ALL',
            machineId: assignedMachines.length <= 1 ? (component.machine?.machineId ?? null) : null,
            machineCode:
              assignedMachines.length > 1
                ? `All Assigned Machines (${assignedMachines.length})`
                : (component.machine?.machineCode ?? null),
            machineNumber: assignedMachines.length <= 1 ? (component.machine?.machineNumber ?? null) : null,
            name:
              assignedMachines.length > 1
                ? assignedMachines.map((m) => m.machineCode).filter(Boolean).join(', ')
                : (component.machine?.name ?? null),
          },
      counter: {
        value: resolvedCounter,
        base: 'PRODUCTION_ENTRIES_SUM',
      },
      summary: stats,
      changes: enrichedChanges,
    };
  }

  private computeStats(
    component: MachineComponent,
    changes: Array<ComponentChange & { currentLifeQty?: number }>,
    counterValue: number | null,
  ): ComponentHistoryStats {
    const lives = changes
      .map((c) => c.currentLifeQty ?? numOrNull(c.productionSincePrevious))
      .filter((v): v is number => v !== null);

    const activeRuns = changes.filter((c) => !c.closedAt && c.lifecycleStatus !== 'STANDBY' && c.lifecycleStatus !== 'CLOSED');
    const last = activeRuns.length > 0 ? activeRuns[activeRuns.length - 1] : (changes.length > 0 ? changes[changes.length - 1] : null);
    const counterAtInstall = last ? numOrNull(last.productionCounterAfter) : null;
    const usedByInstalled =
      activeRuns.length > 0
        ? Number(activeRuns.reduce((sum, r) => sum + (r.currentLifeQty ?? numOrNull(r.productionSincePrevious) ?? 0), 0).toFixed(4))
        : last
          ? (last.currentLifeQty ?? numOrNull(last.productionSincePrevious))
          : null;
    const expected = numOrNull(component.expectedLifeQuantity);
    const remainingByInstalled =
      usedByInstalled !== null && expected !== null ? Math.max(0, Number((expected - usedByInstalled).toFixed(4))) : null;

    return {
      expectedLifeQuantity: expected,
      minThreshold: numOrNull(component.minThreshold),
      maxThreshold: numOrNull(component.maxThreshold),
      totalChanges: changes.length,
      firstChangeDate: changes.length > 0 ? changes[0].changeDate : null,
      lastChangeDate: changes.length > 0 ? changes[changes.length - 1].changeDate : null,
      installedToolCode:
        activeRuns.length > 1
          ? `${activeRuns.length} Active Runs (${activeRuns.map((r) => r.machine?.machineCode || r.newToolCode).join(', ')})`
          : (last ? last.newToolCode : null),
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
