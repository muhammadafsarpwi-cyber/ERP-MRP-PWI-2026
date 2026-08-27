import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan, LessThanOrEqual } from 'typeorm';
import { MaintenancePmPlan } from '../entities/maintenance-pm-plan.entity';
import { MaintenancePmSchedule } from '../entities/maintenance-pm-schedule.entity';
import { MaintenanceJobCard } from '../entities/maintenance-job-card.entity';
import { JobCardStatus } from '../enums';
import { CreatePmPlanDto, UpdatePmPlanDto, GenerateScheduleDto } from '../dto';
import { ActivityLogService } from '../../audit/services/activity-log.service';
import { MaintenanceUserResolverService } from './maintenance-user-resolver.service';

@Injectable()
export class MaintenancePmService {
  private readonly logger = new Logger(MaintenancePmService.name);

  constructor(
    @InjectRepository(MaintenancePmPlan)
    private readonly planRepo: Repository<MaintenancePmPlan>,
    @InjectRepository(MaintenancePmSchedule)
    private readonly scheduleRepo: Repository<MaintenancePmSchedule>,
    @InjectRepository(MaintenanceJobCard)
    private readonly jobCardRepo: Repository<MaintenanceJobCard>,
    private readonly activityLog: ActivityLogService,
    private readonly userResolver: MaintenanceUserResolverService,
    private readonly dataSource: DataSource,
  ) {}

  async createPlan(dto: CreatePmPlanDto, userId: string): Promise<MaintenancePmPlan> {
    const erpUserId = await this.userResolver.resolve(userId);
    const existing = await this.planRepo.findOne({ where: { planCode: dto.planCode } });
    if (existing) {
      throw new ConflictException(`PM Plan with code '${dto.planCode}' already exists`);
    }
    const plan = this.planRepo.create({ ...dto, createdBy: erpUserId, updatedBy: erpUserId });
    const saved = await this.planRepo.save(plan);
    await this.activityLog.log({ action: 'PM_PLAN_CREATED', targetType: 'maintenance_pm_plans', targetId: saved.id, actorUserId: erpUserId, targetName: saved.planCode });
    return saved;
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
    const erpUserId = await this.userResolver.resolve(userId);
    const plan = await this.findOnePlan(id);
    Object.assign(plan, dto, { updatedBy: erpUserId });
    const saved = await this.planRepo.save(plan);
    await this.activityLog.log({ action: 'PM_PLAN_UPDATED', targetType: 'maintenance_pm_plans', targetId: id, actorUserId: erpUserId, details: JSON.stringify(dto) });
    return saved;
  }

