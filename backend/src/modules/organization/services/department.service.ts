import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, Not, TreeRepository, DataSource } from 'typeorm';
import { Department, DepartmentStatus, Division, Section, Company } from '../entities';
import { CreateDepartmentDto, UpdateDepartmentDto } from '../dto';

@Injectable()
export class DepartmentService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: TreeRepository<Department>,
    @InjectRepository(Division)
    private readonly divisionRepository: Repository<Division>,
    @InjectRepository(Section)
    private readonly sectionRepository: Repository<Section>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private async populateAuditNames(departments: Department[]): Promise<Department[]> {
    if (!departments || departments.length === 0) return departments;

    const userIds = new Set<string>();
    for (const dept of departments) {
      if (dept.createdBy) userIds.add(dept.createdBy);
      if (dept.updatedBy) userIds.add(dept.updatedBy);
    }

    if (userIds.size === 0) return departments;

    try {
      const idsArray = Array.from(userIds);
      const users = await this.dataSource.query(
        `SELECT id, auth_user_id, display_name, email FROM erp_users WHERE id = ANY($1::uuid[]) OR auth_user_id = ANY($1::uuid[])`,
        [idsArray],
      );

      const nameMap = new Map<string, string>();
      for (const u of users) {
        const name = u.display_name || u.email || 'User';
        if (u.id) nameMap.set(u.id, name);
        if (u.auth_user_id) nameMap.set(u.auth_user_id, name);
      }

      for (const dept of departments) {
        (dept as any).createdByName = dept.createdBy ? (nameMap.get(dept.createdBy) || null) : null;
        (dept as any).updatedByName = dept.updatedBy ? (nameMap.get(dept.updatedBy) || null) : null;
      }
    } catch {
      // Graceful fallback if erp_users cannot be queried
      for (const dept of departments) {
        (dept as any).createdByName = (dept as any).createdByName || null;
        (dept as any).updatedByName = (dept as any).updatedByName || null;
      }
    }

    return departments;
  }

  private async validateHierarchy(
    companyId: string,
    divisionId?: string | null,
    sectionId?: string | null,
  ): Promise<{ division: Division | null; section: Section | null }> {
    let division: Division | null = null;
    let section: Section | null = null;

    if (divisionId) {
      division = await this.divisionRepository.findOne({ where: { id: divisionId } });
      if (!division) {
        throw new NotFoundException(`Division with ID '${divisionId}' not found`);
      }
      if (division.companyId !== companyId) {
        throw new BadRequestException(`Selected division '${division.name}' does not belong to the selected company`);
      }
    }

    if (sectionId) {
      if (!divisionId) {
        throw new BadRequestException('Cannot assign a section without selecting a division');
      }
      section = await this.sectionRepository.findOne({ where: { id: sectionId } });
      if (!section) {
        throw new NotFoundException(`Section with ID '${sectionId}' not found`);
      }
      if (section.divisionId !== divisionId) {
        throw new BadRequestException(`Selected section '${section.name}' does not belong to the selected division`);
      }
      if (section.companyId !== companyId) {
        throw new BadRequestException(`Selected section '${section.name}' does not belong to the selected company`);
      }
    }

    return { division, section };
  }

  async create(createDepartmentDto: CreateDepartmentDto, userId?: string): Promise<Department> {
    const company = await this.companyRepository.findOne({
      where: { id: createDepartmentDto.companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company with ID '${createDepartmentDto.companyId}' not found`);
    }

    await this.validateHierarchy(
      createDepartmentDto.companyId,
      createDepartmentDto.divisionId,
      createDepartmentDto.sectionId,
    );

    const existingDepartment = await this.departmentRepository.findOne({
      where: {
        departmentCode: createDepartmentDto.departmentCode,
        companyId: createDepartmentDto.companyId,
      },
    });

    if (existingDepartment) {
      throw new ConflictException(`Department with code '${createDepartmentDto.departmentCode}' already exists in this company`);
    }

    if (createDepartmentDto.parentDepartmentId) {
      const parentDepartment = await this.departmentRepository.findOne({
        where: { id: createDepartmentDto.parentDepartmentId },
      });

      if (!parentDepartment) {
        throw new NotFoundException(`Parent department with ID '${createDepartmentDto.parentDepartmentId}' not found`);
      }

      if (parentDepartment.companyId !== createDepartmentDto.companyId) {
        throw new BadRequestException('Parent department must belong to the same company');
      }

      if (createDepartmentDto.parentDepartmentId === createDepartmentDto.departmentCode) {
        throw new BadRequestException('Department cannot be its own parent');
      }
    }

    const department = this.departmentRepository.create({
      ...createDepartmentDto,
      divisionId: createDepartmentDto.divisionId || (null as any),
      sectionId: createDepartmentDto.sectionId || (null as any),
      branchId: createDepartmentDto.branchId || (null as any),
      businessUnitId: createDepartmentDto.businessUnitId || (null as any),
      parentDepartmentId: createDepartmentDto.parentDepartmentId || (null as any),
      createdBy: userId || null,
      updatedBy: userId || null,
    });

    const saved = await this.departmentRepository.save(department);
    return this.findOne(saved.id);
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: DepartmentStatus;
    companyId?: string;
    branchId?: string;
    businessUnitId?: string;
    divisionId?: string;
    sectionId?: string;
    parentDepartmentId?: string;
    centralizedOnly?: boolean;
    productionOnly?: boolean;
  }): Promise<{ data: Department[]; total: number }> {
    const { page = 1, limit = 20, search, status, companyId, branchId, businessUnitId, divisionId, sectionId, parentDepartmentId, centralizedOnly, productionOnly } = options || {};

    const queryBuilder = this.departmentRepository.createQueryBuilder('dept');
    queryBuilder.leftJoinAndSelect('dept.company', 'company');
    queryBuilder.leftJoinAndSelect('dept.branch', 'branch');
    queryBuilder.leftJoinAndSelect('dept.businessUnit', 'businessUnit');
    queryBuilder.leftJoinAndSelect('dept.division', 'division');
    queryBuilder.leftJoinAndSelect('dept.section', 'section');
    queryBuilder.leftJoinAndSelect('dept.parentDepartment', 'parentDepartment');
    queryBuilder.leftJoinAndSelect('dept.divisionScopes', 'divisionScopes');
    queryBuilder.leftJoinAndSelect('divisionScopes.division', 'scopeDivision');

    if (search) {
      queryBuilder.where(
        '(dept.name ILIKE :search OR dept.departmentCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('dept.status = :status', { status });
    }

    if (companyId) {
      queryBuilder.andWhere('dept.companyId = :companyId', { companyId });
    }

    if (branchId) {
      queryBuilder.andWhere('dept.branchId = :branchId', { branchId });
    }

    if (businessUnitId) {
      queryBuilder.andWhere('dept.businessUnitId = :businessUnitId', { businessUnitId });
    }

    if (divisionId) {
      queryBuilder.andWhere('dept.divisionId = :divisionId', { divisionId });
    }

    if (sectionId) {
      queryBuilder.andWhere('dept.sectionId = :sectionId', { sectionId });
    }

    if (parentDepartmentId) {
      queryBuilder.andWhere('dept.parentDepartmentId = :parentDepartmentId', { parentDepartmentId });
    }

    if (centralizedOnly) {
      queryBuilder.andWhere('dept.divisionId IS NULL');
    }

    if (productionOnly) {
      queryBuilder.andWhere('dept.divisionId IS NOT NULL');
    }

    queryBuilder.orderBy('dept.name', 'ASC');
    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    await this.populateAuditNames(data);

    return { data, total };
  }

  async findOne(id: string): Promise<Department> {
    const department = await this.departmentRepository.findOne({
      where: { id },
      relations: ['company', 'branch', 'businessUnit', 'division', 'section', 'parentDepartment', 'children', 'divisionScopes', 'divisionScopes.division'],
    });

    if (!department) {
      throw new NotFoundException(`Department with ID '${id}' not found`);
    }

    await this.populateAuditNames([department]);
    return department;
  }

  async getHierarchy(companyId?: string): Promise<Department[]> {
    const queryBuilder = this.departmentRepository.createQueryBuilder('dept');
    queryBuilder.leftJoinAndSelect('dept.children', 'children');
    queryBuilder.leftJoinAndSelect('children.children', 'grandChildren');
    queryBuilder.leftJoinAndSelect('dept.division', 'division');
    queryBuilder.leftJoinAndSelect('dept.section', 'section');
    queryBuilder.leftJoinAndSelect('dept.divisionScopes', 'divisionScopes');
    queryBuilder.leftJoinAndSelect('divisionScopes.division', 'scopeDivision');

    if (companyId) {
      queryBuilder.where('dept.companyId = :companyId', { companyId });
      queryBuilder.andWhere('dept.parentDepartmentId IS NULL');
    } else {
      queryBuilder.where('dept.parentDepartmentId IS NULL');
    }

    queryBuilder.orderBy('dept.name', 'ASC');

    const depts = await queryBuilder.getMany();
    await this.populateAuditNames(depts);
    return depts;
  }

  async update(id: string, updateDepartmentDto: UpdateDepartmentDto, userId?: string): Promise<Department> {
    const department = await this.findOne(id);

    if (updateDepartmentDto.departmentCode && updateDepartmentDto.departmentCode !== department.departmentCode) {
      const existingDepartment = await this.departmentRepository.findOne({
        where: {
          departmentCode: updateDepartmentDto.departmentCode,
          companyId: department.companyId,
          id: Not(id),
        },
      });

      if (existingDepartment) {
        throw new ConflictException(`Department with code '${updateDepartmentDto.departmentCode}' already exists in this company`);
      }
    }

    if (updateDepartmentDto.parentDepartmentId) {
      if (updateDepartmentDto.parentDepartmentId === id) {
        throw new BadRequestException('Department cannot be its own parent');
      }

      const isCircular = await this.checkCircularReference(id, updateDepartmentDto.parentDepartmentId);
      if (isCircular) {
        throw new BadRequestException('Cannot set parent department as it would create a circular reference');
      }
    }

    const targetDivisionId = updateDepartmentDto.divisionId !== undefined
      ? updateDepartmentDto.divisionId
      : department.divisionId;
    const targetSectionId = updateDepartmentDto.sectionId !== undefined
      ? updateDepartmentDto.sectionId
      : department.sectionId;

    await this.validateHierarchy(
      department.companyId,
      targetDivisionId,
      targetSectionId,
    );

    const updatePayload: any = {
      updatedBy: userId || null,
      updatedAt: new Date(),
    };

    if (updateDepartmentDto.departmentCode !== undefined) {
      updatePayload.departmentCode = updateDepartmentDto.departmentCode;
    }
    if (updateDepartmentDto.name !== undefined) {
      updatePayload.name = updateDepartmentDto.name;
    }
    if (updateDepartmentDto.description !== undefined) {
      updatePayload.description = updateDepartmentDto.description;
    }
    if (updateDepartmentDto.divisionId !== undefined) {
      updatePayload.divisionId = updateDepartmentDto.divisionId || null;
    }
    if (updateDepartmentDto.sectionId !== undefined) {
      updatePayload.sectionId = updateDepartmentDto.sectionId || null;
    }
    if (updateDepartmentDto.branchId !== undefined) {
      updatePayload.branchId = updateDepartmentDto.branchId || null;
    }
    if (updateDepartmentDto.businessUnitId !== undefined) {
      updatePayload.businessUnitId = updateDepartmentDto.businessUnitId || null;
    }
    if (updateDepartmentDto.parentDepartmentId !== undefined) {
      updatePayload.parentDepartmentId = updateDepartmentDto.parentDepartmentId || null;
    }

    // Direct database update eliminates TypeORM relation cache conflict
    await this.departmentRepository.update(id, updatePayload);

    return this.findOne(id);
  }

  private async checkCircularReference(departmentId: string, potentialParentId: string): Promise<boolean> {
    let currentId = potentialParentId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === departmentId) {
        return true;
      }

      if (visited.has(currentId)) {
        return true;
      }

      visited.add(currentId);

      const parent = await this.departmentRepository.findOne({
        where: { id: currentId },
      });

      if (!parent || !parent.parentDepartmentId) {
        break;
      }

      currentId = parent.parentDepartmentId;
    }

    return false;
  }

  async activate(id: string, userId?: string): Promise<Department> {
    const department = await this.findOne(id);

    if (department.status === DepartmentStatus.ACTIVE) {
      throw new BadRequestException('Department is already active');
    }

    if (department.company?.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot activate department when parent company is inactive');
    }

    await this.departmentRepository.update(id, {
      status: DepartmentStatus.ACTIVE,
      updatedBy: userId || null,
      updatedAt: new Date(),
    });

    return this.findOne(id);
  }

  async deactivate(id: string, userId?: string): Promise<Department> {
    const department = await this.findOne(id);

    if (department.status === DepartmentStatus.INACTIVE) {
      throw new BadRequestException('Department is already inactive');
    }

    if (department.children && department.children.length > 0) {
      const activeChildren = department.children.filter(c => c.status === DepartmentStatus.ACTIVE);
      if (activeChildren.length > 0) {
        throw new BadRequestException('Cannot deactivate department with active child departments');
      }
    }

    await this.departmentRepository.update(id, {
      status: DepartmentStatus.INACTIVE,
      updatedBy: userId || null,
      updatedAt: new Date(),
    });

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const department = await this.findOne(id);

    if (department.children && department.children.length > 0) {
      throw new BadRequestException('Cannot delete department with child departments');
    }

    try {
      await this.departmentRepository.remove(department);
    } catch (error: any) {
      if (error.code === '23503' || error.message?.includes('foreign key constraint')) {
        throw new BadRequestException(
          'Cannot delete department because it is referenced by existing operations, store requests, or users. Please deactivate it instead.',
        );
      }
      throw error;
    }
  }
}

