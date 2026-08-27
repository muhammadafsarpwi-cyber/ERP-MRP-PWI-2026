import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaintenanceTeam } from '../entities/maintenance-team.entity';
import { MaintenanceTeamMember } from '../entities/maintenance-team-member.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { CreateTeamDto, UpdateTeamDto } from '../dto';
import { ActivityLogService } from '../../audit/services/activity-log.service';

@Injectable()
export class MaintenanceTeamService {
  private readonly logger = new Logger(MaintenanceTeamService.name);

  constructor(
    @InjectRepository(MaintenanceTeam)
    private readonly teamRepo: Repository<MaintenanceTeam>,
    @InjectRepository(MaintenanceTeamMember)
    private readonly memberRepo: Repository<MaintenanceTeamMember>,
    @InjectRepository(ErpUser)
    private readonly userRepo: Repository<ErpUser>,
    private readonly activityLog: ActivityLogService,
  ) {}

  async create(dto: CreateTeamDto, userId: string): Promise<MaintenanceTeam> {
    const existing = await this.teamRepo.findOne({ where: { code: dto.code, companyId: dto.companyId } });
    if (existing) {
      throw new ConflictException(`Team with code '${dto.code}' already exists`);
    }

    const team = this.teamRepo.create({
      companyId: dto.companyId,
      code: dto.code,
      name: dto.name,
      description: dto.description || null,
      departmentId: dto.departmentId || null,
      createdBy: userId,
      updatedBy: userId,
    });
    const saved = await this.teamRepo.save(team);

    if (dto.memberUserIds?.length) {
      for (const uid of dto.memberUserIds) {
        const member = this.memberRepo.create({ teamId: saved.id, userId: uid, role: 'MEMBER' });
        await this.memberRepo.save(member);
      }
    }

    await this.activityLog.log({ action: 'MAINTENANCE_TEAM_CREATED', targetType: 'maintenance_teams', targetId: saved.id, actorUserId: userId, targetName: saved.name, details: `Team: ${saved.code}` });
    return this.findOne(saved.id);
  }

  async findAll(companyId?: string): Promise<MaintenanceTeam[]> {
    const where: any = { isActive: true };
    if (companyId) where.companyId = companyId;
    return this.teamRepo.find({ where, relations: ['department'], order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<MaintenanceTeam> {
    const team = await this.teamRepo.findOne({
      where: { id },
      relations: ['department', 'members', 'members.user'],
    });
    if (!team) throw new NotFoundException(`Team '${id}' not found`);
    return team;
  }

  async update(id: string, dto: UpdateTeamDto, userId: string): Promise<MaintenanceTeam> {
    const team = await this.findOne(id);
    Object.assign(team, {
      ...(dto.code && { code: dto.code }),
      ...(dto.name && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
      updatedBy: userId,
    });
    await this.teamRepo.save(team);

    if (dto.memberUserIds) {
      await this.memberRepo.delete({ teamId: id });
      for (const uid of dto.memberUserIds) {
        const member = this.memberRepo.create({ teamId: id, userId: uid, role: 'MEMBER' });
        await this.memberRepo.save(member);
      }
    }

    await this.activityLog.log({ action: 'MAINTENANCE_TEAM_UPDATED', targetType: 'maintenance_teams', targetId: id, actorUserId: userId, details: JSON.stringify(dto) });
    return this.findOne(id);
  }

  async remove(id: string, userId: string): Promise<void> {
    const team = await this.teamRepo.findOne({ where: { id } });
    if (!team) throw new NotFoundException(`Team '${id}' not found`);
    team.isActive = false;
    team.updatedBy = userId;
    await this.teamRepo.save(team);
    await this.activityLog.log({ action: 'MAINTENANCE_TEAM_DEACTIVATED', targetType: 'maintenance_teams', targetId: id, actorUserId: userId });
  }
}
