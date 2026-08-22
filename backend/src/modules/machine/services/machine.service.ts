import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import { Machine, MachineCriticality, MachineStatus, ProductionEntry } from '../../production/entities';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import {
  CreateMachineDto,
  UpdateMachineDto,
  MachineQueryDto,
} from '../dto';

const UUID_LOOSE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_IN_TEXT = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export function qrPayloadFor(machineId: string): string {
  return `/production/machines/${machineId}`;
}

interface HierarchyInput {
  divisionId?: string | null;
  sectionId?: string | null;
  departmentId?: string | null;
}

@Injectable()
export class MachineService {
  constructor(
    @InjectRepository(Machine)
    private readonly machineRepo: Repository<Machine>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
    @InjectRepository(ProductionEntry)
    private readonly productionEntryRepo: Repository<ProductionEntry>,
    private readonly configService: ConfigService,
  ) {}

  async findAll(
    companyId: string,
    filters: MachineQueryDto,
  ): Promise<{ data: Machine[]; total: number; page: number; limit: number }> {
    const {
      page = 1,
      limit = 20,
      divisionId,
      sectionId,
      departmentId,
      status,
      machineType,
      criticality,
      search,
      sortBy,
      sortDir = 'ASC',
    } = filters || {};

    const qb = this.machineRepo
      .createQueryBuilder('m')
      .leftJoinAndSelect('m.division', 'division')
      .leftJoinAndSelect('m.section', 'section')
      .leftJoinAndSelect('m.department', 'department')
      .where('m.companyId = :companyId', { companyId })
      .andWhere('m.isActive = true');

    if (divisionId) qb.andWhere('m.divisionId = :divisionId', { divisionId });
    if (sectionId) qb.andWhere('m.sectionId = :sectionId', { sectionId });
    if (departmentId) qb.andWhere('m.departmentId = :departmentId', { departmentId });
    if (status) qb.andWhere('m.status = :status', { status });
    if (criticality) qb.andWhere('m.criticality = :criticality', { criticality });
    if (machineType) qb.andWhere('m.machineType ILIKE :machineType', { machineType: `%${machineType}%` });
    if (search) {
      qb.andWhere(
        '(m.machineCode ILIKE :search OR m.name ILIKE :search OR m.machineNumber ILIKE :search OR m.serialNumber ILIKE :search OR m.manufacturer ILIKE :search OR m.machineId ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const sortMap: Record<string, string> = {
      machineCode: 'm.machineCode',
      name: 'm.name',
      machineType: 'm.machineType',
      location: 'm.location',
      criticality: 'm.criticality',
      status: 'm.status',
      createdAt: 'm.createdAt',
      department: 'department.name',
    };
    const orderColumn = sortMap[sortBy ?? 'machineCode'] ?? 'm.machineCode';
    qb.orderBy(orderColumn, sortDir === 'DESC' ? 'DESC' : 'ASC');

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Machine> {
    const machine = await this.machineRepo.findOne({
      where: { id, companyId, isActive: true },
      relations: ['company', 'division', 'section', 'department'],
    });
    if (!machine) throw new NotFoundException(`Machine '${id}' not found`);
    return machine;
  }

  async create(dto: CreateMachineDto, companyId: string, userId?: string): Promise<Machine> {
    const code = dto.machineCode.trim();
    this.validateDates(dto.installationDate ?? null, dto.warrantyExpiryDate ?? null);
    const hierarchy = await this.resolveHierarchy(companyId, {
      divisionId: dto.divisionId ?? null,
      sectionId: dto.sectionId ?? null,
      departmentId: dto.departmentId ?? null,
    });
    await this.assertCodeAvailable(companyId, code, hierarchy.departmentId);
    if (dto.serialNumber?.trim()) {
      await this.assertSerialAvailable(companyId, dto.serialNumber.trim());
    }

    const machine = this.machineRepo.create({
      companyId,
      machineCode: code,
      name: dto.name.trim(),
      description: dto.description ?? null,
      divisionId: hierarchy.divisionId,
      sectionId: hierarchy.sectionId,
      departmentId: hierarchy.departmentId,
      machineNumber: dto.machineNumber?.trim() || null,
      machineType: dto.machineType?.trim() || null,
      location: dto.location?.trim() || null,
      model: dto.model?.trim() || null,
      manufacturer: dto.manufacturer?.trim() || null,
      serialNumber: dto.serialNumber?.trim() || null,
      capacity: dto.capacity?.trim() || null,
      powerRating: dto.powerRating?.trim() || null,
      installationDate: dto.installationDate || null,
      warrantyExpiryDate: dto.warrantyExpiryDate || null,
      criticality: dto.criticality ?? MachineCriticality.MEDIUM,
      status: MachineStatus.ACTIVE,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });

    try {
      const saved = await this.machineRepo.save(machine);
      saved.qrPayload = qrPayloadFor(saved.id);
      // machine_id is assigned by the DB trigger on insert; fetch it so the
      // response carries the system-generated business identifier.
      if (!saved.machineId) {
        const fresh = await this.machineRepo.findOneBy({ id: saved.id });
        if (fresh?.machineId) saved.machineId = fresh.machineId;
      }
      return await this.machineRepo.save(saved);
    } catch (e: any) {
      throw this.mapPgError(e, code);
    }
  }

  async update(id: string, dto: UpdateMachineDto, companyId: string, userId?: string): Promise<Machine> {
    const machine = await this.findOne(id, companyId);

    this.validateDates(
      dto.installationDate !== undefined ? dto.installationDate ?? null : machine.installationDate,
      dto.warrantyExpiryDate !== undefined ? dto.warrantyExpiryDate ?? null : machine.warrantyExpiryDate,
    );
    const hierarchy = await this.resolveHierarchy(companyId, {
      divisionId: dto.divisionId !== undefined ? dto.divisionId : machine.divisionId,
      sectionId: dto.sectionId !== undefined ? dto.sectionId : machine.sectionId,
      departmentId: dto.departmentId !== undefined ? dto.departmentId : machine.departmentId,
    });

    if (dto.machineCode !== undefined && dto.machineCode.trim().toUpperCase() !== machine.machineCode.toUpperCase()) {
      await this.assertCodeAvailable(companyId, dto.machineCode.trim(), hierarchy.departmentId, id);
    }
    if (dto.serialNumber !== undefined && dto.serialNumber !== null && dto.serialNumber.trim()) {
      await this.assertSerialAvailable(companyId, dto.serialNumber.trim(), id);
    }

    if (dto.machineCode !== undefined) machine.machineCode = dto.machineCode.trim();
    if (dto.name !== undefined) machine.name = dto.name.trim();
    if (dto.description !== undefined) machine.description = dto.description;
    machine.divisionId = hierarchy.divisionId;
    machine.sectionId = hierarchy.sectionId;
    machine.departmentId = hierarchy.departmentId;
    if (dto.machineNumber !== undefined) machine.machineNumber = dto.machineNumber?.trim() || null;
    if (dto.machineType !== undefined) machine.machineType = dto.machineType?.trim() || null;
    if (dto.location !== undefined) machine.location = dto.location?.trim() || null;
    if (dto.model !== undefined) machine.model = dto.model?.trim() || null;
    if (dto.manufacturer !== undefined) machine.manufacturer = dto.manufacturer?.trim() || null;
    if (dto.serialNumber !== undefined) machine.serialNumber = dto.serialNumber?.trim() || null;
    if (dto.capacity !== undefined) machine.capacity = dto.capacity?.trim() || null;
    if (dto.powerRating !== undefined) machine.powerRating = dto.powerRating?.trim() || null;
    if (dto.installationDate !== undefined) machine.installationDate = dto.installationDate || null;
    if (dto.warrantyExpiryDate !== undefined) machine.warrantyExpiryDate = dto.warrantyExpiryDate || null;
    if (dto.criticality !== undefined) machine.criticality = dto.criticality;
    machine.updatedBy = userId ?? null;
    machine.qrPayload = qrPayloadFor(machine.id);

    try {
      return await this.machineRepo.save(machine);
    } catch (e: any) {
      throw this.mapPgError(e, machine.machineCode);
    }
  }

  async changeStatus(id: string, status: MachineStatus, companyId: string, userId?: string): Promise<Machine> {
    const machine = await this.findOne(id, companyId);
    machine.status = status;
    machine.updatedBy = userId ?? null;
    return this.machineRepo.save(machine);
  }

  async remove(id: string, companyId: string, userId?: string): Promise<void> {
    const machine = await this.findOne(id, companyId);
    // Reference guard: never break transactional history. If production
    // entries reference this machine, require deactivation instead.
    const refs = await this.productionEntryRepo.count({
      where: { machineId: id, isActive: true },
    });
    if (refs > 0) {
      throw new ConflictException(
        `Machine '${machine.machineCode}' is referenced by ${refs} production entr${refs === 1 ? 'y' : 'ies'} and cannot be deleted. Deactivate it instead.`,
      );
    }
    machine.isActive = false;
    machine.status = MachineStatus.INACTIVE;
    machine.updatedBy = userId ?? null;
    await this.machineRepo.save(machine);
  }

  async getQr(id: string, companyId: string): Promise<{ payload: string; url: string; dataUrl: string; machine: Machine }> {
    const machine = await this.findOne(id, companyId);
    const payload = machine.qrPayload ?? qrPayloadFor(machine.id);
    const base = (this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000').replace(/\/+$/, '');
    const url = payload.startsWith('http') ? payload : `${base}${payload}`;
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#000000ff', light: '#ffffffff' },
    });
    return { payload, url, dataUrl, machine };
  }

  async resolveByCode(code: string, companyId: string): Promise<Machine> {
    let value = (code ?? '').trim();
    if (value.toLowerCase().startsWith('machine:')) {
      value = value.slice('machine:'.length).trim();
    }
    // Accept a full scanned URL (e.g. https://host/production/machines/<uuid>?x=1)
    // by pulling out the first embedded UUID.
    let candidateId: string | null = null;
    if (UUID_LOOSE.test(value)) {
      candidateId = value.toLowerCase();
    } else {
      const m = value.match(UUID_IN_TEXT);
      if (m) candidateId = m[1].toLowerCase();
    }

    let machine: Machine | null = null;
    if (candidateId) {
      machine = await this.machineRepo.findOne({
        where: { id: candidateId, companyId, isActive: true },
        relations: ['company', 'division', 'section', 'department'],
      });
    }
    if (!machine) {
      machine = await this.machineRepo.findOne({
        where: { machineCode: value, companyId, isActive: true },
        relations: ['company', 'division', 'section', 'department'],
      });
      // System-generated Machine ID lookup (e.g. MCH001) – case-insensitive.
      if (!machine && /^mch\d{3}$/i.test(value)) {
        const qb = this.machineRepo
          .createQueryBuilder('m')
          .leftJoinAndSelect('m.company', 'company')
          .leftJoinAndSelect('m.division', 'division')
          .leftJoinAndSelect('m.section', 'section')
          .leftJoinAndSelect('m.department', 'department')
          .where('LOWER(m.machineId) = LOWER(:mid)', { mid: value })
          .andWhere('m.companyId = :companyId', { companyId })
          .andWhere('m.isActive = true');
        machine = await qb.getOne();
      }
      if (!machine) {
        // Case-insensitive fallback for scanned codes typed in different case
        const candidates = await this.machineRepo.find({
          where: { companyId, isActive: true },
          relations: ['company', 'division', 'section', 'department'],
        });
        machine = candidates.find((m) => m.machineCode.toUpperCase() === value.toUpperCase()) ?? null;
      }
    }
    if (!machine) throw new NotFoundException(`No active machine resolves to QR/code '${code}'`);
    return machine;
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private validateDates(installationDate: string | null, warrantyExpiryDate: string | null): void {
    if (installationDate && warrantyExpiryDate && warrantyExpiryDate < installationDate) {
      throw new BadRequestException('warrantyExpiryDate must be on or after installationDate');
    }
  }

  /**
   * Machine-code uniqueness follows the business identity: codes may repeat
   * across departments (e.g. SP-01 in Spoke, Spiral and PVC), so scope the
   * check to (company, department) among ACTIVE rows. Departmentless machines
   * share one synthetic bucket per company (mirrors uq_machines_company_dept_code_active).
   */
  private async assertCodeAvailable(
    companyId: string,
    code: string,
    departmentId?: string | null,
    excludeId?: string,
  ): Promise<void> {
    const deptBucket = departmentId ?? ZERO_UUID;
    const qb = this.machineRepo
      .createQueryBuilder('m')
      .where('m.companyId = :companyId', { companyId })
      .andWhere('m.isActive = true')
      .andWhere('LOWER(m.machineCode) = LOWER(:code)', { code });
    // NOTE: avoid `property::text` casts here – TypeORM's parameter parser
    // treats `:text` as a bind parameter and leaves the column name raw,
    // producing "column m.departmentid does not exist".
    if (departmentId) {
      qb.andWhere('m.departmentId = :dept', { dept: deptBucket });
    } else {
      qb.andWhere('m.departmentId IS NULL');
    }
    if (excludeId) qb.andWhere('m.id != :excludeId', { excludeId });
    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        `Machine '${code}' already exists in this company for this department`,
      );
    }
  }

