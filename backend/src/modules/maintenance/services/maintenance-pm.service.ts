import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenancePmPlan } from '../entities/maintenance-pm-plan.entity';
import { MaintenancePmSchedule } from '../entities/maintenance-pm-schedule.entity';
import { CreatePmPlanDto, UpdatePmPlanDto } from '../dto';

@Injectable()
export class MaintenancePmService {
  constructor(
    @InjectRepository(MaintenancePmPlan)
    private readonly planRepo: Repository<MaintenancePmPlan>,
    @InjectRepository(MaintenancePmSchedule)
    private readonly scheduleRepo: Repository<MaintenancePmSchedule>,
  ) {}

  async createPlan(dto: CreatePmPlanDto, userId: string): Promise<MaintenancePmPlan> {
    const existing = await this.planRepo.findOne({ where: { planCode: dto.planCode } });
    if (existing) {
      throw new ConflictException(`PM Plan with code '${dto.planCode}' already exists`);
    }
    const plan = this.planRepo.create({ ...dto, createdBy: userId, updatedBy: userId });
    return this.planRepo.save(plan);
  }

  async findAllPlans(companyId?: string): Promise<MaintenancePmPlan[]> {
    const where: any = { isActive: true };
    if (companyId) where.companyId = companyId;
    return this.planRepo.find({ where, relations: ['machine', 'assignedTeam'], order: { planName: 'ASC' } });
  }

  async findOnePlan(id: string): Promise<MaintenancePmPlan> {
    const plan = await this.planRepo.findOne({ where: { id }, relations: ['machine', 'assignedTeam'] });
    if (!plan) throw new NotFoundException(`PM Plan '${id}' not found`);
    return plan;
  }

  async updatePlan(id: string, dto: UpdatePmPlanDto, userId: string): Promise<MaintenancePmPlan> {
    const plan = await this.findOnePlan(id);
    Object.assign(plan, dto, { updatedBy: userId });
    return this.planRepo.save(plan);
  }

  async removePlan(id: string): Promise<void> {
    await this.planRepo.delete(id);
  }

  async findSchedules(companyId?: string): Promise<MaintenancePmSchedule[]> {
    const qb = this.scheduleRepo.createQueryBuilder('s');
    qb.leftJoinAndSelect('s.pmPlan', 'plan');
    qb.leftJoinAndSelect('s.machine', 'machine');
    if (companyId) {
      qb.where('plan.companyId = :companyId', { companyId });
    }
    qb.orderBy('s.scheduledDate', 'ASC');
    return qb.getMany();
  }
}
