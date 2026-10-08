import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MachineTarget, MachineTargetStatus } from '../entities/machine-target.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Shift } from '../../production/entities/shift.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Item } from '../../item/entities/item.entity';
import { applyDivisionScopeFilter, isUnrestricted } from '../../../common/division-scope.util';
import {
  familyOf,
  convertWithItemData,
  supportedConversions,
  MissingConversionDataError,
  ConversionItemData,
  UomTypeInfo,
  UomFamily,
} from '../../item/services/uom-conversion.calculator';
import {
  CreateMachineTargetDto,
  UpdateMachineTargetDto,
  MachineTargetQueryDto,
  ResolveMachineTargetQueryDto,
} from '../dto';

export const GENERAL_SHIFT_CODE = 'GENERAL';

/** Production units allowed for machine targets (PROMPT-16): KG / PCS / METER. */
export const PRODUCTION_UOM_CODES = ['KG', 'PCS', 'M', 'METER'];

/**
 * Decimal-safe pro-rating used everywhere targets are calculated:
 *   calculated = standard_target × actual_working_hours / standard_hours
 * Rounded to 4 dp to stay exact against NUMERIC(19,4) columns.
 */
export function calculateProratedTarget(
  targetQuantity: number | string,
  standardHours: number | string,
  workingHours: number | string,
): number {
  const q = Number(targetQuantity);
  const s = Number(standardHours);
  const w = Number(workingHours);
  if (!(s > 0)) throw new BadRequestException('standardHours must be greater than 0');
  if (!(w >= 0)) throw new BadRequestException('workingHours must be greater than or equal to 0');
  return Number(((q * w) / s).toFixed(4));
}

interface EffectiveResolution {
  target: MachineTarget | null;
  usedGeneralFallback: boolean;
}

// ─── Import (smart upsert) helpers ──────────────────────────────────────────

/** What an import line will do to the database. */
export type MachineTargetImportAction = 'created' | 'updated' | 'error';

export interface MachineTargetImportResult {
  row: number;
  status: 'imported' | 'error';
  action: MachineTargetImportAction;
  message: string;
}

export interface MachineTargetImportSummary {
  totalRows: number;
  /** Rows written = `created + updated` (kept as-is for existing clients). */
  imported: number;
  created: number;
  updated: number;
  failed: number;
  results: MachineTargetImportResult[];
}

/**
 * The ONLY columns an import line may ever write. Everything else on the row
 * keeps its stored value — that is the zero-overwrite guarantee of rule 2.
 */
export type MachineTargetPatch = Partial<
  Pick<
    MachineTarget,
    | 'shiftId'
    | 'uomId'
    | 'itemId'
    | 'standardHours'
    | 'targetQuantity'
    | 'effectiveFrom'
    | 'effectiveTo'
    | 'status'
    | 'remarks'
    | 'updatedBy'
  >
>;

/**
 * Canonical template column → accepted header spellings.
 * `Machine Code`, `machine_code`, `MACHINE CODE` and `machinecode` all collapse
 * onto the same normalised key (see `normaliseImportHeader`).
 */
export const IMPORT_COLUMN_ALIASES = {
  machineCode: ['machinecode', 'machinenumber', 'machine'],
  shiftCode: ['shiftcode', 'shift'],
  uomCode: ['uomcode', 'uom'],
  itemCode: ['itemcode', 'item'],
  standardTarget: ['standardtarget', 'targetquantity', 'target'],
  standardHours: ['standardhours', 'hours'],
  effectiveFrom: ['effectivefrom', 'fromdate'],
  effectiveTo: ['effectiveto', 'todate'],
  status: ['status'],
  remarks: ['remarks'],
} as const;

export function normaliseImportHeader(header: string): string {
  return header.toLowerCase().replace(/[\s_-]+/g, '');
}

/** Field separator that cannot occur in a UUID, so keys can never collide. */
const ANCHOR_SEP = '\u0001';

/** Composite unique anchor key — [Machine Code + Shift Code + Item Code]. */
export function anchorKey(machineId: string, shiftId: string | null, itemId: string | null): string {
  return `${machineId}${ANCHOR_SEP}${shiftId ?? ''}${ANCHOR_SEP}${itemId ?? ''}`;
}

/** Relaxation key used when the strict anchor misses and no row can be created. */
export function machineItemKey(machineId: string, itemId: string | null): string {
  return `${machineId}${ANCHOR_SEP}${itemId ?? ''}`;
}

/**
 * Pick THE row for a matched key. History is never rewritten (a new revision
 * gets its own row), so an anchor usually matches several generations — resolve
 * to the one an operator means *today*:
 *   open + ACTIVE  ›  currently in effect  ›  newest `effective_from`  ›  `id`
 * The final `id` tiebreak keeps the choice deterministic across runs.
 */
