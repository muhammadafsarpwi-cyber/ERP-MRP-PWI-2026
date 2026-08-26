import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityLog } from '../entities/activity-log.entity';

export interface CreateActivityLogDto {
  actorUserId?: string;
  actorEmail?: string;
  action: string;
  targetType: string;
  targetId?: string;
  targetName?: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class ActivityLogService {
  private readonly logger = new Logger(ActivityLogService.name);

  constructor(
    @InjectRepository(ActivityLog)
    private readonly logRepository: Repository<ActivityLog>,
  ) {}

  async log(dto: CreateActivityLogDto): Promise<ActivityLog> {
    try {
      const entry = this.logRepository.create({
        actorUserId: dto.actorUserId || null,
        actorEmail: dto.actorEmail || null,
        action: dto.action,
        targetType: dto.targetType,
        targetId: dto.targetId || null,
        targetName: dto.targetName || null,
        details: dto.details || null,
        ipAddress: dto.ipAddress || null,
        userAgent: dto.userAgent || null,
      });
      return await this.logRepository.save(entry);
    } catch (error) {
      this.logger.error(`Failed to create activity log: ${error.message}`, error.stack);
      return null as any;
    }
  }

  async findAll(options?: {
    page?: number;
    limit?: number;
    action?: string;
    targetType?: string;
    actorUserId?: string;
  }): Promise<{ data: ActivityLog[]; total: number }> {
    const { page = 1, limit = 50, action, targetType, actorUserId } = options || {};

    const qb = this.logRepository.createQueryBuilder('log');

    if (action) {
      qb.andWhere('log.action = :action', { action });
    }
    if (targetType) {
      qb.andWhere('log.targetType = :targetType', { targetType });
    }
    if (actorUserId) {
      qb.andWhere('log.actorUserId = :actorUserId', { actorUserId });
    }

    qb.orderBy('log.created_at', 'DESC');
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