  async removePlan(id: string, userId: string): Promise<void> {
    const erpUserId = await this.userResolver.resolve(userId);
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`PM Plan '${id}' not found`);
    plan.isActive = false;
    plan.updatedBy = erpUserId;
    await this.planRepo.save(plan);
    await this.activityLog.log({ action: 'PM_PLAN_DEACTIVATED', targetType: 'maintenance_pm_plans', targetId: id, actorUserId: erpUserId });
  }

  async generateSchedules(planId: string, dto: GenerateScheduleDto, userId: string): Promise<MaintenancePmSchedule[]> {
    const erpUserId = await this.userResolver.resolve(userId);
    const plan = await this.findOnePlan(planId);
    const startDate = plan.startDate ? new Date(plan.startDate) : new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + dto.monthsAhead);

    const existingSchedules = await this.scheduleRepo.find({
      where: { pmPlanId: planId },
      select: ['scheduledDate'],
    });
    const existingDates = new Set(existingSchedules.map(s => s.scheduledDate));

    const schedules: MaintenancePmSchedule[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0];
      if (!existingDates.has(dateStr)) {
        const schedule = this.scheduleRepo.create({
          pmPlanId: planId,
          machineId: plan.machineId,
          scheduledDate: dateStr,
          status: 'SCHEDULED',
        });
        const saved = await this.scheduleRepo.save(schedule);
        schedules.push(saved);
      }

      currentDate = this.getNextFrequencyDate(currentDate, plan.frequencyType, plan.frequencyValue);
    }

    plan.nextDueDate = schedules.length > 0 ? schedules[0].scheduledDate : null;
    plan.lastGeneratedAt = new Date();
    plan.updatedBy = erpUserId;
    await this.planRepo.save(plan);

    await this.activityLog.log({ action: 'PM_SCHEDULES_GENERATED', targetType: 'maintenance_pm_plans', targetId: planId, actorUserId: erpUserId, details: `Generated ${schedules.length} schedules, ${dto.monthsAhead} months ahead` });

    return schedules;
  }

  private getNextFrequencyDate(current: Date, frequencyType: string, frequencyValue: number): Date {
    const next = new Date(current);
    switch (frequencyType) {
      case 'DAILY':
        next.setDate(next.getDate() + frequencyValue);
        break;
      case 'WEEKLY':
        next.setDate(next.getDate() + (frequencyValue * 7));
        break;
      case 'MONTHLY':
        next.setMonth(next.getMonth() + frequencyValue);
        break;
      case 'QUARTERLY':
        next.setMonth(next.getMonth() + (frequencyValue * 3));
        break;
      case 'SEMI_ANNUAL':
        next.setMonth(next.getMonth() + (frequencyValue * 6));
        break;
      case 'ANNUAL':
        next.setFullYear(next.getFullYear() + frequencyValue);
        break;
      case 'HOURS':
        next.setDate(next.getDate() + Math.ceil(frequencyValue / 24));
        break;
      default:
        next.setMonth(next.getMonth() + frequencyValue);
    }
    return next;
  }

  async findSchedules(companyId?: string): Promise<MaintenancePmSchedule[]> {
    const qb = this.scheduleRepo.createQueryBuilder('s');
    qb.leftJoinAndSelect('s.pmPlan', 'plan');
    qb.leftJoinAndSelect('s.machine', 'machine');
    qb.leftJoinAndSelect('s.generatedJobCard', 'generatedJobCard');
    if (companyId) {
      qb.where('plan.companyId = :companyId', { companyId });
    }
    qb.orderBy('s.scheduledDate', 'ASC');
    return qb.getMany();
  }

  async completeSchedule(scheduleId: string, userId: string): Promise<MaintenancePmSchedule> {
    const erpUserId = await this.userResolver.resolve(userId);
    const schedule = await this.scheduleRepo.findOne({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException(`PM Schedule '${scheduleId}' not found`);
    if (schedule.status === 'COMPLETED') throw new BadRequestException('Schedule already completed');

    const saved = await this.dataSource.transaction(async (manager) => {
      schedule.status = 'COMPLETED';
      schedule.completedAt = new Date();
      const sched = await manager.getRepository(MaintenancePmSchedule).save(schedule);

      const plan = await this.findOnePlan(schedule.pmPlanId);
      const nextDate = this.getNextFrequencyDate(new Date(schedule.scheduledDate), plan.frequencyType, plan.frequencyValue);
      plan.nextDueDate = nextDate.toISOString().split('T')[0];
      plan.updatedBy = erpUserId;
      await manager.getRepository(MaintenancePmPlan).save(plan);

      return { sched, plan };
    });

    await this.activityLog.log({ action: 'PM_SCHEDULE_COMPLETED', targetType: 'maintenance_pm_schedules', targetId: scheduleId, actorUserId: erpUserId, details: `Schedule ${saved.sched.scheduledDate} completed for plan ${saved.plan.planCode}` });
    return saved.sched;
  }

  async skipSchedule(scheduleId: string, userId: string): Promise<MaintenancePmSchedule> {
    const erpUserId = await this.userResolver.resolve(userId);
    const schedule = await this.scheduleRepo.findOne({ where: { id: scheduleId } });
    if (!schedule) throw new NotFoundException(`PM Schedule '${scheduleId}' not found`);
    if (schedule.status === 'COMPLETED') throw new BadRequestException('Cannot skip a completed schedule');

    schedule.status = 'SKIPPED';
    const saved = await this.scheduleRepo.save(schedule);

    await this.activityLog.log({ action: 'PM_SCHEDULE_SKIPPED', targetType: 'maintenance_pm_schedules', targetId: scheduleId, actorUserId: erpUserId });
    return saved;
  }
}
