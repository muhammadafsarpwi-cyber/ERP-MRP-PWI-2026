import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  ComponentChange,
  MountingSessionRecord,
  TOOL_DISPOSITION_TYPES,
  ToolLifecycleStatus,
} from '../entities/component-change.entity';
import { ComponentType, MachineComponent } from '../entities/machine-component.entity';
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
  ToolChangeoverDto,
  RemountToolDto,
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
export class ToolLifecycleService implements OnModuleInit {
  private readonly logger = new Logger(ToolLifecycleService.name);

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

  async onModuleInit() {
    try {
      await this.changeRepo.manager.query(`
        ALTER TABLE component_changes
          ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
          ADD COLUMN IF NOT EXISTS accumulated_life_before_current_session NUMERIC(19,4) NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS mounting_sessions JSONB NOT NULL DEFAULT '[]'::jsonb,
          ADD COLUMN IF NOT EXISTS last_operator_name VARCHAR(150),
          ADD COLUMN IF NOT EXISTS last_shift_incharge_name VARCHAR(150)
      `);
      await this.changeRepo.manager.query(`
        UPDATE component_changes
           SET lifecycle_status = 'CLOSED'
         WHERE lifecycle_status = 'ACTIVE' AND closed_at IS NOT NULL
      `);
      this.logger.log('Verified component_changes lifecycle changeover & standby schema.');
    } catch (err: any) {
      this.logger.warn(`Tool lifecycle schema verification skipped: ${err?.message || err}`);
    }
  }

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
        WHERE company_id = $1 AND machine_id = $2 AND is_active = TRUE AND deleted_at IS NULL AND entry_date <= $3`,
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
        WHERE company_id = $1 AND machine_id = $2 AND is_active = TRUE AND deleted_at IS NULL`,
      [companyId, machineId],
    );
    return numOrNull(rows[0]?.counter_value) ?? 0;
  }

  // ─── Closed-Loop Automation: Store Material Issue → Active Tools ───────────

  private inferComponentType(nameOrCode: string): ComponentType {
    const upper = String(nameOrCode || '').toUpperCase();
    if (upper.includes('DIE')) return ComponentType.DIE;
    if (upper.includes('MOULD') || upper.includes('MOLD')) return ComponentType.MOULD;
    if (upper.includes('CHAIN')) return ComponentType.CHAIN;
    if (upper.includes('FIXTURE')) return ComponentType.FIXTURE;
    if (
      upper.includes('PUNCH') ||
      upper.includes('TOOL') ||
      upper.includes('BLADE') ||
      upper.includes('ROLLER') ||
      upper.includes('CUTTER') ||
      upper.includes('DRILL')
    ) {
      return ComponentType.TOOL;
    }
    return ComponentType.COMPONENT;
  }

  /**
   * Automated "Issue -> Close Previous Run -> Start New Counter" workflow.
   * Called automatically when a Store Material Issue is POSTED against a machine.
   */
  async handlePostedMaterialIssue(params: {
    companyId: string;
    issueId: string;
    issueNumber: string;
    issueDate: string;
    referenceDocument?: string | null;
    lines: Array<{
      itemId: string;
      quantity: number;
      oldItemReturnedQty?: number;
      uomId?: string | null;
      remarks?: string | null;
    }>;
    userId?: string;
  }): Promise<{ closedCount: number; startedCount: number; machineCode: string | null }> {
    const { companyId, issueId, issueNumber, issueDate, referenceDocument, lines, userId } = params;
    const refDoc = String(referenceDocument || '').trim();
    if (!refDoc || !/^Machine:\s*/i.test(refDoc)) {
      return { closedCount: 0, startedCount: 0, machineCode: null };
    }

    // Parse machine code from "Machine: SPK-01 — Spoke Machine SPK-01" or "Machine: SPK-01"
    const rawMachinePart = refDoc.replace(/^Machine:\s*/i, '').trim();
    const machineCodeCandidate = rawMachinePart.split(/\s+[—–-]\s+/)[0]?.trim() || rawMachinePart;
    if (!machineCodeCandidate) {
      return { closedCount: 0, startedCount: 0, machineCode: null };
    }

    const machine = await this.machineRepo
      .createQueryBuilder('m')
      .where('m.companyId = :companyId', { companyId })
      .andWhere('m.isActive = true')
      .andWhere('(LOWER(m.machineCode) = LOWER(:code) OR LOWER(m.machineNumber) = LOWER(:code))', {
        code: machineCodeCandidate,
      })
      .getOne();

    if (!machine) {
      this.logger.warn(
        `Material Issue ${issueNumber}: machine '${machineCodeCandidate}' not found for closed-loop tool tracking.`,
      );
      return { closedCount: 0, startedCount: 0, machineCode: null };
    }

    const normalizedDate = String(issueDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const nowTime = new Date().toTimeString().slice(0, 5);
    const currentCounter = await this.deriveCounterAt(companyId, machine.id, normalizedDate);

    let closedCount = 0;
    let startedCount = 0;

    for (const line of lines || []) {
      const qty = Number(line.quantity || 0);
      if (qty <= 0 || !line.itemId) continue;

      const item = await this.itemRepo.findOne({ where: { id: line.itemId, companyId } });
      if (!item) continue;

      // 1. Find or auto-register MachineComponent for this machine + item
      let component = await this.componentRepo.findOne({
        where: { companyId, machineId: machine.id, itemId: item.id, isActive: true },
      });
      if (!component) {
        component = await this.componentRepo.findOne({
          where: { companyId, machineId: machine.id, componentCode: item.itemCode, isActive: true },
        });
      }
      if (!component) {
        const inferredType = this.inferComponentType(`${item.name || ''} ${item.itemCode}`);
        component = this.componentRepo.create({
          companyId,
          machineId: machine.id,
          itemId: item.id,
          componentType: inferredType,
          componentName: item.name || item.itemCode,
          componentCode: item.itemCode,
          uomId: line.uomId || item.baseUomId || null,
          expectedLifeQuantity: null,
          description: `Auto-registered from Material Issue ${issueNumber}`,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        });
        component.isActive = true;
        component = await this.componentRepo.save(component);
      }

      // 2. Auto-Close previous ACTIVE tool run on this machine/component
      const previousActive = await this.changeRepo.findOne({
        where: { companyId, componentId: component.id, isActive: true, closedAt: IsNull() },
      });

      const hasOldReturn = Number(line.oldItemReturnedQty || 0) > 0;
      if (previousActive) {
        const installCounter = numOrNull(previousActive.productionCounterAfter) ?? 0;
        const closingCounter = Math.max(installCounter, currentCounter);
        const sessionProd = Number(Math.max(0, closingCounter - installCounter).toFixed(4));
        const priorAccumulated = numOrNull(previousActive.accumulatedLifeBeforeCurrentSession) ?? 0;
        const totalAccumulated = Number((priorAccumulated + sessionProd).toFixed(4));
        const sessions = Array.isArray(previousActive.mountingSessions) ? [...previousActive.mountingSessions] : [];
        const closeReason = hasOldReturn
          ? `Replaced by new issue ${issueNumber} (Old Returned Scrap)`
          : `Replaced by new issue ${issueNumber}`;

        if (sessions.length > 0 && !sessions[sessions.length - 1].unmountedAt) {
          sessions[sessions.length - 1] = {
            ...sessions[sessions.length - 1],
            unmountedAt: new Date().toISOString(),
            endCounter: closingCounter,
            sessionProduction: sessionProd,
            action: 'CLOSED',
            reason: closeReason,
          };
        } else {
          sessions.push({
            sessionNo: sessions.length + 1,
            machineId: previousActive.machineId,
            machineCode: machine.machineCode,
            mountedAt: previousActive.changeDate,
            unmountedAt: new Date().toISOString(),
            startCounter: installCounter,
            endCounter: closingCounter,
            sessionProduction: sessionProd,
            action: 'CLOSED',
            reason: closeReason,
          });
        }

        previousActive.productionCounterBefore = String(closingCounter);
        previousActive.accumulatedLifeBeforeCurrentSession = String(totalAccumulated);
        previousActive.productionSincePrevious = String(totalAccumulated);
        previousActive.mountingSessions = sessions;
        previousActive.lifecycleStatus = ToolLifecycleStatus.CLOSED;
        previousActive.closedAt = new Date();
        previousActive.conditionStatus = hasOldReturn ? 'USED' : (previousActive.conditionStatus || 'USED');
        previousActive.dispositionType = hasOldReturn
          ? 'SCRAPPED'
          : (previousActive.dispositionType || 'RETURN_TO_STORE');
        previousActive.reason = closeReason;
        previousActive.updatedBy = userId ?? null;
        await this.changeRepo.save(previousActive);
        closedCount++;
      }

      // 3. Auto-Start new ACTIVE tool run with sequential Run # and Starting Production = 0
      const priorRuns = await this.changeRepo.count({
        where: { companyId, componentId: component.id, isActive: true },
      });
      const runNumber = priorRuns + 1;
      const newToolCode = `${item.itemCode} · Run #${runNumber}`;
      const initialSession: MountingSessionRecord = {
        sessionNo: 1,
        machineId: machine.id,
        machineCode: machine.machineCode,
        mountedAt: `${normalizedDate}T${nowTime}:00`,
        unmountedAt: null,
        startCounter: currentCounter,
        endCounter: null,
        sessionProduction: 0,
        action: 'MOUNTED',
        reason: `Issued via ${issueNumber}`,
      };

      const nextRun = this.changeRepo.create({
        companyId,
        machineId: machine.id,
        componentId: component.id,
        jobCardId: null,
        storeIssueId: issueId,
        oldToolCode: previousActive?.newToolCode ?? null,
        newToolCode,
        newToolDescription: item.name || item.itemCode,
        changeDate: normalizedDate,
        changeTime: nowTime,
        productionCounterBefore: null,
        productionCounterAfter: String(currentCounter),
        productionSincePrevious: '0',
        accumulatedLifeBeforeCurrentSession: '0',
        lifecycleStatus: ToolLifecycleStatus.ACTIVE,
        mountingSessions: [initialSession],
        reason: `Issued via ${issueNumber}`,
        conditionStatus: 'NEW',
        remarks: line.remarks?.trim() || `Auto-started from Material Issue ${issueNumber}`,
        dispositionType: null,
        dispositionNote: null,
        closedAt: null,
        changedAt: new Date(),
        changedBy: userId ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      });
      nextRun.isActive = true;
      await this.changeRepo.save(nextRun);
      startedCount++;
    }

    return { closedCount, startedCount, machineCode: machine.machineCode };
  }

  /**
   * Live Daily Production Accumulation:
   * Called automatically when a Daily Production Entry is created/updated/deleted.
   * Recomputes and persists Cumulative Life (Previous Sessions + Current Session)
   * on every ACTIVE tool currently mounted on `machineId`.
   */
  async syncActiveToolsForMachine(companyId: string, machineId: string): Promise<number> {
    if (!companyId || !machineId) return 0;
    const activeRuns = await this.changeRepo.find({
      where: { companyId, machineId, isActive: true, closedAt: IsNull() },
    });
    if (activeRuns.length === 0) return 0;

    const rows = await this.changeRepo.manager.query(
      `SELECT COALESCE(SUM(actual_quantity), 0)::numeric(19,4) AS counter_value
         FROM production_entries
        WHERE company_id = $1 AND machine_id = $2 AND is_active = TRUE AND deleted_at IS NULL`,
      [companyId, machineId],
    );
    const derived = numOrNull(rows[0]?.counter_value) ?? 0;

    for (const run of activeRuns) {
      const installCounter = numOrNull(run.productionCounterAfter) ?? 0;
      const priorAccumulated = numOrNull(run.accumulatedLifeBeforeCurrentSession) ?? 0;
      const currentSessionUsed = Math.max(0, derived - installCounter);
      const liveTotal = Number((priorAccumulated + currentSessionUsed).toFixed(4));
      run.productionSincePrevious = String(liveTotal);
      await this.changeRepo.save(run);
    }
    return activeRuns.length;
  }

  // ─── Standby Tools (Unmounted / Reusable Tool Crib Pool) ──────────────────

  async standbyTools(
    companyId: string,
    query: { machineId?: string; componentId?: string; search?: string; page?: number; limit?: number } = {},
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const { machineId, componentId, search, page = 1, limit = 100 } = query || {};
    const qb = this.changeRepo
      .createQueryBuilder('cc')
      .leftJoinAndSelect('cc.machine', 'machine')
      .leftJoinAndSelect('cc.component', 'component')
      .leftJoinAndSelect('component.item', 'componentItem')
      .leftJoinAndSelect('component.uom', 'componentUom')
      .leftJoinAndSelect('cc.storeIssue', 'storeIssue')
      .where('cc.companyId = :companyId', { companyId })
      .andWhere('cc.isActive = true')
      .andWhere('cc.lifecycleStatus = :status', { status: ToolLifecycleStatus.STANDBY });

    if (machineId) qb.andWhere('cc.machineId = :machineId', { machineId });
    if (componentId) qb.andWhere('cc.componentId = :componentId', { componentId });
    if (search) {
      qb.andWhere(
        '(component.componentCode ILIKE :search OR component.componentName ILIKE :search OR cc.newToolCode ILIKE :search OR machine.machineCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    qb.orderBy('cc.closedAt', 'DESC').addOrderBy('cc.updatedAt', 'DESC');

    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const changes = await qb.getMany();

    const data = changes.map((c) => {
      const preservedLife =
        numOrNull(c.accumulatedLifeBeforeCurrentSession) ?? numOrNull(c.productionSincePrevious) ?? 0;
      const expected = numOrNull((c.component as any)?.expectedLifeQuantity);
      const sessions = Array.isArray(c.mountingSessions) ? c.mountingSessions : [];
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
              itemId: c.component.itemId,
              expectedLifeQuantity: expected,
              uomCode: (c.component as any).uom?.code ?? null,
            }
          : null,
        toolCode: c.newToolCode,
        newToolDescription: c.newToolDescription,
        preservedLife,
        remainingLife: expected !== null ? Math.max(0, expected - preservedLife) : null,
        sessionCount: sessions.length || 1,
        mountingSessions: sessions,
        unmountedAt: c.closedAt,
        lastOperatorName: c.lastOperatorName || (c.storeIssue as any)?.operatorName || null,
        lastShiftInchargeName: c.lastShiftInchargeName || (c.storeIssue as any)?.shiftInchargeName || null,
        storeIssueId: c.storeIssueId,
        storeIssueNumber: (c.storeIssue as any)?.issueNumber ?? null,
        reason: c.reason,
        remarks: c.remarks,
        status: ToolLifecycleStatus.STANDBY,
      };
    });

    return { data, total, page, limit };
  }

  // ─── Unmount / Tool Changeover (STANDBY or Permanent CLOSE) ───────────────

  async changeoverTool(
    changeId: string,
    dto: ToolChangeoverDto,
    companyId: string,
    userId?: string,
  ): Promise<any> {
    const change = await this.changeRepo.findOne({
      where: { id: changeId, companyId, isActive: true },
      relations: ['machine', 'component', 'component.uom', 'storeIssue'],
    });
    if (!change) throw new NotFoundException(`Tool run '${changeId}' not found in this company`);
    if (change.closedAt !== null || change.lifecycleStatus !== ToolLifecycleStatus.ACTIVE) {
      throw new BadRequestException(
        `Tool '${change.newToolCode}' is currently '${change.lifecycleStatus}' and cannot be unmounted.`,
      );
    }

    const derivedAtDate =
      dto.productionCounterBefore !== undefined && dto.productionCounterBefore !== null
        ? dto.productionCounterBefore
        : await this.deriveCounterAt(companyId, change.machineId, dto.changeDate);

    const installCounter = numOrNull(change.productionCounterAfter) ?? 0;
    const closingCounter = Math.max(installCounter, derivedAtDate);
    const sessionProduction = Number(Math.max(0, closingCounter - installCounter).toFixed(4));
    const priorAccumulated = numOrNull(change.accumulatedLifeBeforeCurrentSession) ?? 0;
    const totalCumulativeLife = Number((priorAccumulated + sessionProduction).toFixed(4));

    const machineCode = change.machine?.machineCode ?? null;
    const sessions: MountingSessionRecord[] = Array.isArray(change.mountingSessions)
      ? [...change.mountingSessions]
      : [];
    const unmountIso = `${dto.changeDate}T${dto.changeTime || new Date().toTimeString().slice(0, 5)}:00`;
    const isStandby = dto.action === 'STANDBY';
    const defaultReason = isStandby
      ? 'Part / Size Changeover — Kept in Standby (Reusable)'
      : 'Tool Worn Out / Damaged — Closed Permanently';
    const finalReason = dto.reason?.trim() || defaultReason;

    if (sessions.length > 0 && !sessions[sessions.length - 1].unmountedAt) {
      sessions[sessions.length - 1] = {
        ...sessions[sessions.length - 1],
        unmountedAt: unmountIso,
        endCounter: closingCounter,
        sessionProduction,
        action: isStandby ? 'STANDBY' : 'CLOSED',
        operatorName: dto.operatorName?.trim() || sessions[sessions.length - 1].operatorName || null,
        shiftInchargeName: dto.shiftInchargeName?.trim() || sessions[sessions.length - 1].shiftInchargeName || null,
        reason: finalReason,
        remarks: dto.remarks?.trim() || null,
      };
    } else {
      sessions.push({
        sessionNo: sessions.length + 1,
        machineId: change.machineId,
        machineCode,
        mountedAt: change.changeDate,
        unmountedAt: unmountIso,
        startCounter: installCounter,
        endCounter: closingCounter,
        sessionProduction,
        action: isStandby ? 'STANDBY' : 'CLOSED',
        operatorName: dto.operatorName?.trim() || null,
        shiftInchargeName: dto.shiftInchargeName?.trim() || null,
        reason: finalReason,
        remarks: dto.remarks?.trim() || null,
      });
    }

    delete (change as any).machine;
    delete (change as any).component;
    delete (change as any).storeIssue;

    change.productionCounterBefore = String(closingCounter);
    change.accumulatedLifeBeforeCurrentSession = String(totalCumulativeLife);
    change.productionSincePrevious = String(totalCumulativeLife);
    change.mountingSessions = sessions;
    change.lifecycleStatus = isStandby ? ToolLifecycleStatus.STANDBY : ToolLifecycleStatus.CLOSED;
    change.closedAt = new Date();
    change.reason = finalReason;
    change.lastOperatorName = dto.operatorName?.trim() || change.lastOperatorName;
    change.lastShiftInchargeName = dto.shiftInchargeName?.trim() || change.lastShiftInchargeName;
    if (dto.remarks?.trim()) change.remarks = dto.remarks.trim();

    if (isStandby) {
      change.conditionStatus = dto.conditionStatus || 'USED';
      change.dispositionType = 'RETAINED';
      change.dispositionNote = 'Held in reusable Standby / Tool Crib pool after changeover';
    } else {
      change.conditionStatus = dto.conditionStatus || 'USED';
      change.dispositionType = dto.dispositionType || 'SCRAPPED';
      change.dispositionNote = dto.remarks?.trim() || 'Permanently closed via Tool Changeover';
    }
    change.updatedBy = userId ?? null;

    await this.changeRepo.save(change);
    return {
      ...(await this.lifeDetail(companyId, changeId)),
      sessionProduction,
      totalCumulativeLife,
      lifecycleStatus: change.lifecycleStatus,
    };
  }

  // ─── Re-Mount Reusable Standby Tool ───────────────────────────────────────

  async remountTool(
    changeId: string,
    dto: RemountToolDto,
    companyId: string,
    userId?: string,
  ): Promise<any> {
    const change = await this.changeRepo.findOne({
      where: { id: changeId, companyId, isActive: true },
      relations: ['machine', 'component', 'component.item', 'component.uom', 'storeIssue'],
    });
    if (!change) throw new NotFoundException(`Standby tool run '${changeId}' not found in this company`);
    if (change.lifecycleStatus !== ToolLifecycleStatus.STANDBY) {
      throw new BadRequestException(
        `Tool '${change.newToolCode}' is currently '${change.lifecycleStatus}'. Only STANDBY tools can be re-mounted.`,
      );
    }

    const targetMachine = await this.assertMachineActive(companyId, dto.machineId);

    // Resolve target MachineComponent on targetMachine (same component if same machine, else find/create for targetMachine)
    let targetComponentId = change.componentId;
    if (change.machineId !== targetMachine.id) {
      const srcComp = change.component;
      let match: MachineComponent | null = null;
      if (srcComp?.itemId) {
        match = await this.componentRepo.findOne({
          where: { companyId, machineId: targetMachine.id, itemId: srcComp.itemId, isActive: true },
        });
      }
      if (!match && srcComp?.componentCode) {
        match = await this.componentRepo.findOne({
          where: { companyId, machineId: targetMachine.id, componentCode: srcComp.componentCode, isActive: true },
        });
      }
      if (!match) {
        const created = this.componentRepo.create({
          companyId,
          machineId: targetMachine.id,
          itemId: srcComp?.itemId ?? null,
          componentType: srcComp?.componentType ?? ComponentType.TOOL,
          componentName: srcComp?.componentName ?? change.newToolDescription ?? change.newToolCode,
          componentCode: srcComp?.componentCode ?? change.newToolCode.split(' · ')[0],
          uomId: srcComp?.uomId ?? null,
          expectedLifeQuantity: srcComp?.expectedLifeQuantity ?? null,
          description: `Auto-linked when re-mounting standby tool ${change.newToolCode}`,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        });
        created.isActive = true;
        match = await this.componentRepo.save(created);
      }
      targetComponentId = match.id;
    }

    // Ensure target machine+component does not already have an ACTIVE tool mounted
    const existingActive = await this.changeRepo.findOne({
      where: { companyId, componentId: targetComponentId, isActive: true, closedAt: IsNull() },
    });
    if (existingActive) {
      throw new ConflictException(
        `Machine '${targetMachine.machineCode}' already has an ACTIVE tool ('${existingActive.newToolCode}') mounted on this component. Unmount it to Standby or Close it first.`,
      );
    }

    const currentCounter = await this.deriveCounterAt(companyId, targetMachine.id, dto.mountDate);
    const mountTime = dto.mountTime || new Date().toTimeString().slice(0, 5);
    const preservedLife =
      numOrNull(change.accumulatedLifeBeforeCurrentSession) ?? numOrNull(change.productionSincePrevious) ?? 0;

    const sessions: MountingSessionRecord[] = Array.isArray(change.mountingSessions)
      ? [...change.mountingSessions]
      : [];
    sessions.push({
      sessionNo: sessions.length + 1,
      machineId: targetMachine.id,
      machineCode: targetMachine.machineCode,
      mountedAt: `${dto.mountDate}T${mountTime}:00`,
      unmountedAt: null,
      startCounter: currentCounter,
      endCounter: null,
      sessionProduction: 0,
      action: 'REMOUNTED',
      operatorName: dto.operatorName?.trim() || null,
      shiftInchargeName: dto.shiftInchargeName?.trim() || null,
      reason: `Re-mounted from Standby pool onto ${targetMachine.machineCode}`,
      remarks: dto.remarks?.trim() || null,
    });

    delete (change as any).machine;
    delete (change as any).component;
    delete (change as any).storeIssue;

    change.machineId = targetMachine.id;
    change.componentId = targetComponentId;
    change.changeDate = dto.mountDate;
    change.changeTime = mountTime;
    change.productionCounterAfter = String(currentCounter);
    change.productionCounterBefore = null;
    change.accumulatedLifeBeforeCurrentSession = String(preservedLife);
    change.productionSincePrevious = String(preservedLife);
    change.mountingSessions = sessions;
    change.lifecycleStatus = ToolLifecycleStatus.ACTIVE;
    change.closedAt = null;
    change.dispositionType = null;
    change.dispositionNote = null;
    change.lastOperatorName = dto.operatorName?.trim() || change.lastOperatorName;
    change.lastShiftInchargeName = dto.shiftInchargeName?.trim() || change.lastShiftInchargeName;
    change.reason = `Re-mounted on ${targetMachine.machineCode} (Session #${sessions.length})`;
    if (dto.remarks?.trim()) change.remarks = dto.remarks.trim();
    change.updatedBy = userId ?? null;

    await this.changeRepo.save(change);
    return {
      ...(await this.lifeDetail(companyId, changeId)),
      preservedLife,
      sessionNumber: sessions.length,
    };
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

    // One derived counter per machine (all-time SUM of active non-deleted production entries)
    const machineIds = [...new Set(changes.map((c) => c.machineId))];
    const counters = new Map<string, number>();
    if (machineIds.length) {
      const rows = await this.changeRepo.manager.query(
        `SELECT machine_id, COALESCE(SUM(actual_quantity), 0)::numeric(19,4) AS counter_value
           FROM production_entries
          WHERE company_id = $1 AND machine_id = ANY($2) AND is_active = TRUE AND deleted_at IS NULL
          GROUP BY machine_id`,
        [companyId, machineIds],
      );
      for (const r of rows) counters.set(r.machine_id, numOrNull(r.counter_value) ?? 0);
    }

    // Also compute live Weight (Kg) produced on each machine since each active tool's installDate
    const weightMap = new Map<string, number>();
    for (const c of changes) {
      try {
        const wRows = await this.changeRepo.manager.query(
          `SELECT COALESCE(SUM(pe.actual_quantity * COALESCE(i.weight_per_piece, 0)), 0)::numeric(19,4) AS weight_kg
             FROM production_entries pe
             LEFT JOIN items i ON i.id = pe.item_id
            WHERE pe.company_id = $1
              AND pe.machine_id = $2
              AND pe.is_active = TRUE
              AND pe.deleted_at IS NULL
              AND pe.entry_date >= $3`,
          [companyId, c.machineId, c.changeDate],
        );
        weightMap.set(c.id, Number((numOrNull(wRows[0]?.weight_kg) ?? 0).toFixed(2)));
      } catch {
        weightMap.set(c.id, 0);
      }
    }

    const data = changes.map((c) => {
      const installCounter = numOrNull(c.productionCounterAfter);
      const derived = counters.get(c.machineId) ?? 0;
      const expected = numOrNull((c.component as any)?.expectedLifeQuantity);
      const priorAccumulated = numOrNull(c.accumulatedLifeBeforeCurrentSession) ?? 0;
      const currentSessionUsed =
        installCounter !== null ? Math.max(0, Number((derived - installCounter).toFixed(4))) : derived;
      const used = Number((priorAccumulated + currentSessionUsed).toFixed(4));
      const sessions = Array.isArray(c.mountingSessions) ? c.mountingSessions : [];
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
        accumulatedLifeBeforeCurrentSession: priorAccumulated,
        currentSessionProduction: currentSessionUsed,
        usedByInstalled: used,
        sessionCount: sessions.length || 1,
        mountingSessions: sessions,
        liveWeightKg: weightMap.get(c.id) ?? 0,
        remainingByInstalled: expected !== null ? Math.max(0, expected - used) : null,
        storeIssueId: c.storeIssueId,
        storeIssueNumber: (c.storeIssue as any)?.issueNumber ?? null,
        operatorName: c.lastOperatorName || (c.storeIssue as any)?.operatorName || null,
        shiftInchargeName: c.lastShiftInchargeName || (c.storeIssue as any)?.shiftInchargeName || null,
        issuedByName: (c.storeIssue as any)?.issuedByName ?? null,
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
      standby: number;
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
    if (status === 'STANDBY') qb.andWhere('cc.lifecycleStatus = :standbyStatus', { standbyStatus: ToolLifecycleStatus.STANDBY });
    if (status === 'CLOSED') qb.andWhere('cc.closedAt IS NOT NULL AND cc.lifecycleStatus = :closedStatus', { closedStatus: ToolLifecycleStatus.CLOSED });
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

    // Derive live counters for any ACTIVE rows included in the report so current life is always live
    const activeMachineIds = [...new Set(changes.filter((c) => c.closedAt === null).map((c) => c.machineId))];
    const liveCounters = new Map<string, number>();
    if (activeMachineIds.length) {
      const cRows = await this.changeRepo.manager.query(
        `SELECT machine_id, COALESCE(SUM(actual_quantity), 0)::numeric(19,4) AS counter_value
           FROM production_entries
          WHERE company_id = $1 AND machine_id = ANY($2) AND is_active = TRUE AND deleted_at IS NULL
          GROUP BY machine_id`,
        [companyId, activeMachineIds],
      );
      for (const r of cRows) liveCounters.set(r.machine_id, numOrNull(r.counter_value) ?? 0);
    }

    const data = changes.map((c) => {
      const installCounter = numOrNull(c.productionCounterAfter);
      const removalCounter = numOrNull(c.productionCounterBefore);
      const expected = numOrNull((c.component as any)?.expectedLifeQuantity);
      const priorAccumulated = numOrNull(c.accumulatedLifeBeforeCurrentSession) ?? 0;
      const effectiveStatus =
        c.closedAt === null
          ? ToolLifecycleStatus.ACTIVE
          : c.lifecycleStatus === ToolLifecycleStatus.STANDBY
            ? ToolLifecycleStatus.STANDBY
            : ToolLifecycleStatus.CLOSED;
      const isActive = effectiveStatus === ToolLifecycleStatus.ACTIVE;
      const liveSession =
        isActive && installCounter !== null
          ? Math.max(0, Number(((liveCounters.get(c.machineId) ?? 0) - installCounter).toFixed(4)))
          : null;
      const productionLife = isActive
        ? Number((priorAccumulated + (liveSession ?? 0)).toFixed(4))
        : (numOrNull(c.productionSincePrevious) ?? priorAccumulated);
      const sessions = Array.isArray(c.mountingSessions) ? c.mountingSessions : [];

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
        productionLife,
        accumulatedLifeBeforeCurrentSession: priorAccumulated,
        sessionCount: sessions.length || 1,
        mountingSessions: sessions,
        conditionStatus: c.conditionStatus,
        dispositionType: c.dispositionType,
        dispositionNote: c.dispositionNote,
        reason: c.reason,
        remarks: c.remarks,
        status: effectiveStatus,
        closedAt: c.closedAt,
        jobCardNo: (c.jobCard as any)?.jobCardNo ?? (c.jobCard as any)?.code ?? null,
        storeIssueNumber: (c.storeIssue as any)?.issueNumber ?? null,
        storeIssueId: c.storeIssueId,
        operatorName: c.lastOperatorName || (c.storeIssue as any)?.operatorName || null,
        shiftInchargeName: c.lastShiftInchargeName || (c.storeIssue as any)?.shiftInchargeName || null,
        issuedByName: (c.storeIssue as any)?.issuedByName ?? null,
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
        active: data.filter((r) => r.status === ToolLifecycleStatus.ACTIVE).length,
        standby: data.filter((r) => r.status === ToolLifecycleStatus.STANDBY).length,
        closed: data.filter((r) => r.status === ToolLifecycleStatus.CLOSED).length,
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