import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, Not, DataSource } from 'typeorm';
import { Division, DivisionStatus, Company, CompanyStatus } from '../entities';
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
    let companyId = createDivisionDto.companyId;
    if (!companyId) {
      const defaultCompany = await this.dataSource.getRepository(Company).findOne({
        where: { status: CompanyStatus.ACTIVE },
        select: ['id'],
      });
      if (defaultCompany) {
        companyId = defaultCompany.id;
      }
    }

    if (!companyId) {
      throw new BadRequestException('companyId is required and could not be determined');
    }

    const existingDivision = await this.divisionRepository.findOne({
      where: {
        divisionCode: createDivisionDto.divisionCode,
        companyId,
      },
    });

    if (existingDivision) {
      throw new ConflictException(`Division with code '${createDivisionDto.divisionCode}' already exists in this company`);
    }

    const division = this.divisionRepository.create({
      ...createDivisionDto,
      companyId,
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
    includeInactive?: boolean;
    companyId?: string;
    /** §21 — divisions outside this list are never returned. */
    allowedDivisionIds?: string[];
  }): Promise<{ data: Division[]; total: number }> {
    const { page = 1, limit = 20, search, status, includeInactive = false, companyId, allowedDivisionIds } = options || {};

    const queryBuilder = this.divisionRepository.createQueryBuilder('div');
    queryBuilder.leftJoinAndSelect('div.company', 'company');
    queryBuilder.leftJoinAndSelect('div.sections', 'sections');

    if (search) {
      queryBuilder.where(
        '(div.name ILIKE :search OR div.divisionCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (includeInactive) {
      if (status) {
        queryBuilder.andWhere('div.status = :status', { status });
      }
    } else if (status === DivisionStatus.INACTIVE) {
      queryBuilder.andWhere('div.status = :status', { status });
    } else {
      queryBuilder.andWhere('div.isActive = true');
      queryBuilder.andWhere('div.status = :activeStatus', { activeStatus: DivisionStatus.ACTIVE });
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
    division.isActive = true;
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
    division.isActive = false;
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