export function pickCurrentTarget(rows: MachineTarget[], today: string): MachineTarget {
  const open = (t: MachineTarget): number => (t.isActive && t.status === MachineTargetStatus.ACTIVE ? 1 : 0);
  const inEffect = (t: MachineTarget): number =>
    t.effectiveFrom <= today && (!t.effectiveTo || t.effectiveTo >= today) ? 1 : 0;

  return [...rows].sort((a, b) => {
    const byOpen = open(b) - open(a);
    if (byOpen !== 0) return byOpen;
    const byEffect = inEffect(b) - inEffect(a);
    if (byEffect !== 0) return byEffect;
    const fromA = a.effectiveFrom ?? '';
    const fromB = b.effectiveFrom ?? '';
    if (fromA !== fromB) return fromA < fromB ? 1 : -1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/**
 * Rows the relaxed [Machine + Item] lookup may adopt. Prefer live targets; if a
 * machine+item only has retired generations left, fall back to those rather
 * than claiming "no match". A size ≠ 1 is never guessed at.
 */
export function relaxationCandidates(rows: MachineTarget[] | undefined): MachineTarget[] {
  if (!rows || rows.length === 0) return [];
  const live = rows.filter((r) => r.isActive && r.status === MachineTargetStatus.ACTIVE);
  return live.length > 0 ? live : rows;
}

@Injectable()
export class MachineTargetService {
  /** HTTP query strings can arrive as 'false' (string) or false (boolean) depending on pipe coercion — accept both. */
  static isFalseFlag(v: unknown): boolean {
    return v === false || v === 'false';
  }

  constructor(
    @InjectRepository(MachineTarget)
    private readonly targetRepo: Repository<MachineTarget>,
    @InjectRepository(Machine)
    private readonly machineRepo: Repository<Machine>,
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
    @InjectRepository(Uom)
    private readonly uomRepo: Repository<Uom>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
  ) {}

  // ─── Division scope helpers (Prompt #16 §18/§19) ───────────────────────────

  /**
   * Read-by-ID / write authorization. `MachineTarget` carries no division_id
   * of its own — its division is inherited from the machine it targets
   * (`machine.division_id`), exactly like the existing explicit `divisionId`
   * list filter. Throws 403 when that division is outside the caller's list.
   *
   * `divisionId` may be null (machine not yet filed under a division); those
   * inherit the company's access and are not refused — mirroring
   * `ProductionEntryService.assertDivisionAccess`.
   */
  private assertDivisionAccess(
    allowedDivisionIds: string[] | undefined,
    divisionId: string | null | undefined,
    label = 'machine target',
  ): void {
    if (isUnrestricted(allowedDivisionIds)) return;
    if (!divisionId) return;
    if ((allowedDivisionIds as string[]).includes(divisionId)) return;
    throw new ForbiddenException(`You do not have access to the ${label} in this division.`);
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  async findAll(
    companyId: string,
    filters: MachineTargetQueryDto & { allowedDivisionIds?: string[] },
  ): Promise<{ data: MachineTarget[]; total: number; page: number; limit: number }> {
    const {
      page = 1,
      limit = 20,
      machineId,
      shiftId,
      itemId,
      uomId,
      divisionId,
      sectionId,
      departmentId,
      machineCode,
      machineNumber,
      status,
      effectiveOn,
      search,
      sortBy,
      sortDir = 'ASC',
      allowedDivisionIds,
    } = filters || {};

    const qb = this.targetRepo
      .createQueryBuilder('mt')
      .leftJoinAndSelect('mt.machine', 'machine')
      .leftJoinAndSelect('machine.division', 'machineDivision')
      .leftJoinAndSelect('machine.section', 'machineSection')
      .leftJoinAndSelect('machine.department', 'machineDepartment')
      .leftJoinAndSelect('mt.shift', 'shift')
      .leftJoinAndSelect('mt.uom', 'uom')
      .leftJoinAndSelect('mt.item', 'item')
      .leftJoinAndSelect('mt.createdByUser', 'createdByUser')
      .leftJoinAndSelect('mt.updatedByUser', 'updatedByUser')
      .where('mt.companyId = :companyId', { companyId })
      .andWhere('mt.isActive = true');

    if (machineId) qb.andWhere('mt.machineId = :machineId', { machineId });
    if (shiftId) qb.andWhere('mt.shiftId = :shiftId', { shiftId });
    if (itemId) qb.andWhere('mt.itemId = :itemId', { itemId });
    if (uomId) qb.andWhere('mt.uomId = :uomId', { uomId });
    if (divisionId) qb.andWhere('machine.divisionId = :divisionId', { divisionId });
    if (sectionId) qb.andWhere('machine.sectionId = :sectionId', { sectionId });
    if (departmentId) qb.andWhere('machine.departmentId = :departmentId', { departmentId });
    // Server-side division scoping (Prompt #16) — MachineTarget inherits its
    // division from the machine it targets (`machine.division_id`).
    applyDivisionScopeFilter(qb, 'machine.divisionId', allowedDivisionIds);
    if (machineCode) qb.andWhere('machine.machineCode ILIKE :mcode', { mcode: `%${machineCode}%` });
    if (machineNumber) qb.andWhere('machine.machineNumber ILIKE :mnum', { mnum: `%${machineNumber}%` });
    if (status) qb.andWhere('mt.status = :status', { status });
    // NOTE: no `::` casts in expressions – they break TypeORM parameter parsing.
    if (effectiveOn) {
      qb.andWhere('mt.effectiveFrom <= :effOn', { effOn: effectiveOn });
      qb.andWhere('(mt.effectiveTo >= :effOn2 OR mt.effectiveTo IS NULL)', { effOn2: effectiveOn });
    }
    if (search) {
      qb.andWhere(
        '(machine.machineId ILIKE :search OR machine.machineCode ILIKE :search OR machine.name ILIKE :search OR machine.machineNumber ILIKE :search OR item.itemCode ILIKE :search OR item.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const sortMap: Record<string, string> = {
      machineCode: 'machine.machineCode',
      machineName: 'machine.name',
      itemCode: 'item.itemCode',
      itemName: 'item.name',
      shiftCode: 'shift.shiftCode',
      uomCode: 'uom.code',
      effectiveFrom: 'mt.effectiveFrom',
      effectiveTo: 'mt.effectiveTo',
      targetQuantity: 'mt.targetQuantity',
      standardHours: 'mt.standardHours',
      status: 'mt.status',
      createdAt: 'mt.createdAt',
    };
    const orderColumn = sortMap[sortBy ?? 'machineCode'] ?? 'machine.machineCode';
    qb.orderBy(orderColumn, sortDir === 'DESC' ? 'DESC' : 'ASC');
    qb.addOrderBy('mt.effectiveFrom', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string, allowedDivisionIds?: string[]): Promise<MachineTarget> {
    const target = await this.targetRepo.findOne({
      where: { id, companyId },
      relations: [
        'machine', 'shift', 'uom', 'item',
        'machine.department', 'machine.section', 'machine.division',
        'createdByUser', 'updatedByUser',
      ],
    });
    if (!target || !target.isActive) {
      throw new NotFoundException(`Machine Target '${id}' not found`);
    }
    // §18 — guessing an ID must not bypass the list filter.
    this.assertDivisionAccess(allowedDivisionIds, target.machine?.divisionId, 'machine target');
    return target;
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  async create(
    dto: CreateMachineTargetDto,
    companyId: string,
    userId?: string,
    allowedDivisionIds?: string[],
  ): Promise<MachineTarget> {
    const machine = await this.assertRefsValid(companyId, dto.machineId, dto.shiftId, dto.uomId, dto.itemId);
    this.validateDates(dto.effectiveFrom, dto.effectiveTo ?? null);
    this.assertOrgConsistent(machine, dto);
    // §19 — the target's division (inherited from its machine) must be allowed.
    this.assertDivisionAccess(allowedDivisionIds, machine.divisionId, 'machine target');

    await this.assertNoOverlap(
      companyId, dto.machineId, dto.shiftId, dto.itemId, dto.uomId,
      dto.effectiveFrom, dto.effectiveTo ?? null,
    );

    const target = this.targetRepo.create({
      companyId,
      machineId: dto.machineId,
      shiftId: dto.shiftId,
      itemId: dto.itemId,
      uomId: dto.uomId,
      standardHours: String(dto.standardHours),
      targetQuantity: String(dto.targetQuantity),
      effectiveFrom: dto.effectiveFrom,
      effectiveTo: dto.effectiveTo ?? null,
      status: dto.status ?? MachineTargetStatus.ACTIVE,
      remarks: dto.remarks?.trim() || null,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });

    try {
      const saved = await this.targetRepo.save(target);
      // Reload with machine/shift/item/UOM/org relations for a complete API response.
      return await this.findOne(saved.id, companyId, allowedDivisionIds);
    } catch (e: any) {
      // uq_machine_targets_active_open_combo safety net
      if (String(e?.code) === '23505' || String(e?.detail ?? '').includes('uq_machine_targets_active_open_combo')) {
        throw new ConflictException(
          'An open-ended ACTIVE target already exists for this machine/shift/Item/UOM combination',
        );
      }
      throw e;
    }
  }

  async update(
    id: string,
    dto: UpdateMachineTargetDto,
    companyId: string,
    userId?: string,
    allowedDivisionIds?: string[],
  ): Promise<MachineTarget> {
    const existing = await this.findOne(id, companyId, allowedDivisionIds);

    const merged = {
      machineId: dto.machineId ?? existing.machineId,
      shiftId: dto.shiftId ?? existing.shiftId,
      itemId: dto.itemId !== undefined ? dto.itemId ?? null : existing.itemId,
      uomId: dto.uomId ?? existing.uomId,
      standardHours: dto.standardHours !== undefined ? String(dto.standardHours) : String(existing.standardHours),
      targetQuantity: dto.targetQuantity !== undefined ? String(dto.targetQuantity) : String(existing.targetQuantity),
      effectiveFrom: dto.effectiveFrom ?? existing.effectiveFrom,
      effectiveTo: dto.effectiveTo !== undefined ? dto.effectiveTo ?? null : existing.effectiveTo,
      status: dto.status ?? existing.status,
      remarks: dto.remarks !== undefined ? dto.remarks?.trim() || null : existing.remarks,
    };

    const machine = await this.assertRefsValid(companyId, merged.machineId, merged.shiftId, merged.uomId, merged.itemId);
    this.validateDates(merged.effectiveFrom, merged.effectiveTo);
    this.assertOrgConsistent(machine, dto);
    // §19 — re-check when the update moves the target to another machine.
    this.assertDivisionAccess(allowedDivisionIds, machine.divisionId, 'machine target');
    if (
      dto.status === MachineTargetStatus.ACTIVE ||
      (dto.status === undefined && existing.status === MachineTargetStatus.ACTIVE)
    ) {
      await this.assertNoOverlap(
        companyId, merged.machineId, merged.shiftId, merged.itemId, merged.uomId,
        merged.effectiveFrom, merged.effectiveTo, id,
      );
    }

    Object.assign(existing, merged, { updatedBy: userId ?? null });
    // Remove populated relation objects so TypeORM persists the updated foreign keys (itemId, machineId, shiftId, uomId)
    delete (existing as any).machine;
    delete (existing as any).shift;
    delete (existing as any).uom;
    delete (existing as any).item;
    // Remove loaded audit-user relations so TypeORM persists the fresh updatedBy value
    delete (existing as any).createdByUser;
    delete (existing as any).updatedByUser;

    try {
      await this.targetRepo.save(existing);
      return await this.findOne(id, companyId, allowedDivisionIds);
    } catch (e: any) {
      if (String(e?.code) === '23505') {
        throw new ConflictException(
          'An open-ended ACTIVE target already exists for this machine/shift/Item/UOM combination',
        );
      }
      throw e;
    }
  }

  async changeStatus(
    id: string,
    status: MachineTargetStatus,
    companyId: string,
    userId?: string,
    allowedDivisionIds?: string[],
  ): Promise<MachineTarget> {
    const target = await this.findOne(id, companyId, allowedDivisionIds);
    if (status === MachineTargetStatus.ACTIVE && target.status !== MachineTargetStatus.ACTIVE) {
      await this.assertNoOverlap(
        companyId, target.machineId, target.shiftId, target.itemId ?? null, target.uomId,
        target.effectiveFrom, target.effectiveTo, id,
      );
    }
    target.status = status;
    target.updatedBy = userId ?? null;
    delete (target as any).updatedByUser;
    await this.targetRepo.save(target);
    return this.findOne(id, companyId, allowedDivisionIds);
  }

  /** Soft delete per ERP convention — historical snapshots keep their FK alive. */
  async remove(id: string, companyId: string, userId?: string, allowedDivisionIds?: string[]): Promise<void> {
    const target = await this.findOne(id, companyId, allowedDivisionIds);
    target.isActive = false;
    target.updatedBy = userId ?? null;
    delete (target as any).updatedByUser;
    await this.targetRepo.save(target);
  }

  // ─── Resolution ─────────────────────────────────────────────────────────────

  /**
   * Resolve endpoint payload: deterministic target for machine+shift on a
   * production date plus the pro-rated calculated target for given hours.
   */
  async resolve(
    query: ResolveMachineTargetQueryDto,
    companyId: string,
    allowedDivisionIds?: string[],
  ): Promise<any> {
    const machine = await this.machineRepo.findOne({ where: { id: query.machineId, companyId } });
    if (!machine) throw new NotFoundException(`Machine '${query.machineId}' not found in this company`);
    // §18 — resolving a target for a machine outside the caller's division is refused.
    this.assertDivisionAccess(allowedDivisionIds, machine.divisionId, 'machine target');

    let item: Item | null = null;
    if (query.itemId) {
      item = await this.itemRepo.findOne({ where: { id: query.itemId, companyId } });
      if (!item) throw new NotFoundException(`Item '${query.itemId}' not found in this company`);
    }

    const resolution = await this.resolveEffectiveEntity(
      companyId,
      query.machineId,
      query.shiftId,
      query.productionDate,
      !MachineTargetService.isFalseFlag(query.allowGeneralFallback),
      query.uomId,
      query.itemId,
    );
    if (!resolution.target) {
      throw new BadRequestException('No active target is configured for this machine and shift.');
    }
    const t = resolution.target;

    let calculatedTarget: number | null = null;
    if (query.workingHours !== undefined && query.workingHours !== null) {
      calculatedTarget = calculateProratedTarget(t.targetQuantity, t.standardHours, query.workingHours);
    }

    // targetPerHour is always returned so clients can auto-calculate without
    // re-fetching (PROMPT-10: no manual hourly calculation on the UI).
    const targetPerHour = Number((Number(t.targetQuantity) / Number(t.standardHours)).toFixed(4));

    const [shift, uom] = await Promise.all([
      this.shiftRepo.findOne({ where: { id: t.shiftId } }),
      this.uomRepo.findOne({ where: { id: t.uomId } }),
    ]);

    // Item info + conversion master data summary for the resolved item.
    const resolvedItem = item
      ? item
      : t.itemId
        ? await this.itemRepo.findOne({ where: { id: t.itemId, companyId } })
        : null;

    return {
      effectiveTargetRecordId: t.id,
      usedGeneralFallback: resolution.usedGeneralFallback,
      machine: {
        id: machine.id,
        machineId: machine.machineId,
        code: machine.machineCode,
        name: machine.name,
        number: machine.machineNumber,
      },
      shift: shift ? { id: shift.id, code: shift.shiftCode, name: shift.name } : null,
      uom: uom ? { id: uom.id, code: uom.code, name: uom.name, symbol: uom.symbol } : null,
      item: resolvedItem
        ? {
            id: resolvedItem.id,
            code: resolvedItem.itemCode,
            name: resolvedItem.name,
            itemType: resolvedItem.itemType,
            baseUomId: resolvedItem.baseUomId ?? null,
            conversions: {
              weightPerPiece: resolvedItem.weightPerPiece,
              piecesPerKg: resolvedItem.piecesPerKg,
              weightPerMeter: resolvedItem.weightPerMeter,
              lengthPerPiece: resolvedItem.lengthPerPiece,
              supported: supportedConversions(resolvedItem).filter((c) => c.available),
            },
          }
        : null,
      standardHours: Number(t.standardHours),
      standardTarget: Number(t.targetQuantity),
      targetPerHour,
      actualWorkingHours: query.workingHours ?? null,
      calculatedTarget,
      effectiveFrom: t.effectiveFrom,
      effectiveTo: t.effectiveTo,
      status: t.status,
    };
  }

  /**
   * Batch lookup active machine targets for a given shift and date.
   * Powers the production machine cards and status summaries without N+1 queries.
   */
  async findActiveTargetsForShift(
    companyId: string,
    shiftId: string,
    date: string,
    machineIds?: string[],
  ): Promise<MachineTarget[]> {
    const qb = this.targetRepo
      .createQueryBuilder('mt')
      .leftJoinAndSelect('mt.uom', 'uom')
      .where('mt.companyId = :companyId', { companyId })
      .andWhere('mt.isActive = true')
      .andWhere('mt.shiftId = :shiftId', { shiftId })
      .andWhere('mt.status = :status', { status: MachineTargetStatus.ACTIVE })
      .andWhere('mt.effectiveFrom <= :date', { date })
      .andWhere('(mt.effectiveTo >= :date OR mt.effectiveTo IS NULL)', { date });

    if (machineIds && machineIds.length > 0) {
      qb.andWhere('mt.machineId IN (:...machineIds)', { machineIds });
    }
    qb.orderBy('mt.effectiveFrom', 'DESC');
    return qb.getMany();
  }

  /**
   * Core resolution used by Production Entry integration.
   * Deterministic: ACTIVE + is_active + date inside [effective_from, effective_to].
   * Exactly one row may match — two matches are a configuration error, zero
   * falls back to the company's GENERAL shift when allowed.
   */
  async resolveEffectiveEntity(
    companyId: string,
    machineId: string,
    shiftId: string,
    productionDate: string,
    allowGeneralFallback = true,
    uomId?: string,
    itemId?: string,
  ): Promise<EffectiveResolution> {
    let candidates: MachineTarget[] = [];

    if (itemId) {
      // 1. Try item-specific candidate first
      candidates = await this.findEffectiveCandidates(companyId, machineId, shiftId, productionDate, uomId, itemId);
      // 2. If no item-specific target, try generic target (itemId IS NULL)
      if (candidates.length === 0) {
        candidates = await this.findEffectiveCandidates(companyId, machineId, shiftId, productionDate, uomId, null);
      }
      // 3. If machine has only item-scoped targets and none match this item, fall back to any active target on this machine
      if (candidates.length === 0) {
        candidates = await this.findEffectiveCandidates(companyId, machineId, shiftId, productionDate, uomId, undefined);
      }
    } else {
      // No item specified yet (initial machine context):
      // Try generic target (itemId IS NULL) first
      candidates = await this.findEffectiveCandidates(companyId, machineId, shiftId, productionDate, uomId, null);
      // If no generic target, fall back to any active target on this machine
      if (candidates.length === 0) {
        candidates = await this.findEffectiveCandidates(companyId, machineId, shiftId, productionDate, uomId, undefined);
      }
    }

    if (candidates.length >= 1) {
      return { target: candidates[0], usedGeneralFallback: false };
    }

    if (!allowGeneralFallback) return { target: null, usedGeneralFallback: false };

    const generalShift = await this.shiftRepo.findOne({
      where: { companyId, shiftCode: GENERAL_SHIFT_CODE },
    });
    if (!generalShift || generalShift.id === shiftId) {
      return { target: null, usedGeneralFallback: false };
    }

    // GENERAL shift fallback
    if (itemId) {
      candidates = await this.findEffectiveCandidates(companyId, machineId, generalShift.id, productionDate, uomId, itemId);
      if (candidates.length === 0) {
        candidates = await this.findEffectiveCandidates(companyId, machineId, generalShift.id, productionDate, uomId, null);
      }
      if (candidates.length === 0) {
        candidates = await this.findEffectiveCandidates(companyId, machineId, generalShift.id, productionDate, uomId, undefined);
      }
    } else {
      candidates = await this.findEffectiveCandidates(companyId, machineId, generalShift.id, productionDate, uomId, null);
      if (candidates.length === 0) {
        candidates = await this.findEffectiveCandidates(companyId, machineId, generalShift.id, productionDate, uomId, undefined);
      }
    }

    return { target: candidates[0] ?? null, usedGeneralFallback: !!candidates[0] };
  }

  // ─── Validation helpers ─────────────────────────────────────────────────────

  private validateDates(effectiveFrom: string, effectiveTo: string | null): void {
    if (effectiveTo && !(effectiveTo > effectiveFrom)) {
      throw new BadRequestException('effectiveTo must be after effectiveFrom');
    }
  }

  private async assertRefsValid(
    companyId: string,
    machineId: string,
    shiftId: string,
    uomId: string,
    itemId?: string | null,
  ): Promise<Machine> {
    const machine = await this.machineRepo.findOne({ where: { id: machineId, companyId } });
    if (!machine || !machine.isActive) {
      throw new NotFoundException(`Machine '${machineId}' not found in this company`);
    }
    if (machine.status !== 'ACTIVE') {
      throw new BadRequestException(`Machine '${machine.machineCode}' is not ACTIVE`);
    }

    const shift = await this.shiftRepo.findOne({ where: { id: shiftId, companyId } });
    if (!shift || !shift.isActive) {
      throw new NotFoundException(`Shift '${shiftId}' not found in this company`);
    }

    const uom = await this.uomRepo.findOne({ where: { id: uomId } });
    if (!uom) throw new NotFoundException(`UOM '${uomId}' not found`);
    if (uom.status !== 'ACTIVE') throw new BadRequestException(`UOM '${uom.code}' is not ACTIVE`);
    if (!PRODUCTION_UOM_CODES.includes(String(uom.code).toUpperCase())) {
      throw new BadRequestException(
        `UOM '${uom.code}' is not a supported production target unit (allowed: KG, PCS, METER)`,
      );
    }

    if (itemId) {
      const item = await this.itemRepo.findOne({
        where: { id: itemId, companyId },
        relations: ['baseUom'],
      });
      if (!item || !item.isActive) {
        throw new NotFoundException(`Item '${itemId}' not found in this company`);
      }
      this.assertItemUomCompatible(item, uom);
    }

    return machine;
  }

  /** Family of a production UOM, falling back to its well-known code when uomType is unmaintained. */
  private productionFamily(uom: UomTypeInfo): UomFamily | null {
    const byType = familyOf(uom);
    if (byType) return byType;
    switch (String(uom.code ?? '').toUpperCase()) {
      case 'KG':
        return 'WEIGHT';
      case 'PCS':
        return 'COUNT';
      case 'M':
      case 'METER':
        return 'LENGTH';
      default:
        return null;
    }
  }

  /**
   * PROMPT-10: a target UOM is only valid for an item when it matches the
   * item's base production family or the item's own conversion master data
   * provides a mathematically valid path between the two families. Reuses the
   * Item Master conversion calculator (PROMPT-09) — no duplicated rules.
   */
  private assertItemUomCompatible(item: Item, uom: Uom): void {
    const targetFamily = this.productionFamily(uom);
    if (!targetFamily) {
      throw new BadRequestException(
        `UOM '${uom.code}' is not a supported production target unit (allowed: KG, PCS, METER)`,
      );
    }
    const baseFamily = item.baseUom ? this.productionFamily(item.baseUom) : null;
    if (!baseFamily) {
      throw new BadRequestException(
        `Item '${item.itemCode}' has no production base unit; maintain its base UOM or conversion data before setting a target in '${uom.code}'`,
      );
    }

    // Target unit equals the item's own base unit family → always compatible.
    if (baseFamily === targetFamily) return;

    try {
      convertWithItemData(item as ConversionItemData, baseFamily, targetFamily, 1);
    } catch (e: any) {
      if (e instanceof MissingConversionDataError) {
        throw new BadRequestException(
          `Target UOM '${uom.code}' cannot be used for item '${item.itemCode}': ${e.message}`,
        );
      }
      throw e;
    }
  }

  /**
   * PROMPT-10 org consistency: the optional verification fields must match the
   * machine's Division→Section→Department chain exactly, preventing targets
   * being filed under an organisation the machine does not belong to.
   */
  private assertOrgConsistent(
    machine: Machine,
    org: { divisionId?: string; sectionId?: string; departmentId?: string },
  ): void {
    if (org.divisionId && machine.divisionId !== org.divisionId) {
      throw new BadRequestException(
        `Machine '${machine.machineCode}' does not belong to division '${org.divisionId}'`,
      );
    }
    if (org.sectionId && machine.sectionId !== org.sectionId) {
      throw new BadRequestException(
        `Machine '${machine.machineCode}' does not belong to section '${org.sectionId}'`,
      );
    }
    if (org.departmentId && machine.departmentId !== org.departmentId) {
      throw new BadRequestException(
        `Machine '${machine.machineCode}' does not belong to department '${org.departmentId}'`,
      );
    }
  }

  /**
   * Two ACTIVE windows for the same (company, machine, shift, item, uom) must
   * never overlap — otherwise target resolution would be ambiguous. Open-ended
   * rows are treated as extending to infinity. The item dimension mirrors the
   * uq_machine_targets_active_open_combo index (NULLs distinct).
   */
  private async assertNoOverlap(
    companyId: string,
    machineId: string,
    shiftId: string,
    itemId: string | null,
    uomId: string,
    effectiveFrom: string,
    effectiveTo: string | null,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.targetRepo
      .createQueryBuilder('mt')
      .where('mt.companyId = :companyId', { companyId })
      .andWhere('mt.machineId = :machineId', { machineId })
      .andWhere('mt.shiftId = :shiftId', { shiftId })
      .andWhere('mt.uomId = :uomId', { uomId })
      .andWhere('mt.status = :status', { status: MachineTargetStatus.ACTIVE })
      .andWhere('mt.isActive = true')
      .andWhere('(mt.effectiveFrom <= :rangeTo OR :rangeToIsNull)', {
        rangeTo: effectiveTo,
        rangeToIsNull: effectiveTo === null,
      })
      .andWhere('(mt.effectiveTo >= :rangeFrom OR mt.effectiveTo IS NULL)', { rangeFrom: effectiveFrom });
    if (itemId) qb.andWhere('mt.itemId = :itemId', { itemId });
    else qb.andWhere('mt.itemId IS NULL');
    if (excludeId) qb.andWhere('mt.id != :excludeId', { excludeId });

    const conflict = await qb.getOne();
    if (conflict) {
      throw new ConflictException(
        `Overlapping ACTIVE target already exists (${conflict.id}: ${conflict.effectiveFrom} → ${conflict.effectiveTo ?? 'open'}). Close it before creating a new period.`,
      );
    }
  }

  // ─── Import ─────────────────────────────────────────────────────────────────

  /**
   * Hand-rolled CSV parser (RFC 4180 quote handling).
   * Mirrors the maintenance module's parseCsv pattern.
   */
  static parseCsv(content: string): string[][] {
    const rows: string[][] = [];
    let cur: string[] = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (inQuotes) {
        if (ch === '"') {
          if (content[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cur.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && content[i + 1] === '\n') i++;
        cur.push(field);
        field = '';
        if (cur.some((c) => c.trim() !== '')) rows.push(cur);
        cur = [];
      } else {
        field += ch;
      }
    }
    cur.push(field);
    if (cur.some((c) => c.trim() !== '')) rows.push(cur);
    return rows;
  }

  /**
   * Bulk import machine targets from parsed CSV rows — smart **UPSERT**.
   *
   * 1. ANCHOR — `[Machine Code + Shift Code + Item Code]` is the composite unique
   *    key used to look up an existing `machine_targets` row. A line that hits the
   *    anchor is UPDATED in place; it is never inserted as a duplicate.
   * 2. PARTIAL COLUMN UPDATE (zero-overwrite safety) — a cell that is empty, or
   *    whose column is excluded from the sheet entirely, is NOT written. The
   *    stored value is retained and only the columns carrying data are overwritten.
   * 3. RELAXED ANCHOR — when the strict key misses and the line does not carry
   *    enough data to stand alone as an INSERT (Standard Target / Standard Hours /
   *    Effective From), the resolver falls back to `[Machine + Item]`, but only
   *    when exactly one such row exists. Anything ambiguous fails loudly instead
   *    of guessing which shift's target to rewrite.
   *
   * String codes are mapped to their foreign keys before matching, and every
   * write happens inside ONE transaction (all-or-nothing).
   */
  async importCsv(
    companyId: string,
    userId: string | undefined,
    fileBuffer: Buffer,
    allowedDivisionIds?: string[],
  ): Promise<MachineTargetImportSummary> {
    const content = fileBuffer.toString('utf-8').replace(/^\uFEFF/, '');
    const rows = MachineTargetService.parseCsv(content);
    if (rows.length < 2) {
      throw new BadRequestException('CSV file is empty or has no data rows');
    }

    const header = rows[0].map((h) => h.trim());
    const headerMap: Record<string, number> = {};
    header.forEach((h, i) => {
      headerMap[normaliseImportHeader(h)] = i;
    });

    /**
     * First NON-empty value across the accepted aliases. A column that is absent
     * from the sheet and a cell that is blank both read as `''` — i.e. "no data",
     * which the resolver below treats as "keep whatever is stored".
     */
    const read = (cells: string[], aliases: readonly string[]): string => {
      for (const alias of aliases) {
        const idx = headerMap[alias];
        if (idx === undefined) continue; // column excluded from the sheet
        const value = (cells[idx] ?? '').trim();
        if (value !== '') return value; // blank cell → retained, not read
      }
      return '';
    };

    // Resolve all master data for validation
    const [machines, shifts, uoms, items] = await Promise.all([
      this.machineRepo.find({ where: { companyId, isActive: true }, relations: ['division', 'section', 'department'] }),
      this.shiftRepo.find({ where: { companyId, isActive: true } }),
      this.uomRepo.find({ where: {} }),
      this.itemRepo.find({ where: { companyId, isActive: true } }),
    ]);

    const machineByCode = new Map(machines.map((m) => [m.machineCode.toUpperCase(), m]));
    const machineByNumber = new Map(machines.filter((m) => m.machineNumber).map((m) => [m.machineNumber!.toUpperCase(), m]));
    const shiftByCode = new Map(shifts.map((s) => [s.shiftCode.toUpperCase(), s]));
    const shiftLabel = new Map(shifts.map((s) => [s.id, s.shiftCode]));
    const uomByCode = new Map(uoms.map((u) => [u.code.toUpperCase(), u]));
    const itemByCode = new Map(items.map((i) => [i.itemCode.toUpperCase(), i]));

    // ── Composite anchor indexes (loaded once, resolved in memory) ───────────
    const existing = await this.targetRepo.find({ where: { companyId, isActive: true } });
    const byAnchor = new Map<string, MachineTarget[]>();
    const byMachineItem = new Map<string, MachineTarget[]>();
    const bucket = (map: Map<string, MachineTarget[]>, key: string, row: MachineTarget): void => {
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    };
    for (const row of existing) {
      bucket(byAnchor, anchorKey(row.machineId, row.shiftId, row.itemId), row);
      bucket(byMachineItem, machineItemKey(row.machineId, row.itemId), row);
    }

    const results: MachineTargetImportResult[] = [];
    const fail = (row: number, message: string): void => {
      results.push({ row, status: 'error', action: 'error', message });
    };

    const toInsert: Array<{ entity: Partial<MachineTarget>; rowNum: number }> = [];
    const toUpdate: Array<{
      target: MachineTarget;
      patch: MachineTargetPatch;
      changed: string[];
      rowNum: number;
    }> = [];
    /** One file line ⇒ one write; guards against two lines claiming one anchor. */
    const claimedWrites = new Set<string>();
    const today = new Date().toISOString().slice(0, 10);

    for (let idx = 1; idx < rows.length; idx++) {
      const data = rows[idx];
      const rowNum = idx + 1;

      // ── Anchor column 1 — Machine (always required) ──────────────────────
      const machineCode = read(data, IMPORT_COLUMN_ALIASES.machineCode);
      if (!machineCode) {
        fail(rowNum, 'Machine Code is required');
        continue;
      }
      const machine = machineByCode.get(machineCode.toUpperCase()) || machineByNumber.get(machineCode.toUpperCase());
      if (!machine) {
        fail(rowNum, `Machine '${machineCode}' not found`);
        continue;
      }
      if (machine.status !== 'ACTIVE') {
        fail(rowNum, `Machine '${machineCode}' is not ACTIVE`);
        continue;
      }
      // Prompt #16 — the target's division (inherited from its machine) must
      // be one the caller may write to; reported per row like other import errors.
      if (
        !isUnrestricted(allowedDivisionIds) &&
        machine.divisionId &&
        !(allowedDivisionIds as string[]).includes(machine.divisionId)
      ) {
        fail(rowNum, 'You do not have access to this division.');
        continue;
      }

      // ── Anchor column 2 — Shift. Absent/blank means the strict key cannot
      //    be built at all, which is what opens the relaxed [Machine + Item] path.
      const shiftCode = read(data, IMPORT_COLUMN_ALIASES.shiftCode);
      let shift: Shift | undefined;
      if (shiftCode) {
        shift = shiftByCode.get(shiftCode.toUpperCase());
        if (!shift) {
          fail(rowNum, `Shift '${shiftCode}' not found`);
          continue;
        }
      }

      // ── UOM — resolved (and rule-checked) only when the sheet supplies one ─
      const uomCode = read(data, IMPORT_COLUMN_ALIASES.uomCode);
      let uom: Uom | undefined;
      if (uomCode) {
        uom = uomByCode.get(uomCode.toUpperCase());
        if (!uom) {
          fail(rowNum, `UOM '${uomCode}' not found`);
          continue;
        }
        if (!PRODUCTION_UOM_CODES.includes(String(uom.code).toUpperCase())) {
          fail(rowNum, `UOM '${uomCode}' is not a supported production unit (KG, PCS, METER)`);
          continue;
        }
      }

      // ── Anchor column 3 — Item. Blank ⇒ the generic (null-item) target ────
      const itemCode = read(data, IMPORT_COLUMN_ALIASES.itemCode);
      let itemId: string | null = null;
      if (itemCode) {
        const item = itemByCode.get(itemCode.toUpperCase());
        if (!item) {
          fail(rowNum, `Item '${itemCode}' not found`);
          continue;
        }
        if (!item.isActive) {
          fail(rowNum, `Item '${itemCode}' is not ACTIVE`);
          continue;
        }
        itemId = item.id;
      }

      // ── Data columns. An empty cell (or an excluded column) is NOT read, so
      //    it never reaches the patch and the stored value survives untouched.
      const targetQtyStr = read(data, IMPORT_COLUMN_ALIASES.standardTarget);
      const hoursStr = read(data, IMPORT_COLUMN_ALIASES.standardHours);
      const effectiveFrom = read(data, IMPORT_COLUMN_ALIASES.effectiveFrom);
      const effectiveTo = read(data, IMPORT_COLUMN_ALIASES.effectiveTo);
      const statusStr = read(data, IMPORT_COLUMN_ALIASES.status);
      const remarks = read(data, IMPORT_COLUMN_ALIASES.remarks);

      // Validate whatever IS present — a supplied-but-wrong value is always an
      // error, it is never silently dropped just because other columns are blank.
      if (targetQtyStr && !(Number(targetQtyStr) > 0)) {
        fail(rowNum, 'Standard Target must be greater than 0');
        continue;
      }
      if (hoursStr) {
        const hours = Number(hoursStr);
        if (!(hours > 0) || hours > 24) {
          fail(rowNum, 'Standard Hours must be between 0.01 and 24');
          continue;
        }
      }
      if (effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
        fail(rowNum, `Effective From '${effectiveFrom}' must be YYYY-MM-DD`);
        continue;
      }
      if (effectiveTo && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)) {
        fail(rowNum, `Effective To '${effectiveTo}' must be YYYY-MM-DD`);
        continue;
      }
      let status: MachineTargetStatus | undefined;
      if (statusStr) {
        const normalised = statusStr.toUpperCase();
        if (normalised !== 'ACTIVE' && normalised !== 'INACTIVE') {
          fail(rowNum, `Invalid status '${statusStr}' (use ACTIVE or INACTIVE)`);
          continue;
        }
        status = normalised as MachineTargetStatus;
      }

      // ── 1. Composite anchor lookup: [Machine + Shift + Item] ──────────────
      let match: MachineTarget | undefined;
      if (shift) {
        const anchored = byAnchor.get(anchorKey(machine.id, shift.id, itemId));
        if (anchored && anchored.length > 0) match = pickCurrentTarget(anchored, today);
      }

      // Everything a NEW row needs. Blank here means "this line cannot insert".
      const insertGaps: string[] = [];
      if (!shift) insertGaps.push('Shift Code');
      if (!uom) insertGaps.push('UOM Code');
      if (!targetQtyStr) insertGaps.push('Standard Target');
      if (!hoursStr) insertGaps.push('Standard Hours');
      if (!effectiveFrom) insertGaps.push('Effective From');
      const canInsert = insertGaps.length === 0;

      // ── 3. Relaxed anchor — ONLY when the strict key missed AND this line
      //    cannot stand alone as an insert, and ONLY if the fallback is unique.
      if (!match && !canInsert) {
        const candidates = relaxationCandidates(byMachineItem.get(machineItemKey(machine.id, itemId)));
        if (candidates.length === 1) {
          match = candidates[0];
        } else if (candidates.length === 0) {
          fail(
            rowNum,
            `No existing target matches Machine '${machineCode}' + Shift '${shiftCode || '—'}' + Item '${itemCode || '—'}', ` +
              `and this line cannot create one (${insertGaps.join(', ')} blank/absent)`,
          );
          continue;
        } else {
          const shiftsHit = candidates.map((c) => shiftLabel.get(c.shiftId) ?? c.shiftId).join(', ');
          fail(
            rowNum,
            `Ambiguous anchor: ${candidates.length} targets already exist for Machine '${machineCode}' + ` +
              `Item '${itemCode || '—'}' (shifts ${shiftsHit}). Add Standard Target, Standard Hours and ` +
              `Effective From to insert a new row instead.`,
          );
          continue;
        }
      }

      // ── 2. Partial column update (zero-overwrite safety) ──────────────────
      if (match) {
        const patch: MachineTargetPatch = {};
        const changed: string[] = [];
        const set = <K extends keyof MachineTargetPatch>(field: K, value: MachineTargetPatch[K], label: string): void => {
          patch[field] = value;
          changed.push(label);
        };

        // Only columns that carry data AND actually differ are written — a cell
        // identical to what is stored (or blank/absent) never enters the UPDATE.
        // `shiftId` is an anchor component, so on a strict hit this is a no-op;
        // on a relaxed hit it is exactly the "re-point this target's shift" case.
        if (shift && shift.id !== match.shiftId) set('shiftId', shift.id, 'Shift Code');
        if (uom && uom.id !== match.uomId) set('uomId', uom.id, 'UOM Code');
        if (itemCode && itemId !== match.itemId) set('itemId', itemId, 'Item Code');
        if (targetQtyStr && Number(targetQtyStr) !== Number(match.targetQuantity)) {
          set('targetQuantity', String(Number(targetQtyStr)), 'Standard Target');
        }
        if (hoursStr && Number(hoursStr) !== Number(match.standardHours)) {
          set('standardHours', String(Number(hoursStr)), 'Standard Hours');
        }
        if (effectiveFrom && effectiveFrom !== match.effectiveFrom) set('effectiveFrom', effectiveFrom, 'Effective From');
        if (effectiveTo && effectiveTo !== match.effectiveTo) set('effectiveTo', effectiveTo, 'Effective To');
        if (status && status !== match.status) set('status', status, 'Status');
        if (remarks && remarks !== match.remarks) set('remarks', remarks, 'Remarks');
        patch.updatedBy = userId ?? null;

        // Validate the MERGED row: a partial write must not manufacture an
        // impossible window by pairing a new `from` with a stale `to`.
        const finalFrom = patch.effectiveFrom ?? match.effectiveFrom;
        const finalTo = patch.effectiveTo ?? match.effectiveTo;
        if (finalTo && !(finalTo > finalFrom)) {
          fail(rowNum, 'Effective To must be after Effective From');
          continue;
        }

        // Window integrity only matters when the window may have moved.
        const touchesWindow = ['shiftId', 'uomId', 'itemId', 'effectiveFrom', 'effectiveTo', 'status'].some(
          (field) => field in patch,
        );
        if (touchesWindow) {
          try {
            await this.assertNoOverlap(
              companyId,
              machine.id,
              patch.shiftId ?? match.shiftId,
              patch.itemId !== undefined ? patch.itemId : match.itemId,
              patch.uomId ?? match.uomId,
              finalFrom,
              finalTo,
              match.id,
            );
          } catch (err: any) {
            fail(rowNum, err?.message ?? `Overlapping ACTIVE target already exists (${match.id})`);
            continue;
          }
        }

        const writeKey = `u:${match.id}`;
        if (claimedWrites.has(writeKey)) {
          fail(rowNum, 'Duplicate row: another line in this file already writes the same Machine + Shift + Item target.');
          continue;
        }
        claimedWrites.add(writeKey);

        toUpdate.push({ target: match, patch, changed, rowNum });
        continue;
      }

      // ── Insert path — strict anchor missed AND the line carries everything ─
      if (!shift || !uom) {
        fail(rowNum, `Cannot create a new target — ${insertGaps.join(', ')} blank/absent`);
        continue;
      }
      try {
        await this.assertNoOverlap(
          companyId,
          machine.id,
          shift.id,
          itemId,
          uom.id,
          effectiveFrom,
          effectiveTo || null,
        );
      } catch (err: any) {
        fail(rowNum, err?.message ?? 'Overlapping ACTIVE target already exists');
        continue;
      }

      const newKey = `i:${anchorKey(machine.id, shift.id, itemId)}`;
      if (claimedWrites.has(newKey)) {
        fail(rowNum, 'Duplicate row: another line in this file already writes the same Machine + Shift + Item target.');
        continue;
      }
      claimedWrites.add(newKey);

      toInsert.push({
        entity: {
          companyId,
          machineId: machine.id,
          shiftId: shift.id,
          itemId: itemId,
          uomId: uom.id,
          standardHours: String(Number(hoursStr)),
          targetQuantity: String(Number(targetQtyStr)),
          effectiveFrom,
          effectiveTo: effectiveTo || null,
          status: status ?? MachineTargetStatus.ACTIVE,
          remarks: remarks || null,
          createdBy: userId ?? null,
          updatedBy: userId ?? null,
        },
        rowNum,
      });
    }

    // ── Single transactional write block (all-or-nothing) ────────────────────
    if (toUpdate.length > 0 || toInsert.length > 0) {
      await this.targetRepo.manager.transaction(async (em) => {
        const repo = em.getRepository(MachineTarget);

        // Updates first: every patch carries only the columns that had data, so
        // untouched fields are never part of the UPDATE statement at all.
        for (const update of toUpdate) {
          await repo.update({ id: update.target.id }, update.patch);
        }

        if (toInsert.length > 0) {
          await repo.save(toInsert.map((row) => repo.create(row.entity)));
        }
      });
    }

    for (const update of toUpdate) {
      results.push({
        row: update.rowNum,
        status: 'imported',
        action: 'updated',
        message: update.changed.length > 0
          ? `Updated existing target (${update.changed.join(', ')})`
          : 'Matched existing target — nothing changed, every column retained',
      });
    }
    for (const created of toInsert) {
      results.push({ row: created.rowNum, status: 'imported', action: 'created', message: 'Created successfully' });
    }

    results.sort((a, b) => a.row - b.row);

    return {
      totalRows: rows.length - 1,
      imported: toInsert.length + toUpdate.length,
      created: toInsert.length,
      updated: toUpdate.length,
      failed: results.filter((r) => r.status === 'error').length,
      results,
    };
  }

  private async findEffectiveCandidates(
    companyId: string,
    machineId: string,
    shiftId: string,
    productionDate: string,
    uomId?: string,
    itemId?: string | null,
  ): Promise<MachineTarget[]> {
    const qb = this.targetRepo
      .createQueryBuilder('mt')
      .leftJoinAndSelect('mt.uom', 'uom')
      .leftJoinAndSelect('mt.shift', 'shift')
      .where('mt.companyId = :companyId', { companyId })
      .andWhere('mt.machineId = :machineId', { machineId })
      .andWhere('mt.shiftId = :shiftId', { shiftId });
    if (uomId) qb.andWhere('mt.uomId = :uomId', { uomId });
    if (itemId !== undefined) {
      if (itemId === null) {
        qb.andWhere('mt.itemId IS NULL');
      } else {
        qb.andWhere('mt.itemId = :itemId', { itemId });
      }
    }
    qb.andWhere('mt.status = :status', { status: MachineTargetStatus.ACTIVE })
      .andWhere('mt.isActive = true')
      .andWhere('mt.effectiveFrom <= :date', { date: productionDate })
      .andWhere('(mt.effectiveTo >= :date2 OR mt.effectiveTo IS NULL)', { date2: productionDate })
      .orderBy('mt.effectiveFrom', 'DESC')
      .take(2);
    return qb.getMany();
  }
}
