import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, Not, DataSource } from 'typeorm';
import { Section, SectionStatus, Division } from '../entities';
import { CreateSectionDto, UpdateSectionDto } from '../dto';
import { populateAuditNames } from '../helpers/audit-names';

@Injectable()
export class SectionService {
  constructor(
    @InjectRepository(Section)
    private readonly sectionRepository: Repository<Section>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(createSectionDto: CreateSectionDto, userId?: string): Promise<Section> {
    let companyId = createSectionDto.companyId;

    if (!companyId && createSectionDto.divisionId) {
      const division = await this.dataSource.getRepository(Division).findOne({
        where: { id: createSectionDto.divisionId },
        select: ['id', 'companyId'],
      });
      if (!division) {
        throw new NotFoundException(`Division with ID '${createSectionDto.divisionId}' not found`);
      }
      companyId = division.companyId;
    }

    if (!companyId) {
      throw new BadRequestException('companyId is required and could not be determined');
    }

    const existingSection = await this.sectionRepository.findOne({
      where: {
        sectionCode: createSectionDto.sectionCode,
        companyId,
      },
    });

    if (existingSection) {
      throw new ConflictException(`Section with code '${createSectionDto.sectionCode}' already exists in this company`);
    }

    const section = this.sectionRepository.create({
      ...createSectionDto,
      companyId,
      createdBy: userId,
      updatedBy: userId,
    });

    return this.sectionRepository.save(section);
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: SectionStatus;
    companyId?: string;
    divisionId?: string;
  }): Promise<{ data: Section[]; total: number }> {
    const { page = 1, limit = 20, search, status, companyId, divisionId } = options || {};

    const queryBuilder = this.sectionRepository.createQueryBuilder('sec');
    queryBuilder.leftJoinAndSelect('sec.company', 'company');
    queryBuilder.leftJoinAndSelect('sec.division', 'division');
    queryBuilder.leftJoinAndSelect('sec.departments', 'departments');

    if (search) {
      queryBuilder.where(
        '(sec.name ILIKE :search OR sec.sectionCode ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (status) {
      queryBuilder.andWhere('sec.status = :status', { status });
    }

    if (companyId) {
      queryBuilder.andWhere('sec.companyId = :companyId', { companyId });
    }

    if (divisionId) {
      queryBuilder.andWhere('sec.divisionId = :divisionId', { divisionId });
    }

    queryBuilder.orderBy('sec.name', 'ASC');
    queryBuilder.skip((page - 1) * limit);
    queryBuilder.take(limit);

    const [data, total] = await queryBuilder.getManyAndCount();
    await populateAuditNames(this.dataSource, data);

    return { data, total };
  }

  async findOne(id: string): Promise<Section> {
    const section = await this.sectionRepository.findOne({
      where: { id },
      relations: ['company', 'division', 'departments'],
    });

    if (!section) {
      throw new NotFoundException(`Section with ID '${id}' not found`);
    }

    await populateAuditNames(this.dataSource, [section]);
    return section;
  }

  async update(id: string, updateSectionDto: UpdateSectionDto, userId?: string): Promise<Section> {
    const section = await this.findOne(id);

    if (updateSectionDto.divisionId && updateSectionDto.divisionId !== section.divisionId) {
      const division = await this.dataSource.getRepository(Division).findOne({
        where: { id: updateSectionDto.divisionId },
        select: ['id', 'companyId'],
      });
      if (!division) {
        throw new NotFoundException(`Division with ID '${updateSectionDto.divisionId}' not found`);
      }
      section.companyId = division.companyId;
    }

    Object.assign(section, updateSectionDto, { updatedBy: userId });

    return this.sectionRepository.save(section);
  }

  async activate(id: string, userId?: string): Promise<Section> {
    const section = await this.findOne(id);

    if (section.status === SectionStatus.ACTIVE) {
      throw new BadRequestException('Section is already active');
    }

    section.status = SectionStatus.ACTIVE;
    section.updatedBy = userId || null;

    return this.sectionRepository.save(section);
  }

  async deactivate(id: string, userId?: string): Promise<Section> {
    const section = await this.findOne(id);

    if (section.status === SectionStatus.INACTIVE) {
      throw new BadRequestException('Section is already inactive');
    }

    if (section.departments && section.departments.length > 0) {
      const activeDepartments = section.departments.filter(d => d.status === 'ACTIVE');
      if (activeDepartments.length > 0) {
        throw new BadRequestException('Cannot deactivate section with active departments');
      }
    }

    section.status = SectionStatus.INACTIVE;
    section.updatedBy = userId || null;

    return this.sectionRepository.save(section);
  }

  async remove(id: string): Promise<void> {
    const section = await this.findOne(id);

    if (section.departments && section.departments.length > 0) {
      throw new BadRequestException('Cannot delete section with existing departments');
    }

    try {
      await this.sectionRepository.remove(section);
    } catch (error: any) {
      const code = error?.code || error?.driverError?.code;
      const msg = (error?.message || '').toLowerCase();
      if (code === '23503' || msg.includes('foreign key') || msg.includes('violates foreign key constraint')) {
        const secLabel = section.sectionCode ? `${section.sectionCode} (${section.name})` : section.name;
        throw new BadRequestException(
          `Cannot delete section "${secLabel}" because it is referenced by existing departments, machines, operations, or inventory. Please deactivate it instead.`,
        );
      }
      throw error;
    }
  }
}
