import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MachineTarget, MachineTargetStatus } from '../entities/machine-target.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Shift } from '../../production/entities/shift.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Item } from '../../item/entities/item.entity';
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

  // ─── Queries ────────────────────────────────────────────────────────────────

  async findAll(
    companyId: string,
    filters: MachineTargetQueryDto,
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

  async findOne(id: string, companyId: string): Promise<MachineTarget> {
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
    return target;
  }

  // ─── Mutations ──────────────────────────────────────────────────────────────

  async create(dto: CreateMachineTargetDto, companyId: string, userId?: string): Promise<MachineTarget> {
    const machine = await this.assertRefsValid(companyId, dto.machineId, dto.shiftId, dto.uomId, dto.itemId);
    this.validateDates(dto.effectiveFrom, dto.effectiveTo ?? null);
    this.assertOrgConsistent(machine, dto);

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
      return await this.findOne(saved.id, companyId);
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

  async update(id: string, dto: UpdateMachineTargetDto, companyId: string, userId?: string): Promise<MachineTarget> {
    const existing = await this.findOne(id, companyId);

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
      return await this.findOne(id, companyId);
    } catch (e: any) {
      if (String(e?.code) === '23505') {
        throw new ConflictException(
          'An open-ended ACTIVE target already exists for this machine/shift/Item/UOM combination',
        );
      }
      throw e;
    }
  }

  async changeStatus(id: string, status: MachineTargetStatus, companyId: string, userId?: string): Promise<MachineTarget> {
    const target = await this.findOne(id, companyId);
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
    return this.findOne(id, companyId);
  }

  /** Soft delete per ERP convention — historical snapshots keep their FK alive. */
  async remove(id: string, companyId: string, userId?: string): Promise<void> {
    const target = await this.findOne(id, companyId);
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
  async resolve(query: ResolveMachineTargetQueryDto, companyId: string): Promise<any> {
    const machine = await this.machineRepo.findOne({ where: { id: query.machineId, companyId } });
    if (!machine) throw new NotFoundException(`Machine '${query.machineId}' not found in this company`);

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
    let candidates = await this.findEffectiveCandidates(companyId, machineId, shiftId, productionDate, uomId, itemId);
    if (candidates.length > 1) {
      throw new ConflictException(
        `Ambiguous target configuration for machine/shift on ${productionDate}: ${candidates.map((c) => c.id).join(', ')}. Close or deactivate duplicate periods, or pass a uomId/itemId to disambiguate.`,
      );
    }
    if (candidates.length === 1) {
      return { target: candidates[0], usedGeneralFallback: false };
    }

    if (!allowGeneralFallback) return { target: null, usedGeneralFallback: false };

    const generalShift = await this.shiftRepo.findOne({
      where: { companyId, shiftCode: GENERAL_SHIFT_CODE },
    });
    if (!generalShift || generalShift.id === shiftId) {
      return { target: null, usedGeneralFallback: false };
    }
    candidates = await this.findEffectiveCandidates(companyId, machineId, generalShift.id, productionDate, uomId, itemId);
    if (candidates.length > 1) {
      throw new ConflictException(
        `Ambiguous GENERAL-shift target configuration for machine on ${productionDate}: ${candidates.map((c) => c.id).join(', ')}.`,
      );
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
   * Bulk import machine targets from parsed CSV rows.
   * Uses the same business-key resolution pattern (Machine Code → Machine ID, etc.).
   * All valid records are inserted in a single transaction (all-or-nothing).
   */
  async importCsv(
    companyId: string,
    userId: string | undefined,
    fileBuffer: Buffer,
  ): Promise<{
    totalRows: number;
    imported: number;
    failed: number;
    results: Array<{ row: number; status: 'imported' | 'error'; message: string }>;
  }> {
    const content = fileBuffer.toString('utf-8').replace(/^\uFEFF/, '');
    const rows = MachineTargetService.parseCsv(content);
    if (rows.length < 2) {
      throw new BadRequestException('CSV file is empty or has no data rows');
    }

    const header = rows[0].map((h) => h.trim());
    const headerMap: Record<string, number> = {};
    header.forEach((h, i) => { headerMap[h.toLowerCase().replace(/[\s_-]+/g, '')] = i; });

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
    const uomByCode = new Map(uoms.map((u) => [u.code.toUpperCase(), u]));
    const itemByCode = new Map(items.map((i) => [i.itemCode.toUpperCase(), i]));

    const results: Array<{ row: number; status: 'imported' | 'error'; message: string }> = [];
    let imported = 0;

    const get = (data: string[], field: string): string => {
      const idx = headerMap[field];
      return idx !== undefined ? (data[idx] ?? '').trim() : '';
    };

    const toInsert: Array<Partial<MachineTarget>> = [];

    for (let idx = 1; idx < rows.length; idx++) {
      const data = rows[idx];
      const rowNum = idx + 1;
      const errors: string[] = [];

      // Machine Code resolution
      const machineCode = get(data, 'machinecode') || get(data, 'machinenumber');
      if (!machineCode) {
        results.push({ row: rowNum, status: 'error', message: 'Machine Code / Machine Number is required' });
        continue;
      }
      let machine = machineByCode.get(machineCode.toUpperCase()) || machineByNumber.get(machineCode.toUpperCase());
      if (!machine) {
        results.push({ row: rowNum, status: 'error', message: `Machine '${machineCode}' not found` });
        continue;
      }
      if (machine.status !== 'ACTIVE') {
        results.push({ row: rowNum, status: 'error', message: `Machine '${machineCode}' is not ACTIVE` });
        continue;
      }

      // Shift Code
      const shiftCode = get(data, 'shiftcode');
      if (!shiftCode) {
        results.push({ row: rowNum, status: 'error', message: 'Shift Code is required' });
        continue;
      }
      const shift = shiftByCode.get(shiftCode.toUpperCase());
      if (!shift) {
        results.push({ row: rowNum, status: 'error', message: `Shift '${shiftCode}' not found` });
        continue;
      }

      // UOM Code
      const uomCode = get(data, 'uomcode') || get(data, 'uom');
      if (!uomCode) {
        results.push({ row: rowNum, status: 'error', message: 'UOM Code is required' });
        continue;
      }
      const uom = uomByCode.get(uomCode.toUpperCase());
      if (!uom) {
        results.push({ row: rowNum, status: 'error', message: `UOM '${uomCode}' not found` });
        continue;
      }
      if (!PRODUCTION_UOM_CODES.includes(String(uom.code).toUpperCase())) {
        results.push({ row: rowNum, status: 'error', message: `UOM '${uomCode}' is not a supported production unit (KG, PCS, METER)` });
        continue;
      }

      // Item Code (optional)
      const itemCode = get(data, 'itemcode');
      let itemId: string | null = null;
      if (itemCode) {
        const item = itemByCode.get(itemCode.toUpperCase());
        if (!item) {
          results.push({ row: rowNum, status: 'error', message: `Item '${itemCode}' not found` });
          continue;
        }
        if (!item.isActive) {
          results.push({ row: rowNum, status: 'error', message: `Item '${itemCode}' is not ACTIVE` });
          continue;
        }
        itemId = item.id;
      }

      // Standard Target
      const targetQtyStr = get(data, 'standardtarget') || get(data, 'targetquantity') || get(data, 'target');
      const targetQty = Number(targetQtyStr);
      if (!targetQtyStr || !(targetQty > 0)) {
        results.push({ row: rowNum, status: 'error', message: 'Standard Target must be greater than 0' });
        continue;
      }

      // Standard Hours
      const hoursStr = get(data, 'standardhours') || get(data, 'hours');
      const hours = Number(hoursStr);
      if (!hoursStr || !(hours > 0) || hours > 24) {
        results.push({ row: rowNum, status: 'error', message: 'Standard Hours must be between 0.01 and 24' });
        continue;
      }

      // Effective From
      const effectiveFrom = get(data, 'effectivefrom') || get(data, 'fromdate');
      if (!effectiveFrom) {
        results.push({ row: rowNum, status: 'error', message: 'Effective From is required (YYYY-MM-DD)' });
        continue;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
        results.push({ row: rowNum, status: 'error', message: `Effective From '${effectiveFrom}' must be YYYY-MM-DD` });
        continue;
      }

      // Effective To (optional)
      const effectiveTo = get(data, 'effectiveto') || get(data, 'todate');
      if (effectiveTo && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)) {
        results.push({ row: rowNum, status: 'error', message: `Effective To '${effectiveTo}' must be YYYY-MM-DD` });
        continue;
      }
      if (effectiveTo && !(effectiveTo > effectiveFrom)) {
        results.push({ row: rowNum, status: 'error', message: 'Effective To must be after Effective From' });
        continue;
      }

      // Status (optional, defaults to ACTIVE)
      const status = (get(data, 'status') || 'ACTIVE').toUpperCase();
      if (status !== 'ACTIVE' && status !== 'INACTIVE') {
        results.push({ row: rowNum, status: 'error', message: `Invalid status '${status}' (use ACTIVE or INACTIVE)` });
        continue;
      }

      // Remarks
      const remarks = get(data, 'remarks') || null;

      if (errors.length > 0) {
        results.push({ row: rowNum, status: 'error', message: errors.join('; ') });
        continue;
      }

      // Build entity for overlap check
      const overlapQb = this.targetRepo.createQueryBuilder('mt')
        .where('mt.companyId = :companyId', { companyId })
        .andWhere('mt.machineId = :machineId', { machineId: machine.id })
        .andWhere('mt.shiftId = :shiftId', { shiftId: shift.id })
        .andWhere('mt.uomId = :uomId', { uomId: uom.id })
        .andWhere('mt.status = :status', { status: MachineTargetStatus.ACTIVE })
        .andWhere('mt.isActive = true')
        .andWhere('(mt.effectiveFrom <= :rangeTo OR :rangeToIsNull)', {
          rangeTo: effectiveTo || null,
          rangeToIsNull: !effectiveTo,
        })
        .andWhere('(mt.effectiveTo >= :rangeFrom OR mt.effectiveTo IS NULL)', { rangeFrom: effectiveFrom });
      if (itemId) overlapQb.andWhere('mt.itemId = :itemId', { itemId });
      else overlapQb.andWhere('mt.itemId IS NULL');

      const conflict = await overlapQb.getOne();
      if (conflict) {
        results.push({ row: rowNum, status: 'error', message: `Overlapping ACTIVE target exists (${conflict.id}: ${conflict.effectiveFrom} → ${conflict.effectiveTo ?? 'open'})` });
        continue;
      }

      toInsert.push({
        companyId,
        machineId: machine.id,
        shiftId: shift.id,
        itemId: itemId,
        uomId: uom.id,
        standardHours: String(hours),
        targetQuantity: String(targetQty),
        effectiveFrom,
        effectiveTo: effectiveTo || null,
        status: status as MachineTargetStatus,
        remarks,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      });
    }

    // Transactional bulk insert
    if (toInsert.length > 0) {
      const entities = toInsert.map((d) => this.targetRepo.create(d));
      await this.targetRepo.save(entities);
      imported = toInsert.length;
      for (let i = 0; i < toInsert.length; i++) {
        results.push({ row: i + 2, status: 'imported', message: 'Created successfully' });
      }
    }

    return {
      totalRows: rows.length - 1,
      imported,
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
    itemId?: string,
  ): Promise<MachineTarget[]> {
    const qb = this.targetRepo
      .createQueryBuilder('mt')
      .leftJoinAndSelect('mt.uom', 'uom')
      .leftJoinAndSelect('mt.shift', 'shift')
      .where('mt.companyId = :companyId', { companyId })
      .andWhere('mt.machineId = :machineId', { machineId })
      .andWhere('mt.shiftId = :shiftId', { shiftId });
    if (uomId) qb.andWhere('mt.uomId = :uomId', { uomId });
    if (itemId) qb.andWhere('mt.itemId = :itemId', { itemId });
    qb.andWhere('mt.status = :status', { status: MachineTargetStatus.ACTIVE })
      .andWhere('mt.isActive = true')
      .andWhere('mt.effectiveFrom <= :date', { date: productionDate })
      .andWhere('(mt.effectiveTo >= :date2 OR mt.effectiveTo IS NULL)', { date2: productionDate })
      .orderBy('mt.effectiveFrom', 'DESC')
      .take(2);
    return qb.getMany();
  }
}
