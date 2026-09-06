import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Operation, OperationStatus } from '../entities';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { CreateOperationDto, UpdateOperationDto, OperationQueryDto } from '../dto';

interface HierarchyInput {
  divisionId?: string | null;
  sectionId?: string | null;
  departmentId?: string | null;
}

@Injectable()
export class OperationService {
  constructor(
    @InjectRepository(Operation)
    private readonly operationRepo: Repository<Operation>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
  ) {}

  async findAll(
    companyId: string,
    filters: OperationQueryDto,
  ): Promise<{ data: Operation[]; total: number; page: number; limit: number }> {
    const {
      page = 1,
      limit = 20,
      divisionId,
      sectionId,
      departmentId,
      status,
      search,
      sortBy,
      sortDir = 'ASC',
    } = filters || {};

    const qb = this.operationRepo
      .createQueryBuilder('op')
      .leftJoinAndSelect('op.division', 'division')
      .leftJoinAndSelect('op.section', 'section')
      .leftJoinAndSelect('op.department', 'department')
      .where('op.companyId = :companyId', { companyId })
      .andWhere('op.isActive = true');

    if (divisionId) qb.andWhere('op.divisionId = :divisionId', { divisionId });
    if (sectionId) qb.andWhere('op.sectionId = :sectionId', { sectionId });
    if (departmentId) qb.andWhere('op.departmentId = :departmentId', { departmentId });
    if (status) qb.andWhere('op.status = :status', { status });
    if (search) {
      qb.andWhere(
        '(op.operationCode ILIKE :search OR op.operationName ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    const sortMap: Record<string, string> = {
      operationCode: 'op.operationCode',
      operationName: 'op.operationName',
      department: 'department.name',
      status: 'op.status',
      createdAt: 'op.createdAt',
    };
    const orderColumn = sortMap[sortBy ?? 'operationCode'] ?? 'op.operationCode';
    qb.orderBy(orderColumn, sortDir === 'DESC' ? 'DESC' : 'ASC');

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: string, companyId: string): Promise<Operation> {
    const operation = await this.operationRepo.findOne({
      where: { id, companyId, isActive: true },
      relations: ['company', 'division', 'section', 'department'],
    });
    if (!operation) throw new NotFoundException(`Operation '${id}' not found`);
    return operation;
  }

  async create(dto: CreateOperationDto, companyId: string, userId?: string): Promise<Operation> {
    const code = dto.operationCode.trim();
    const hierarchy = await this.resolveHierarchy(companyId, {
      divisionId: dto.divisionId ?? null,
      sectionId: dto.sectionId ?? null,
      departmentId: dto.departmentId ?? null,
    });
    await this.assertCodeAvailable(companyId, code);

    const operation = this.operationRepo.create({
      companyId,
      operationCode: code,
      operationName: dto.operationName.trim(),
      description: dto.description ?? null,
      divisionId: hierarchy.divisionId,
      sectionId: hierarchy.sectionId,
      departmentId: hierarchy.departmentId,
      setupTimeMinutes: dto.setupTimeMinutes ?? 0,
      runTimeMinutes: dto.runTimeMinutes ?? 0,
      queueTimeMinutes: dto.queueTimeMinutes ?? 0,
      waitTimeMinutes: dto.waitTimeMinutes ?? 0,
      status: dto.status ?? OperationStatus.ACTIVE,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });

    try {
      return await this.operationRepo.save(operation);
    } catch (e: any) {
      throw this.mapPgError(e, code);
    }
  }

  async update(id: string, dto: UpdateOperationDto, companyId: string, userId?: string): Promise<Operation> {
    const operation = await this.findOne(id, companyId);

    if (dto.operationCode !== undefined && operation.operationCode !== dto.operationCode.trim()) {
      await this.assertCodeAvailable(companyId, dto.operationCode.trim(), id);
    }

    const hierarchy = await this.resolveHierarchy(companyId, {
      divisionId: dto.divisionId !== undefined ? dto.divisionId : operation.divisionId,
      sectionId: dto.sectionId !== undefined ? dto.sectionId : operation.sectionId,
      departmentId: dto.departmentId !== undefined ? dto.departmentId : operation.departmentId,
    });

    if (dto.operationCode !== undefined) operation.operationCode = dto.operationCode.trim();
    if (dto.operationName !== undefined) operation.operationName = dto.operationName.trim();
    if (dto.description !== undefined) operation.description = dto.description;
    operation.divisionId = hierarchy.divisionId;
    operation.sectionId = hierarchy.sectionId;
    operation.departmentId = hierarchy.departmentId;
    if (dto.setupTimeMinutes !== undefined) operation.setupTimeMinutes = dto.setupTimeMinutes;
    if (dto.runTimeMinutes !== undefined) operation.runTimeMinutes = dto.runTimeMinutes;
    if (dto.queueTimeMinutes !== undefined) operation.queueTimeMinutes = dto.queueTimeMinutes;
    if (dto.waitTimeMinutes !== undefined) operation.waitTimeMinutes = dto.waitTimeMinutes;
    if (dto.status !== undefined) operation.status = dto.status;
    operation.updatedBy = userId ?? null;

    try {
      return await this.operationRepo.save(operation);
    } catch (e: any) {
      throw this.mapPgError(e, operation.operationCode);
    }
  }

  async changeStatus(id: string, status: OperationStatus, companyId: string, userId?: string): Promise<Operation> {
    const operation = await this.findOne(id, companyId);
    operation.status = status;
    operation.updatedBy = userId ?? null;
    return this.operationRepo.save(operation);
  }

  async remove(id: string, companyId: string, userId?: string): Promise<void> {
    const operation = await this.findOne(id, companyId);
    operation.isActive = false;
    operation.status = OperationStatus.INACTIVE;
    operation.updatedBy = userId ?? null;
    await this.operationRepo.save(operation);
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private async assertCodeAvailable(companyId: string, code: string, excludeId?: string): Promise<void> {
    const qb = this.operationRepo
      .createQueryBuilder('op')
      .where('op.companyId = :companyId', { companyId })
      .andWhere('op.isActive = true')
      .andWhere('LOWER(op.operationCode) = LOWER(:code)', { code });
    if (excludeId) qb.andWhere('op.id != :excludeId', { excludeId });
    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(`Operation '${code}' already exists in this company`);
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
      return new ConflictException(`Operation '${code}' already exists in this company`);
    }
    return e;
  }
}