import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { BusinessUnit, BusinessUnitStatus } from '../entities';
import { CreateBusinessUnitDto, UpdateBusinessUnitDto } from '../dto';

@Injectable()
export class BusinessUnitService {
  constructor(
    @InjectRepository(BusinessUnit)
    private readonly businessUnitRepository: Repository<BusinessUnit>,
  ) {}

  async create(createBusinessUnitDto: CreateBusinessUnitDto, userId?: string): Promise<BusinessUnit> {
    // Check for duplicate code within company
    const existingBusinessUnit = await this.businessUnitRepository.findOne({
      where: {
        code: createBusinessUnitDto.code,
        companyId: createBusinessUnitDto.companyId,
      },
    });

    if (existingBusinessUnit) {
      throw new ConflictException(`Business unit with code '${createBusinessUnitDto.code}' already exists in this company`);
    }

    const businessUnit = this.businessUnitRepository.create({
      ...createBusinessUnitDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.businessUnitRepository.save(businessUnit);
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: BusinessUnitStatus;
    companyId?: string;
    branchId?: string;
  }): Promise<{ data: BusinessUnit[]; total: number }> {
    const { page = 1, limit = 20, search, status, companyId, branchId } = options || {};

    const queryBuilder = this.businessUnitRepository.createQueryBuilder('bu');
    queryBuilder.leftJoinAndSelect('bu.company', 'company');
    queryBuilder.leftJoinAndSelect('bu.branch', 'branch');

    if (search) {
      queryBuilder.where(
        '(bu.name ILIKE :search OR bu.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('bu.status = :status', { status });
    }

    if (companyId) {
      queryBuilder.andWhere('bu.companyId = :companyId', { companyId });
    }

    if (branchId) {
      queryBuilder.andWhere('bu.branchId = :branchId', { branchId });
    }

    queryBuilder.orderBy('bu.createdAt', 'DESC');
    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return { data, total };
  }

  async findOne(id: string): Promise<BusinessUnit> {
    const businessUnit = await this.businessUnitRepository.findOne({
      where: { id },
      relations: ['company', 'branch', 'departments', 'warehouses'],
    });

    if (!businessUnit) {
      throw new NotFoundException(`Business unit with ID '${id}' not found`);
    }

    return businessUnit;
  }

  async update(id: string, updateBusinessUnitDto: UpdateBusinessUnitDto, userId?: string): Promise<BusinessUnit> {
    const businessUnit = await this.findOne(id);

    // Check for duplicate code within company if code is being updated
    if (updateBusinessUnitDto.code) {
      const existingBusinessUnit = await this.businessUnitRepository.findOne({
        where: {
          code: updateBusinessUnitDto.code,
          companyId: businessUnit.companyId,
          id: Not(id),
        },
      });

      if (existingBusinessUnit) {
        throw new ConflictException(`Business unit with code '${updateBusinessUnitDto.code}' already exists in this company`);
      }
    }

    Object.assign(businessUnit, updateBusinessUnitDto, { updatedBy: userId });

    return this.businessUnitRepository.save(businessUnit);
  }

  async activate(id: string, userId?: string): Promise<BusinessUnit> {
    const businessUnit = await this.findOne(id);

    if (businessUnit.status === BusinessUnitStatus.ACTIVE) {
      throw new BadRequestException('Business unit is already active');
    }

    // Check if parent company is active
    if (businessUnit.company?.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot activate business unit when parent company is inactive');
    }

    businessUnit.status = BusinessUnitStatus.ACTIVE;
    businessUnit.updatedBy = userId || null;

    return this.businessUnitRepository.save(businessUnit);
  }

  async deactivate(id: string, userId?: string): Promise<BusinessUnit> {
    const businessUnit = await this.findOne(id);

    if (businessUnit.status === BusinessUnitStatus.INACTIVE) {
      throw new BadRequestException('Business unit is already inactive');
    }

    businessUnit.status = BusinessUnitStatus.INACTIVE;
    businessUnit.updatedBy = userId || null;

    return this.businessUnitRepository.save(businessUnit);
  }

  async remove(id: string): Promise<void> {
    const businessUnit = await this.findOne(id);

    // Check if business unit has dependencies
    if (businessUnit.departments?.length > 0 || businessUnit.warehouses?.length > 0) {
      throw new BadRequestException('Cannot delete business unit with existing dependencies');
    }

    await this.businessUnitRepository.remove(businessUnit);
  }
}
