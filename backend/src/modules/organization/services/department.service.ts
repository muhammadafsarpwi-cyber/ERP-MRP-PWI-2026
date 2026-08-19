import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, TreeRepository } from 'typeorm';
import { Department, DepartmentStatus } from '../entities';
import { CreateDepartmentDto, UpdateDepartmentDto } from '../dto';

@Injectable()
export class DepartmentService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: TreeRepository<Department>,
  ) {}

  async create(createDepartmentDto: CreateDepartmentDto, userId?: string): Promise<Department> {
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

      if (createDepartmentDto.parentDepartmentId === createDepartmentDto.departmentCode) {
        throw new BadRequestException('Department cannot be its own parent');
      }
    }

    const department = this.departmentRepository.create({
      ...createDepartmentDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.departmentRepository.save(department);
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
  }): Promise<{ data: Department[]; total: number }> {
    const { page = 1, limit = 20, search, status, companyId, branchId, businessUnitId, divisionId, sectionId, parentDepartmentId } = options || {};

    const queryBuilder = this.departmentRepository.createQueryBuilder('dept');
    queryBuilder.leftJoinAndSelect('dept.company', 'company');
    queryBuilder.leftJoinAndSelect('dept.branch', 'branch');
    queryBuilder.leftJoinAndSelect('dept.businessUnit', 'businessUnit');
    queryBuilder.leftJoinAndSelect('dept.division', 'division');
    queryBuilder.leftJoinAndSelect('dept.section', 'section');
    queryBuilder.leftJoinAndSelect('dept.parentDepartment', 'parentDepartment');

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

    queryBuilder.orderBy('dept.name', 'ASC');
    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return { data, total };
  }

  async findOne(id: string): Promise<Department> {
    const department = await this.departmentRepository.findOne({
      where: { id },
      relations: ['company', 'branch', 'businessUnit', 'division', 'section', 'parentDepartment', 'children'],
    });

    if (!department) {
      throw new NotFoundException(`Department with ID '${id}' not found`);
    }

    return department;
  }

  async getHierarchy(companyId?: string): Promise<Department[]> {
    const queryBuilder = this.departmentRepository.createQueryBuilder('dept');
    queryBuilder.leftJoinAndSelect('dept.children', 'children');
    queryBuilder.leftJoinAndSelect('children.children', 'grandChildren');
    queryBuilder.leftJoinAndSelect('dept.division', 'division');
    queryBuilder.leftJoinAndSelect('dept.section', 'section');

    if (companyId) {
      queryBuilder.where('dept.companyId = :companyId', { companyId });
      queryBuilder.andWhere('dept.parentDepartmentId IS NULL');
    } else {
      queryBuilder.where('dept.parentDepartmentId IS NULL');
    }

    queryBuilder.orderBy('dept.name', 'ASC');

    return queryBuilder.getMany();
  }

  async update(id: string, updateDepartmentDto: UpdateDepartmentDto, userId?: string): Promise<Department> {
    const department = await this.findOne(id);

    if (updateDepartmentDto.departmentCode) {
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

    Object.assign(department, updateDepartmentDto, { updatedBy: userId });

    return this.departmentRepository.save(department);
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

    department.status = DepartmentStatus.ACTIVE;
    department.updatedBy = userId || null;

    return this.departmentRepository.save(department);
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

    department.status = DepartmentStatus.INACTIVE;
    department.updatedBy = userId || null;

    return this.departmentRepository.save(department);
  }

  async remove(id: string): Promise<void> {
    const department = await this.findOne(id);

    if (department.children && department.children.length > 0) {
      throw new BadRequestException('Cannot delete department with child departments');
    }

    await this.departmentRepository.remove(department);
  }
}
