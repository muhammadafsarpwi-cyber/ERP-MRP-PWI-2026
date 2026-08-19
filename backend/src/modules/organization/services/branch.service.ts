import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Branch, BranchStatus } from '../entities';
import { CreateBranchDto, UpdateBranchDto } from '../dto';

@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
  ) {}

  async create(createBranchDto: CreateBranchDto, userId?: string): Promise<Branch> {
    // Check for duplicate branch code within company
    const existingBranch = await this.branchRepository.findOne({
      where: {
        branchCode: createBranchDto.branchCode,
        companyId: createBranchDto.companyId,
      },
    });

    if (existingBranch) {
      throw new ConflictException(`Branch with code '${createBranchDto.branchCode}' already exists in this company`);
    }

    const branch = this.branchRepository.create({
      ...createBranchDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.branchRepository.save(branch);
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: BranchStatus;
    companyId?: string;
  }): Promise<{ data: Branch[]; total: number }> {
    const { page = 1, limit = 20, search, status, companyId } = options || {};

    const queryBuilder = this.branchRepository.createQueryBuilder('branch');
    queryBuilder.leftJoinAndSelect('branch.company', 'company');

    if (search) {
      queryBuilder.where(
        '(branch.name ILIKE :search OR branch.branchCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('branch.status = :status', { status });
    }

    if (companyId) {
      queryBuilder.andWhere('branch.companyId = :companyId', { companyId });
    }

    queryBuilder.orderBy('branch.createdAt', 'DESC');
    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return { data, total };
  }

  async findOne(id: string): Promise<Branch> {
    const branch = await this.branchRepository.findOne({
      where: { id },
      relations: ['company', 'businessUnits', 'departments', 'warehouses'],
    });

    if (!branch) {
      throw new NotFoundException(`Branch with ID '${id}' not found`);
    }

    return branch;
  }

  async update(id: string, updateBranchDto: UpdateBranchDto, userId?: string): Promise<Branch> {
    const branch = await this.findOne(id);

    // Check for duplicate code within company if code is being updated
    if (updateBranchDto.branchCode) {
      const existingBranch = await this.branchRepository.findOne({
        where: {
          branchCode: updateBranchDto.branchCode,
          companyId: branch.companyId,
          id: Not(id),
        },
      });

      if (existingBranch) {
        throw new ConflictException(`Branch with code '${updateBranchDto.branchCode}' already exists in this company`);
      }
    }

    Object.assign(branch, updateBranchDto, { updatedBy: userId });

    return this.branchRepository.save(branch);
  }

  async activate(id: string, userId?: string): Promise<Branch> {
    const branch = await this.findOne(id);

    if (branch.status === BranchStatus.ACTIVE) {
      throw new BadRequestException('Branch is already active');
    }

    // Check if parent company is active
    if (branch.company?.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot activate branch when parent company is inactive');
    }

    branch.status = BranchStatus.ACTIVE;
    branch.updatedBy = userId || null;

    return this.branchRepository.save(branch);
  }

  async deactivate(id: string, userId?: string): Promise<Branch> {
    const branch = await this.findOne(id);

    if (branch.status === BranchStatus.INACTIVE) {
      throw new BadRequestException('Branch is already inactive');
    }

    branch.status = BranchStatus.INACTIVE;
    branch.updatedBy = userId || null;

    return this.branchRepository.save(branch);
  }

  async remove(id: string): Promise<void> {
    const branch = await this.findOne(id);

    // Check if branch has dependencies
    if (branch.businessUnits?.length > 0 || branch.departments?.length > 0 || branch.warehouses?.length > 0) {
      throw new BadRequestException('Cannot delete branch with existing dependencies');
    }

    await this.branchRepository.remove(branch);
  }
}
