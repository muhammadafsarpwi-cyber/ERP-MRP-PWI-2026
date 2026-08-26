import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import { MaintenanceComplaintCategory } from '../entities/maintenance-complaint-category.entity';
import { MaintenanceRootCauseCategory } from '../entities/maintenance-root-cause-category.entity';
import { MaintenanceFailureCategory } from '../entities/maintenance-failure-category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from '../dto';

@Injectable()
export class MaintenanceCategoryService {
  constructor(
    @InjectRepository(MaintenanceComplaintCategory)
    private readonly complaintRepo: Repository<MaintenanceComplaintCategory>,
    @InjectRepository(MaintenanceRootCauseCategory)
    private readonly rootCauseRepo: Repository<MaintenanceRootCauseCategory>,
    @InjectRepository(MaintenanceFailureCategory)
    private readonly failureRepo: Repository<MaintenanceFailureCategory>,
  ) {}

  async findComplaintCategories(companyId?: string): Promise<MaintenanceComplaintCategory[]> {
    if (companyId && !isUUID(companyId, 'all')) {
      throw new BadRequestException('companyId must be a UUID');
    }
    const where: any = companyId
      ? [{ isActive: true, companyId }, { isActive: true, companyId: IsNull() }]
      : { isActive: true };
    return this.complaintRepo.find({ where, order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async createComplaintCategory(dto: CreateCategoryDto): Promise<MaintenanceComplaintCategory> {
    const cat = this.complaintRepo.create(dto);
    return this.complaintRepo.save(cat);
  }

  async updateComplaintCategory(id: string, dto: UpdateCategoryDto): Promise<MaintenanceComplaintCategory> {
    const cat = await this.complaintRepo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException(`Complaint category '${id}' not found`);
    Object.assign(cat, dto);
    return this.complaintRepo.save(cat);
  }

  async findRootCauseCategories(companyId?: string): Promise<MaintenanceRootCauseCategory[]> {
    const where: any = { isActive: true };
    if (companyId) where.companyId = companyId;
    return this.rootCauseRepo.find({ where, order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async createRootCauseCategory(dto: CreateCategoryDto): Promise<MaintenanceRootCauseCategory> {
    const cat = this.rootCauseRepo.create(dto);
    return this.rootCauseRepo.save(cat);
  }

  async updateRootCauseCategory(id: string, dto: UpdateCategoryDto): Promise<MaintenanceRootCauseCategory> {
    const cat = await this.rootCauseRepo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException(`Root cause category '${id}' not found`);
    Object.assign(cat, dto);
    return this.rootCauseRepo.save(cat);
  }

  async findFailureCategories(companyId?: string): Promise<MaintenanceFailureCategory[]> {
    const where: any = { isActive: true };
    if (companyId) where.companyId = companyId;
    return this.failureRepo.find({ where, order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async createFailureCategory(dto: CreateCategoryDto): Promise<MaintenanceFailureCategory> {
    const cat = this.failureRepo.create(dto);
    return this.failureRepo.save(cat);
  }

  async updateFailureCategory(id: string, dto: UpdateCategoryDto): Promise<MaintenanceFailureCategory> {
    const cat = await this.failureRepo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException(`Failure category '${id}' not found`);
    Object.assign(cat, dto);
    return this.failureRepo.save(cat);
  }
}
