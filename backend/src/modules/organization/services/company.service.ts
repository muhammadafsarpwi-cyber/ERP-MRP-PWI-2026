import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, Not, DataSource } from 'typeorm';
import { Company, CompanyStatus } from '../entities';
import { CreateCompanyDto, UpdateCompanyDto } from '../dto';
import { populateAuditNames } from '../helpers/audit-names';

/** Standard item type seeds applied to every new company (canonical + legacy). */
const STANDARD_ITEM_TYPES: Array<{ code: string; name: string; description: string | null; sortOrder: number }> = [
  { code: 'RAW_MATERIAL', name: 'Raw Material', description: 'Raw materials and inputs', sortOrder: 1 },
  { code: 'WORK_IN_PROGRESS', name: 'Work in Progress', description: 'Work in progress items', sortOrder: 2 },
  { code: 'SEMI_FINISHED', name: 'Semi-Finished', description: 'Semi-finished goods', sortOrder: 3 },
  { code: 'FINISHED_GOOD', name: 'Finished Good', description: 'Finished products ready for sale', sortOrder: 4 },
  { code: 'PACKAGING_MATERIAL', name: 'Packaging Material', description: 'Packaging materials', sortOrder: 5 },
  { code: 'CONSUMABLE', name: 'Consumable', description: 'Consumable items', sortOrder: 6 },
  { code: 'SPARE_PART', name: 'Spare Part', description: 'Spare parts', sortOrder: 7 },
  { code: 'SERVICE', name: 'Service', description: 'Services', sortOrder: 8 },
  { code: 'ASSET', name: 'Asset', description: 'Assets', sortOrder: 9 },
  { code: 'OTHER', name: 'Other', description: 'Other item types', sortOrder: 10 },
  { code: 'BOBBIN', name: 'Bobbin', description: '', sortOrder: 11 },
  { code: 'EQUIPMENT', name: 'Equipment', description: '', sortOrder: 12 },
  { code: 'STATIONERY', name: 'Stationery', description: '', sortOrder: 13 },
  { code: 'STATIONERY_TAG', name: 'Stationery/Tag', description: '', sortOrder: 14 },
  { code: 'ELECTRICAL', name: 'Electrical', description: '', sortOrder: 15 },
  { code: 'CHAIN', name: 'Chain', description: '', sortOrder: 16 },
  { code: 'SANITARY_FITTING', name: 'Sanitary Fitting', description: '', sortOrder: 17 },
  { code: 'MECH_FITTINGS', name: 'Mech. Fittings', description: '', sortOrder: 18 },
  { code: 'BELT', name: 'Belt', description: '', sortOrder: 19 },
  { code: 'BEARING', name: 'Bearing', description: '', sortOrder: 20 },
  { code: 'SEAL', name: 'Seal', description: '', sortOrder: 21 },
  { code: 'MECH_SPARE', name: 'Mech. Spare', description: '', sortOrder: 22 },
  { code: 'SANITARY_FITTINGS', name: 'Sanitary Fittings', description: '', sortOrder: 23 },
  { code: 'TOOLS', name: 'Tools', description: '', sortOrder: 24 },
];

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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

    const saved = await this.companyRepository.save(company);
    await this.seedStandardItemTypes(saved.id);
    return saved;
  }

  /**
   * Seeds the standard item types master for a newly created company. Wrapped in
   * try/catch so a seeding failure never blocks company creation — the admin can
   * always add types later from the Item Types screen.
   */
  private async seedStandardItemTypes(companyId: string): Promise<void> {
    try {
      const manager = this.companyRepository.manager;
      if (!manager) return;
      for (const t of STANDARD_ITEM_TYPES) {
        await manager.query(
          `INSERT INTO item_types (company_id, code, name, description, sort_order, status, created_at, updated_at, is_active)
           VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW(), NOW(), TRUE)
           ON CONFLICT (company_id, code) DO NOTHING`,
          [companyId, t.code, t.name, t.description || null, t.sortOrder],
        );
      }
      this.logger.log(`Seeded standard item types for company ${companyId}`);
    } catch (err) {
      this.logger.warn(`Failed to seed standard item types for company ${companyId}: ${err}`);
    }
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
    await populateAuditNames(this.dataSource, data);

    return { data, total };
  }

  async findOne(id: string): Promise<Company> {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: ['branches', 'businessUnits', 'departments', 'warehouses', 'divisions', 'sections'],
    });

    if (!company) {
      throw new NotFoundException(`Company with ID '${id}' not found`);
    }

    await populateAuditNames(this.dataSource, [company]);
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
    if (company.branches?.length > 0 || company.businessUnits?.length > 0 || company.departments?.length > 0 || company.warehouses?.length > 0 || company.divisions?.length > 0 || company.sections?.length > 0) {
      throw new BadRequestException('Cannot delete company with existing dependencies');
    }

    try {
      await this.companyRepository.remove(company);
    } catch (error: any) {
      if (error.code === '23503' || error.message?.includes('foreign key constraint')) {
        throw new BadRequestException(
          'Cannot delete company because it is referenced by existing operations, divisions, sections, or users. Please deactivate it instead.',
        );
      }
      throw error;
    }
  }
}