  private async assertSerialAvailable(companyId: string, serial: string, excludeId?: string): Promise<void> {
    const qb = this.machineRepo
      .createQueryBuilder('m')
      .where('m.companyId = :companyId', { companyId })
      .andWhere('m.isActive = true')
      .andWhere('LOWER(m.serialNumber) = LOWER(:serial)', { serial });
    if (excludeId) qb.andWhere('m.id != :excludeId', { excludeId });
    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(`Serial number '${serial}' is already assigned to another machine`);
    }
  }

  /**
   * Validates the division → section → department chain and returns the
   * effective hierarchy. When a department is provided, its own parents are
   * inherited unless explicitly overridden; explicit values must match the
   * department's chain.
   */
  private async resolveHierarchy(
    companyId: string,
    input: HierarchyInput,
  ): Promise<{ divisionId: string | null; sectionId: string | null; departmentId: string | null }> {
    let divisionId = input.divisionId ?? null;
    let sectionId = input.sectionId ?? null;
    const departmentId = input.departmentId ?? null;

    if (departmentId) {
      const dept = await this.departmentRepo.findOne({ where: { id: departmentId, companyId } });
      if (!dept) throw new BadRequestException(`Department '${departmentId}' not found in this company`);

      if (divisionId && dept.divisionId && divisionId !== dept.divisionId) {
        throw new BadRequestException('Division does not match the selected department hierarchy');
      }
      if (sectionId && dept.sectionId && sectionId !== dept.sectionId) {
        throw new BadRequestException('Section does not match the selected department hierarchy');
      }
      divisionId = divisionId ?? dept.divisionId ?? null;
      sectionId = sectionId ?? dept.sectionId ?? null;
    }

    if (divisionId) {
      const div = await this.divisionRepo.findOne({ where: { id: divisionId, companyId } });
      if (!div) throw new BadRequestException(`Division '${divisionId}' not found in this company`);
    }
    if (sectionId) {
      const sec = await this.sectionRepo.findOne({ where: { id: sectionId, companyId } });
      if (!sec) throw new BadRequestException(`Section '${sectionId}' not found in this company`);
      if (divisionId && sec.divisionId && sec.divisionId !== divisionId) {
        throw new BadRequestException('Section does not belong to the selected division');
      }
    }

    return { divisionId, sectionId, departmentId };
  }

  private mapPgError(e: any, code: string): Error {
    if (e?.code === '23505') {
      const detail: string = e?.detail ?? '';
      if (detail.includes('serial_number')) {
        return new ConflictException('Serial number is already assigned to another machine');
      }
      return new ConflictException(`Machine '${code}' already exists in this company for this department`);
    }
    return e;
  }
}
