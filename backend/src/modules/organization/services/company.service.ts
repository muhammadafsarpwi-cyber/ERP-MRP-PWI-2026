import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Company, CompanyStatus } from '../entities';
import { CreateCompanyDto, UpdateCompanyDto } from '../dto';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async create(createCompanyDto: CreateCompanyDto, userId?: string): Promise<Company> {
    // Check for duplicate company code
    const existingCompany = await this.companyRepository.findOne({
      where: { companyCode: createCompanyDto.companyCode },
    });

    if (existingCompany) {
      throw new ConflictException(`Company with code '${createCompanyDto.companyCode}' already exists`);
    }

    const company = this.companyRepository.create({
      ...createCompanyDto,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.companyRepository.save(company);
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: CompanyStatus;
  }): Promise<{ data: Company[]; total: number }> {
    const { page = 1, limit = 20, search, status } = options || {};

    const queryBuilder = this.companyRepository.createQueryBuilder('company');

    if (search) {
      queryBuilder.where(
        '(company.legalName ILIKE :search OR company.tradeName ILIKE :search OR company.companyCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('company.status = :status', { status });
    }

    queryBuilder.orderBy('company.createdAt', 'DESC');
    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();

    return { data, total };
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: ['branches', 'businessUnits', 'departments', 'warehouses'],
    });

    if (!company) {
      throw new NotFoundException(`Company with ID '${id}' not found`);
    }

    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto, userId?: string): Promise<Company> {
    const company = await this.findOne(id);

    // Check for duplicate code if code is being updated
    if (updateCompanyDto.companyCode && updateCompanyDto.companyCode !== company.companyCode) {
      const existingCompany = await this.companyRepository.findOne({
        where: { companyCode: updateCompanyDto.companyCode, id: Not(id) },
      });

      if (existingCompany) {
        throw new ConflictException(`Company with code '${updateCompanyDto.companyCode}' already exists`);
      }
    }

    Object.assign(company, updateCompanyDto, { updatedBy: userId });

    return this.companyRepository.save(company);
  }

  async activate(id: string, userId?: string): Promise<Company> {
    const company = await this.findOne(id);

    if (company.status === CompanyStatus.ACTIVE) {
      throw new BadRequestException('Company is already active');
    }

    company.status = CompanyStatus.ACTIVE;
    company.updatedBy = userId || null;

    return this.companyRepository.save(company);
  }

  async deactivate(id: string, userId?: string): Promise<Company> {
    const company = await this.findOne(id);

    if (company.status === CompanyStatus.INACTIVE) {
      throw new BadRequestException('Company is already inactive');
    }

    // Check if company has active dependencies
    if (company.branches?.length > 0 || company.businessUnits?.length > 0) {
      throw new BadRequestException('Cannot deactivate company with active branches or business units');
    }

    company.status = CompanyStatus.INACTIVE;
    company.updatedBy = userId || null;

    return this.companyRepository.save(company);
  }

  async remove(id: string): Promise<void> {
    const company = await this.findOne(id);

    // Check if company has dependencies
    if (company.branches?.length > 0 || company.businessUnits?.length > 0 || company.departments?.length > 0 || company.warehouses?.length > 0) {
      throw new BadRequestException('Cannot delete company with existing dependencies');
    }

    await this.companyRepository.remove(company);
  }
}
