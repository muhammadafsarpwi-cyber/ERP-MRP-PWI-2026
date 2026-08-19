import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Section, SectionStatus } from '../entities';
import { CreateSectionDto, UpdateSectionDto } from '../dto';

@Injectable()
export class SectionService {
  constructor(
    @InjectRepository(Section)
    private readonly sectionRepository: Repository<Section>,
  ) {}

  async create(createSectionDto: CreateSectionDto, userId?: string): Promise<Section> {
    const existingSection = await this.sectionRepository.findOne({
      where: {
        sectionCode: createSectionDto.sectionCode,
        companyId: createSectionDto.companyId,
      },
    });

    if (existingSection) {
      throw new ConflictException(`Section with code '${createSectionDto.sectionCode}' already exists in this company`);
    }

    const section = this.sectionRepository.create({
      ...createSectionDto,
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

    return section;
  }

  async update(id: string, updateSectionDto: UpdateSectionDto, userId?: string): Promise<Section> {
    const section = await this.findOne(id);

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

    await this.sectionRepository.remove(section);
  }
}
