import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComponentChange, ToolLifecycleStatus } from '../entities/component-change.entity';
import { MachineComponent } from '../entities/machine-component.entity';
import { Machine } from '../../production/entities/machine.entity';
import { MaintenanceJobCard } from '../../maintenance/entities/maintenance-job-card.entity';
import {
  CreateComponentChangeDto,
  UpdateComponentChangeDto,
  ComponentChangeQueryDto,
} from '../dto';
import { componentSupportsMachine, numOrNull } from './machine-component.service';
import { computeChangeCumulativeLife, fetchLiveMachineCounters } from './tool-life-calc.helper';

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

    const [rows, total] = await qb.getManyAndCount();
    const activeMachineIds = rows
      .filter(
        (c) =>
          (c.closedAt === null || c.closedAt === undefined) &&
          c.lifecycleStatus !== ToolLifecycleStatus.STANDBY &&
          c.lifecycleStatus !== ToolLifecycleStatus.CLOSED,
      )
      .map((c) => c.machineId);
    const liveCounters = await fetchLiveMachineCounters(this.changeRepo.manager, companyId, activeMachineIds);

    const data = rows.map((c) => this.enrichChangeWithLiveLife(c, liveCounters));
    return { data, total, page, limit };
  }

  private enrichChangeWithLiveLife(
    c: ComponentChange,
    liveCounters: Map<string, number>,
  ): ComponentChange & { currentLifeQty: number; uomCode: string | null; isLiveActive: boolean } {
    const isLiveActive =
      (c.closedAt === null || c.closedAt === undefined) &&
      c.lifecycleStatus !== ToolLifecycleStatus.STANDBY &&
      c.lifecycleStatus !== ToolLifecycleStatus.CLOSED;
    const currentLifeQty = computeChangeCumulativeLife(c, liveCounters);
    const uomCode = c.component ? componentUomCode(c.component) : null;
    return {
      ...c,
      currentLifeQty,
      uomCode,
      isLiveActive,
      productionSincePrevious: String(currentLifeQty),
    };
  }

  private async findEntity(id: string, companyId: string): Promise<ComponentChange> {
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

  async findOne(id: string, companyId: string): Promise<any> {
    const change = await this.findEntity(id, companyId);
    const isLiveActive =
      (change.closedAt === null || change.closedAt === undefined) &&
      change.lifecycleStatus !== ToolLifecycleStatus.STANDBY &&
      change.lifecycleStatus !== ToolLifecycleStatus.CLOSED;
    const liveCounters = isLiveActive
      ? await fetchLiveMachineCounters(this.changeRepo.manager, companyId, [change.machineId])
      : new Map<string, number>();
    return this.enrichChangeWithLiveLife(change, liveCounters);
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
      dto.machineId,
    );

    let snapUnitCost = numOrNull(component.unitCost) ?? 0;
    if (snapUnitCost <= 0 && component.itemId && typeof this.changeRepo.manager?.query === 'function') {
      try {
        const rows: Array<{ cost: string | number | null }> = await this.changeRepo.manager.query(
          `SELECT COALESCE(
              (SELECT NULLIF(ib.average_cost, 0) FROM inventory_balances ib WHERE ib.company_id = $1 AND ib.item_id = $2 AND ib.status = 'ACTIVE' AND COALESCE(ib.average_cost, 0) > 0 ORDER BY ib.on_hand DESC LIMIT 1),
              (SELECT NULLIF(ib.unit_cost, 0) FROM inventory_balances ib WHERE ib.company_id = $1 AND ib.item_id = $2 AND ib.status = 'ACTIVE' AND COALESCE(ib.unit_cost, 0) > 0 ORDER BY ib.on_hand DESC LIMIT 1),
              (SELECT NULLIF(i.cost_price, 0) FROM items i WHERE i.id = $2 AND i.company_id = $1 LIMIT 1),
              (SELECT NULLIF(grl.unit_price, 0) FROM goods_receipt_lines grl JOIN goods_receipts gr ON gr.id = grl.receipt_id WHERE gr.company_id = $1 AND grl.item_id = $2 AND gr.is_active = true AND grl.is_active = true AND grl.unit_price > 0 ORDER BY COALESCE(gr.receipt_date, gr.created_at) DESC, grl.created_at DESC LIMIT 1),
              0
            ) AS cost`,
          [companyId, component.itemId],
        );
        snapUnitCost = Number(rows?.[0]?.cost || 0);
      } catch {
        snapUnitCost = 0;
      }
    }

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
      unitCost: snapUnitCost > 0 ? String(snapUnitCost) : null,
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
    const existing = await this.findEntity(id, companyId);

    if (dto.machineId !== undefined && dto.machineId !== existing.machineId) {
      await this.assertComponentForMachine(companyId, dto.machineId, existing.componentId);
    }
    if (dto.componentId !== undefined && dto.componentId !== existing.componentId) {
      const targetMachineId = dto.machineId ?? existing.machineId;
      await this.assertComponentForMachine(companyId, targetMachineId, dto.componentId);
    }
    if (dto.jobCardId !== undefined && dto.jobCardId) await this.assertJobCard(companyId, dto.jobCardId);

    const targetMachineId = dto.machineId ?? (existing.machineId as string);
    const changeDate = dto.changeDate ?? String(existing.changeDate).slice(0, 10);
    const changeTime = dto.changeTime !== undefined ? dto.changeTime : existing.changeTime;
    const dateOrMachineChanged =
      (dto.changeDate !== undefined && String(dto.changeDate).slice(0, 10) !== String(existing.changeDate).slice(0, 10)) ||
      (dto.machineId !== undefined && dto.machineId !== existing.machineId);

    let derivedCounterAtDate: number | null = null;
    let derivedTotalCounter: number | null = null;
    if ((dateOrMachineChanged || existing.closedAt === null) && typeof this.changeRepo.manager?.query === 'function') {
      try {
        const cRows: Array<{ counter_at_date: string | number; total_counter: string | number }> =
          await this.changeRepo.manager.query(
            `SELECT
               COALESCE(SUM(CASE WHEN entry_date <= $3 THEN actual_quantity ELSE 0 END), 0)::numeric(19,4) AS counter_at_date,
               COALESCE(SUM(actual_quantity), 0)::numeric(19,4) AS total_counter
               FROM production_entries
              WHERE company_id = $1 AND machine_id = $2 AND is_active = TRUE AND deleted_at IS NULL`,
            [companyId, targetMachineId, changeDate],
          );
        if (cRows?.[0]) {
          derivedCounterAtDate = Number(cRows[0].counter_at_date || 0);
          derivedTotalCounter = Number(cRows[0].total_counter || 0);
        }
      } catch {
        // Fallback silently in isolated unit tests without production_entries
      }
    }

    const counterBefore = dto.productionCounterBefore !== undefined
      ? dto.productionCounterBefore
      : numOrNull(existing.productionCounterBefore);
    const componentId = dto.componentId ?? (existing.componentId as string);
    let productionSincePrevious = await this.computeLifeSincePrevious(
      companyId,
      componentId,
      changeDate,
      changeTime,
      counterBefore,
      targetMachineId,
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
    if (dto.productionCounterAfter !== undefined) {
      existing.productionCounterAfter = dto.productionCounterAfter != null ? String(dto.productionCounterAfter) : null;
    } else if (dateOrMachineChanged && derivedCounterAtDate !== null) {
      existing.productionCounterAfter = String(derivedCounterAtDate);
    }

    // Sync mounting_sessions[0] date/startCounter and active live production when mount date or machine changes
    if ((dateOrMachineChanged || dto.productionCounterAfter !== undefined) && Array.isArray(existing.mountingSessions) && existing.mountingSessions.length > 0) {
      const updatedAfterNum = numOrNull(existing.productionCounterAfter);
      const first = existing.mountingSessions[0];
      const existingTimePart = typeof first.mountedAt === 'string' && first.mountedAt.includes('T')
        ? first.mountedAt.slice(10)
        : `T${(changeTime || '00:00:00').slice(0, 8)}`;
      const updatedSessions = [...existing.mountingSessions];
      updatedSessions[0] = {
        ...first,
        machineId: existing.machineId,
        mountedAt: `${changeDate}${existingTimePart}`,
        ...(updatedAfterNum !== null ? { startCounter: updatedAfterNum } : {}),
      };
      existing.mountingSessions = updatedSessions;
    }

    if (existing.closedAt === null && existing.lifecycleStatus !== ToolLifecycleStatus.STANDBY && existing.lifecycleStatus !== ToolLifecycleStatus.CLOSED && derivedTotalCounter !== null) {
      const installCounter = numOrNull(existing.productionCounterAfter) ?? 0;
      const priorAccumulated = numOrNull(existing.accumulatedLifeBeforeCurrentSession) ?? 0;
      const currentSessionUsed = Math.max(0, Number((derivedTotalCounter - installCounter).toFixed(4)));
      productionSincePrevious = String(Number((priorAccumulated + currentSessionUsed).toFixed(4)));
    } else if (dateOrMachineChanged && existing.closedAt !== null && counterBefore !== null) {
      const afterNum = numOrNull(existing.productionCounterAfter);
      if (afterNum !== null && counterBefore >= afterNum) {
        productionSincePrevious = String(Number((counterBefore - afterNum).toFixed(4)));
      }
    }

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
    const existing = await this.findEntity(id, companyId);
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
    machineId?: string,
  ): Promise<string | null> {
    if (counterBefore === null || counterBefore === undefined) return null;

    const qb = this.changeRepo
      .createQueryBuilder('cc')
      .where('cc.companyId = :companyId', { companyId })
      .andWhere('cc.componentId = :componentId', { componentId })
      .andWhere('cc.isActive = true');
    if (machineId) {
      qb.andWhere('cc.machineId = :machineId', { machineId });
    }
    const prior = await qb
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

    // Deliberately NOT filtered by `deleted_at` — machine life totals track
    // physical output, so a recycled entry must not shrink them.
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

  /** Shared cost lookup for inventory weighted average & latest GRN unit_price by linked Store Item. */
  private async loadCostLookups(
    companyId: string,
    changes: ComponentChange[],
  ): Promise<{ invCostMap: Map<string, number>; latestGrnPriceMap: Map<string, number> }> {
    const itemIds = Array.from(
      new Set(
        changes
          .map((c) => c.component?.itemId || c.component?.item?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const invCostMap = new Map<string, number>();
    const latestGrnPriceMap = new Map<string, number>();
    if (itemIds.length > 0 && typeof this.changeRepo.manager?.query === 'function') {
      try {
        const invRows: Array<{ item_id: string; eff_cost: string | number }> =
          await this.changeRepo.manager.query(
            `SELECT DISTINCT ON (ib.item_id) ib.item_id,
                    COALESCE(NULLIF(ib.average_cost, 0), NULLIF(ib.unit_cost, 0), 0) AS eff_cost
               FROM inventory_balances ib
              WHERE ib.company_id = $1
                AND ib.status = 'ACTIVE'
                AND ib.item_id = ANY($2)
                AND (COALESCE(ib.average_cost, 0) > 0 OR COALESCE(ib.unit_cost, 0) > 0)
              ORDER BY ib.item_id, ib.on_hand DESC`,
            [companyId, itemIds],
          );
        for (const r of invRows || []) {
          const p = numOrNull(r.eff_cost);
          if (p !== null && p > 0) invCostMap.set(r.item_id, p);
        }

        const grnRows: Array<{ item_id: string; unit_price: string | number }> =
          await this.changeRepo.manager.query(
            `SELECT DISTINCT ON (grl.item_id) grl.item_id, grl.unit_price
               FROM goods_receipt_lines grl
               INNER JOIN goods_receipts gr ON gr.id = grl.receipt_id
              WHERE gr.company_id = $1
                AND gr.is_active = true
                AND gr.deleted_at IS NULL
                AND grl.is_active = true
                AND grl.deleted_at IS NULL
                AND grl.item_id = ANY($2)
                AND grl.unit_price > 0
              ORDER BY grl.item_id, COALESCE(gr.receipt_date, gr.created_at) DESC, grl.created_at DESC`,
            [companyId, itemIds],
          );
        for (const r of grnRows || []) {
          const p = numOrNull(r.unit_price);
          if (p !== null && p > 0) latestGrnPriceMap.set(r.item_id, p);
        }
      } catch {
        // Fallback silently if procurement/inventory tables are unavailable in isolated unit tests
      }
    }
    return { invCostMap, latestGrnPriceMap };
  }

  private resolveChangeUnitCost(
    c: ComponentChange,
    invCostMap: Map<string, number>,
    latestGrnPriceMap: Map<string, number>,
  ): {
    resolvedUnitCost: number;
    costSource: 'SNAPSHOT' | 'COMPONENT' | 'INVENTORY_AVG' | 'ITEM_MASTER' | 'LATEST_GRN' | 'NONE';
    linkedItemId: string | null;
  } {
    const changeSnapCost = numOrNull(c.unitCost);
    const compUnitCost = numOrNull(c.component?.unitCost);
    const linkedItemId = c.component?.itemId || c.component?.item?.id || null;
    const invAvgCost = linkedItemId ? (invCostMap.get(linkedItemId) ?? null) : null;
    const itemCostPrice = numOrNull(c.component?.item?.costPrice);
    const grnPrice = linkedItemId ? (latestGrnPriceMap.get(linkedItemId) ?? null) : null;

    if (changeSnapCost !== null && changeSnapCost > 0) {
      return { resolvedUnitCost: changeSnapCost, costSource: 'SNAPSHOT', linkedItemId };
    }
    if (compUnitCost !== null && compUnitCost > 0) {
      return { resolvedUnitCost: compUnitCost, costSource: 'COMPONENT', linkedItemId };
    }
    if (invAvgCost !== null && invAvgCost > 0) {
      return { resolvedUnitCost: invAvgCost, costSource: 'INVENTORY_AVG', linkedItemId };
    }
    if (itemCostPrice !== null && itemCostPrice > 0) {
      return { resolvedUnitCost: itemCostPrice, costSource: 'ITEM_MASTER', linkedItemId };
    }
    if (grnPrice !== null && grnPrice > 0) {
      return { resolvedUnitCost: grnPrice, costSource: 'LATEST_GRN', linkedItemId };
    }
    return { resolvedUnitCost: 0, costSource: 'NONE', linkedItemId };
  }

  /**
   * Monthly consumption report.
   * Returns:
   *  - `rows`: flat per machine + component breakdown (including Unit Rate, Total Cost, Cost / Gross)
   *  - `machines`: consolidated one-row-per-machine summary with nested `components` breakdown
   *  - `totals`: aggregate KPI summary (machines, components, changes, qtyUsed, productionCovered, totalCost, avgCostPerGross)
   */
  async monthlyReport(
    companyId: string,
    month: string,
    machineId?: string,
    divisionId?: string,
  ): Promise<any> {
    const start = `${month}-01`;
    const endDate = new Date(`${month}-01T00:00:00`);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);
    const end = `${month}-${String(endDate.getDate()).padStart(2, '0')}`;

    const qb = this.changeRepo
      .createQueryBuilder('cc')
      .leftJoinAndSelect('cc.machine', 'machine')
      .leftJoinAndSelect('machine.division', 'machineDivision')
      .leftJoinAndSelect('cc.component', 'component')
      .leftJoinAndSelect('component.item', 'componentItem')
      .leftJoinAndSelect('component.uom', 'componentUom')
      .where('cc.companyId = :companyId', { companyId })
      .andWhere('cc.isActive = true')
      .andWhere('cc.changeDate >= :start', { start })
      .andWhere('cc.changeDate <= :end', { end });
    if (machineId) qb.andWhere('cc.machineId = :machineId', { machineId });
    if (divisionId) qb.andWhere('machine.divisionId = :divisionId', { divisionId });
    qb.orderBy('cc.changeDate', 'ASC');
    qb.addOrderBy('machine.machineCode', 'ASC');
    qb.addOrderBy('component.componentCode', 'ASC');

    const changes = await qb.getMany();
    const activeMachineIds = changes
      .filter(
        (c) =>
          (c.closedAt === null || c.closedAt === undefined) &&
          c.lifecycleStatus !== ToolLifecycleStatus.STANDBY &&
          c.lifecycleStatus !== ToolLifecycleStatus.CLOSED,
      )
      .map((c) => c.machineId);
    const liveCounters = await fetchLiveMachineCounters(this.changeRepo.manager, companyId, activeMachineIds);
    const { invCostMap, latestGrnPriceMap } = await this.loadCostLookups(companyId, changes);

    const groups = new Map<string, any>();

    for (const c of changes) {
      const key = `${c.machineId}::${c.componentId}`;
      const life = computeChangeCumulativeLife(c, liveCounters);
      const { resolvedUnitCost, costSource, linkedItemId } = this.resolveChangeUnitCost(
        c,
        invCostMap,
        latestGrnPriceMap,
      );

      const qtyDelta = c.newToolCode ? 1 : 0;
      const g = groups.get(key) ?? {
        machine: c.machine
          ? {
              id: c.machine.id,
              machineCode: c.machine.machineCode,
              machineName: c.machine.name,
              divisionId: c.machine.divisionId ?? null,
              divisionName: c.machine.division?.name ?? null,
            }
          : null,
        component: c.component
          ? {
              id: c.component.id,
              itemId: linkedItemId,
              componentCode: c.component.componentCode,
              componentName: c.component.componentName,
              componentType: c.component.componentType,
              uomCode: componentUomCode(c.component),
            }
          : null,
        changes: 0,
        toolsInstalled: 0,
        unitCost: resolvedUnitCost,
        accumulatedCost: 0,
        costSource,
        productionCovered: 0,
        lifeReadings: [] as number[],
        lastChangeDate: null as string | null,
      };
      if (life !== null) g.lifeReadings.push(life);
      g.toolsInstalled += qtyDelta;
      g.accumulatedCost = Number((g.accumulatedCost + qtyDelta * resolvedUnitCost).toFixed(2));
      g.changes += 1;
      if (!g.lastChangeDate || c.changeDate > g.lastChangeDate) g.lastChangeDate = c.changeDate;
      groups.set(key, g);
    }

    const rows = Array.from(groups.values()).map((g) => {
      const reads: number[] = g.lifeReadings ?? [];
      const productionCovered = reads.length
        ? Number(reads.reduce((a, b) => a + b, 0).toFixed(4))
        : 0;
      const qtyUsed = g.toolsInstalled;
      const totalCost = Number((g.accumulatedCost ?? 0).toFixed(2));
      const unitCost = qtyUsed > 0 ? Number((totalCost / qtyUsed).toFixed(2)) : Number((g.unitCost ?? 0).toFixed(2));
      const costPerGross =
        productionCovered > 0
          ? Number(((totalCost / productionCovered) * 144).toFixed(2))
          : null;

      return {
        machine: g.machine,
        component: g.component,
        changes: g.changes,
        toolsInstalled: g.toolsInstalled,
        qtyUsed,
        unitCost,
        costSource: g.costSource,
        totalCost,
        productionCovered,
        costPerGross,
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

    // Machine-wise consolidated grouping (1 summary row per Machine + nested component breakdown)
    const machineMap = new Map<string, any>();
    for (const r of rows) {
      const mId = r.machine?.id ?? 'unknown';
      const mg = machineMap.get(mId) ?? {
        machine: r.machine,
        toolCount: 0,
        changes: 0,
        qtyUsed: 0,
        totalCost: 0,
        productionCovered: 0,
        lastChangeDate: null as string | null,
        components: [] as any[],
      };
      mg.toolCount += 1;
      mg.changes += r.changes;
      mg.qtyUsed += r.qtyUsed;
      mg.totalCost = Number((mg.totalCost + (r.totalCost || 0)).toFixed(2));
      // Use max component output on the same machine so parallel dies/punches don't double-count machine PCS
      if ((r.productionCovered || 0) > mg.productionCovered) {
        mg.productionCovered = Number((r.productionCovered || 0).toFixed(4));
      }
      if (r.lastChangeDate && (!mg.lastChangeDate || r.lastChangeDate > mg.lastChangeDate)) {
        mg.lastChangeDate = r.lastChangeDate;
      }
      mg.components.push(r);
      machineMap.set(mId, mg);
    }

    const machines = Array.from(machineMap.values())
      .map((mg) => ({
        ...mg,
        costPerGross:
          mg.productionCovered > 0
            ? Number(((mg.totalCost / mg.productionCovered) * 144).toFixed(2))
            : null,
      }))
      .sort((a, b) =>
        (a.machine?.machineCode ?? '').localeCompare(b.machine?.machineCode ?? ''),
      );

    const totalCost = Number(
      machines.reduce((a, b) => a + (b.totalCost || 0), 0).toFixed(2),
    );
    const totalProductionCovered = Number(
      machines.reduce((a, b) => a + (b.productionCovered || 0), 0).toFixed(4),
    );
    const avgCostPerGross =
      totalProductionCovered > 0
        ? Number(((totalCost / totalProductionCovered) * 144).toFixed(2))
        : null;

    return {
      month,
      start,
      end,
      rows,
      machines,
      totals: {
        machines: machines.length,
        components: rows.length,
        changes: rows.reduce((a, b) => a + b.changes, 0),
        qtyUsed: rows.reduce((a, b) => a + b.qtyUsed, 0),
        productionCovered: totalProductionCovered,
        totalCost,
        avgCostPerGross,
      },
    };
  }

  /**
   * Live Machine Costing report across ALL currently ACTIVE tools mounted on each machine
   * with no month restriction (includes carryover tools installed in prior months).
   * Combined Cost / Gross (144 PCS) per machine equals the sum of each active tool's Cost / Gross.
   */
  async liveMachineCostingReport(
    companyId: string,
    machineId?: string,
    divisionId?: string,
  ): Promise<any> {
    const qb = this.changeRepo
      .createQueryBuilder('cc')
      .leftJoinAndSelect('cc.machine', 'machine')
      .leftJoinAndSelect('machine.division', 'machineDivision')
      .leftJoinAndSelect('cc.component', 'component')
      .leftJoinAndSelect('component.item', 'componentItem')
      .leftJoinAndSelect('component.uom', 'componentUom')
      .leftJoinAndSelect('cc.storeIssue', 'storeIssue')
      .where('cc.companyId = :companyId', { companyId })
      .andWhere('cc.isActive = true')
      .andWhere('cc.closedAt IS NULL')
      .andWhere('cc.lifecycleStatus NOT IN (:...inactiveStatuses)', {
        inactiveStatuses: [ToolLifecycleStatus.STANDBY, ToolLifecycleStatus.CLOSED],
      });
    if (machineId) qb.andWhere('cc.machineId = :machineId', { machineId });
    if (divisionId) qb.andWhere('machine.divisionId = :divisionId', { divisionId });
    qb.orderBy('machine.machineCode', 'ASC');
    qb.addOrderBy('cc.changeDate', 'ASC');
    qb.addOrderBy('component.componentCode', 'ASC');

    const activeChanges = await qb.getMany();
    const activeMachineIds = activeChanges.map((c) => c.machineId);
    const liveCounters = await fetchLiveMachineCounters(this.changeRepo.manager, companyId, activeMachineIds);
    const { invCostMap, latestGrnPriceMap } = await this.loadCostLookups(companyId, activeChanges);

    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const calcRunningDays = (installDate?: string | null): number => {
      if (!installDate) return 0;
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(installDate));
      if (!m) return 0;
      const installUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      return Math.max(0, Math.floor((todayUtc - installUtc) / 86_400_000));
    };

    const rows = activeChanges.map((c) => {
      const productionCovered = computeChangeCumulativeLife(c, liveCounters);
      const { resolvedUnitCost, costSource, linkedItemId } = this.resolveChangeUnitCost(
        c,
        invCostMap,
        latestGrnPriceMap,
      );
      const qtyUsed = c.newToolCode ? 1 : 0;
      const totalCost = Number((qtyUsed * resolvedUnitCost).toFixed(2));
      const costPerGross =
        productionCovered > 0
          ? Number(((totalCost / productionCovered) * 144).toFixed(2))
          : null;

      return {
        changeId: c.id,
        installedToolCode: c.newToolCode,
        installDate: c.changeDate,
        runningDays: calcRunningDays(c.changeDate),
        storeIssueNumber: c.storeIssue?.issueNumber ?? null,
        machine: c.machine
          ? {
              id: c.machine.id,
              machineCode: c.machine.machineCode,
              machineName: c.machine.name,
              divisionId: c.machine.divisionId ?? null,
              divisionName: c.machine.division?.name ?? null,
            }
          : null,
        component: c.component
          ? {
              id: c.component.id,
              itemId: linkedItemId,
              componentCode: c.component.componentCode,
              componentName: c.component.componentName,
              componentType: c.component.componentType,
              uomCode: componentUomCode(c.component),
            }
          : null,
        qtyUsed,
        unitCost: Number(resolvedUnitCost.toFixed(2)),
        costSource,
        totalCost,
        productionCovered,
        costPerGross,
      };
    });

    rows.sort((a, b) => {
      const m = (a.machine?.machineCode ?? '').localeCompare(b.machine?.machineCode ?? '');
      if (m !== 0) return m;
      return (a.installDate ?? '').localeCompare(b.installDate ?? '') ||
        (a.component?.componentCode ?? '').localeCompare(b.component?.componentCode ?? '');
    });

    const machineMap = new Map<string, any>();
    for (const r of rows) {
      const mId = r.machine?.id ?? 'unknown';
      const mg = machineMap.get(mId) ?? {
        machine: r.machine,
        activeToolsCount: 0,
        qtyUsed: 0,
        totalCost: 0,
        productionCovered: 0,
        combinedCostPerGross: 0,
        hasCostPerGross: false,
        earliestInstallDate: null as string | null,
        latestInstallDate: null as string | null,
        components: [] as any[],
      };
      mg.activeToolsCount += 1;
      mg.qtyUsed += r.qtyUsed;
      mg.totalCost = Number((mg.totalCost + (r.totalCost || 0)).toFixed(2));
      if ((r.productionCovered || 0) > mg.productionCovered) {
        mg.productionCovered = Number((r.productionCovered || 0).toFixed(4));
      }
      if (r.costPerGross !== null && r.costPerGross !== undefined) {
        mg.combinedCostPerGross = Number((mg.combinedCostPerGross + r.costPerGross).toFixed(2));
        mg.hasCostPerGross = true;
      }
      if (r.installDate && (!mg.earliestInstallDate || r.installDate < mg.earliestInstallDate)) {
        mg.earliestInstallDate = r.installDate;
      }
      if (r.installDate && (!mg.latestInstallDate || r.installDate > mg.latestInstallDate)) {
        mg.latestInstallDate = r.installDate;
      }
      mg.components.push(r);
      machineMap.set(mId, mg);
    }

    const machines = Array.from(machineMap.values())
      .map(({ hasCostPerGross, combinedCostPerGross, ...mg }) => ({
        ...mg,
        combinedCostPerGross: hasCostPerGross ? combinedCostPerGross : null,
      }))
      .sort((a, b) =>
        (a.machine?.machineCode ?? '').localeCompare(b.machine?.machineCode ?? ''),
      );

    const totalCost = Number(
      machines.reduce((a, b) => a + (b.totalCost || 0), 0).toFixed(2),
    );
    const totalProductionCovered = Number(
      machines.reduce((a, b) => a + (b.productionCovered || 0), 0).toFixed(4),
    );
    const machinesWithCpg = machines.filter((m) => m.combinedCostPerGross !== null);
    const avgCombinedCostPerGross =
      machinesWithCpg.length > 0
        ? Number(
            (
              machinesWithCpg.reduce((a, b) => a + (b.combinedCostPerGross || 0), 0) /
              machinesWithCpg.length
            ).toFixed(2),
          )
        : null;

    return {
      rows,
      machines,
      totals: {
        machines: machines.length,
        activeTools: rows.length,
        qtyUsed: rows.reduce((a, b) => a + b.qtyUsed, 0),
        productionCovered: totalProductionCovered,
        totalCost,
        avgCombinedCostPerGross,
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
    if (!componentSupportsMachine(component, machineId)) {
      throw new BadRequestException(
        `Component '${component.componentCode}' is tracked on machine '${component.machine?.machineCode ?? component.machineId}', not '${machine.machineCode}' — assign this machine in Tool & Component Setup first.`,
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