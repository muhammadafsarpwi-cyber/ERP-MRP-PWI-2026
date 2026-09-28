import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, Not, DataSource } from 'typeorm';
import { Division, DivisionStatus } from '../entities';
import { CreateDivisionDto, UpdateDivisionDto } from '../dto';
import { populateAuditNames } from '../helpers/audit-names';
import { applyDivisionScopeFilter, isUnrestricted } from '../../../common/division-scope.util';

@Injectable()
export class DivisionService {
  constructor(
    @InjectRepository(Division)
    private readonly divisionRepository: Repository<Division>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(createDivisionDto: CreateDivisionDto, userId?: string): Promise<Division> {
    const existingDivision = await this.divisionRepository.findOne({
      where: {
        divisionCode: createDivisionDto.divisionCode,
        companyId: createDivisionDto.companyId,
      },
    });

    if (existingDivision) {
      throw new ConflictException(`Division with code '${createDivisionDto.divisionCode}' already exists in this company`);
    }

    const division = this.divisionRepository.create({
      ...createDivisionDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.divisionRepository.save(division);
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: DivisionStatus;
    companyId?: string;
    /** §21 — divisions outside this list are never returned. */
    allowedDivisionIds?: string[];
  }): Promise<{ data: Division[]; total: number }> {
    const { page = 1, limit = 20, search, status, companyId, allowedDivisionIds } = options || {};

    const queryBuilder = this.divisionRepository.createQueryBuilder('div');
    queryBuilder.leftJoinAndSelect('div.company', 'company');
    queryBuilder.leftJoinAndSelect('div.sections', 'sections');

    if (search) {
      queryBuilder.where(
        '(div.name ILIKE :search OR div.divisionCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('div.status = :status', { status });
    }

    if (companyId) {
      queryBuilder.andWhere('div.companyId = :companyId', { companyId });
    }

    applyDivisionScopeFilter(queryBuilder, 'div.id', allowedDivisionIds, 'allowedDivisionIds');

    queryBuilder.orderBy('div.name', 'ASC');
    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    await populateAuditNames(this.dataSource, data);

    return { data, total };
  }

  async findOne(id: string, allowedDivisionIds?: string[]): Promise<Division> {
    const division = await this.divisionRepository.findOne({
      where: { id },
      relations: ['company', 'sections', 'sections.departments', 'departments'],
    });

    if (!division) {
      throw new NotFoundException(`Division with ID '${id}' not found`);
    }

    // §18 — a division id outside the caller's scope must not be readable.
    if (!isUnrestricted(allowedDivisionIds) && !(allowedDivisionIds as string[]).includes(division.id)) {
      throw new ForbiddenException('You do not have access to this division.');
    }

    await populateAuditNames(this.dataSource, [division]);
    return division;
  }

  async update(
    id: string,
    updateDivisionDto: UpdateDivisionDto,
    userId?: string,
    allowedDivisionIds?: string[],
  ): Promise<Division> {
    const division = await this.findOne(id, allowedDivisionIds);

    Object.assign(division, updateDivisionDto, { updatedBy: userId });

    return this.divisionRepository.save(division);
  }

  async activate(id: string, userId?: string, allowedDivisionIds?: string[]): Promise<Division> {
    const division = await this.findOne(id, allowedDivisionIds);

    if (division.status === DivisionStatus.ACTIVE) {
      throw new BadRequestException('Division is already active');
    }

    division.status = DivisionStatus.ACTIVE;
    division.updatedBy = userId || null;

    return this.divisionRepository.save(division);
  }

  async deactivate(id: string, userId?: string, allowedDivisionIds?: string[]): Promise<Division> {
    const division = await this.findOne(id, allowedDivisionIds);

    if (division.status === DivisionStatus.INACTIVE) {
      throw new BadRequestException('Division is already inactive');
    }

    if (division.sections && division.sections.length > 0) {
      const activeSections = division.sections.filter(s => s.status === 'ACTIVE');
      if (activeSections.length > 0) {
        throw new BadRequestException('Cannot deactivate division with active sections');
      }
    }

    division.status = DivisionStatus.INACTIVE;
    division.updatedBy = userId || null;

    return this.divisionRepository.save(division);
  }

  async remove(id: string, allowedDivisionIds?: string[]): Promise<void> {
    const division = await this.findOne(id, allowedDivisionIds);

    if (division.sections && division.sections.length > 0) {
      throw new BadRequestException('Cannot delete division with existing sections');
    }

    if (division.departments && division.departments.length > 0) {
      throw new BadRequestException('Cannot delete division with existing departments');
    }

    try {
      await this.divisionRepository.remove(division);
    } catch (error: any) {
      if (error.code === '23503' || error.message?.includes('foreign key constraint')) {
        throw new BadRequestException(
          'Cannot delete division because it is referenced by existing operations, sections, or departments. Please deactivate it instead.',
        );
      }
      throw error;
    }
  }
}
