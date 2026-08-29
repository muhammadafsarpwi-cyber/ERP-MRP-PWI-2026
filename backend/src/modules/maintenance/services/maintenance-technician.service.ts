import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import { MaintenanceTechnician } from '../entities/maintenance-technician.entity';
import { MaintenanceUserResolverService } from './maintenance-user-resolver.service';
import { CreateTechnicianDto, UpdateTechnicianDto } from '../dto';
import { ActivityLogService } from '../../audit/services/activity-log.service';

@Injectable()
export class MaintenanceTechnicianService {
  constructor(
    @InjectRepository(MaintenanceTechnician)
    private readonly technicianRepo: Repository<MaintenanceTechnician>,
    private readonly userResolver: MaintenanceUserResolverService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async findAll(opts: {
    department?: string;
    skill?: string;
    status?: string;
    employeeId?: string;
    search?: string;
    active?: string;
  }): Promise<MaintenanceTechnician[]> {
    const qb = this.technicianRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.user', 'user')
      .where('1 = 1');

    if (opts.department) qb.andWhere('t.department = :department', { department: opts.department });
    if (opts.skill) qb.andWhere('t.skill = :skill', { skill: opts.skill });
    if (opts.status) qb.andWhere('t.status = :status', { status: opts.status });
    if (opts.employeeId) qb.andWhere('t.employeeId ILIKE :employeeId', { employeeId: `%${opts.employeeId}%` });
    if (opts.search) {
      qb.andWhere('(t.technicianName ILIKE :search OR t.employeeId ILIKE :search OR t.department ILIKE :search OR t.skill ILIKE :search)', { search: `%${opts.search}%` });
    }
    if (opts.active !== undefined && opts.active !== 'false') {
      qb.andWhere('t.isActive = true');
      if (!opts.status) qb.andWhere("t.status = 'ACTIVE'");
    }

    qb.orderBy('t.employeeId', 'ASC');
    return qb.getMany();
  }

  async findOne(id: string): Promise<MaintenanceTechnician> {
    if (!isUUID(id, '4')) throw new BadRequestException('Technician ID must be a UUID');
    const technician = await this.technicianRepo.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!technician) throw new NotFoundException(`Technician '${id}' not found`);
    return technician;
  }

  async create(dto: CreateTechnicianDto, authUserId: string): Promise<MaintenanceTechnician> {
    const erpUserId = await this.userResolver.resolve(authUserId);
    const existing = await this.technicianRepo.findOne({ where: { employeeId: dto.employeeId } });
    if (existing) throw new ConflictException(`Technician with employee ID '${dto.employeeId}' already exists`);

    if (dto.userId) {
      const userOwner = await this.technicianRepo.findOne({ where: { userId: dto.userId } });
      if (userOwner) throw new ConflictException('The selected ERP user is already linked to another technician');
    }

    const technician = this.technicianRepo.create({
      employeeId: dto.employeeId,
      technicianName: dto.technicianName,
      department: dto.department || 'Maintenance',
      skill: dto.skill ?? null,
      shift: dto.shift ?? null,
      status: dto.status || 'ACTIVE',
      userId: dto.userId ?? null,
      remarks: dto.remarks ?? null,
      createdBy: erpUserId,
      updatedBy: erpUserId,
    });
    const saved = await this.technicianRepo.save(technician);

    await this.activityLog.log({
      action: 'MAINTENANCE_TECHNICIAN_CREATED',
      targetType: 'maintenance_technicians',
      targetId: saved.id,
      actorUserId: erpUserId,
      targetName: saved.technicianName,
      details: `Technician: ${saved.employeeId} ${saved.technicianName}`,
    });
    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateTechnicianDto, authUserId: string): Promise<MaintenanceTechnician> {
    const technician = await this.findOne(id);
    const erpUserId = await this.userResolver.resolve(authUserId);

    if (dto.employeeId && dto.employeeId !== technician.employeeId) {
      const existing = await this.technicianRepo.findOne({ where: { employeeId: dto.employeeId } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Technician with employee ID '${dto.employeeId}' already exists`);
      }
    }
    if (dto.userId) {
      const userOwner = await this.technicianRepo.findOne({ where: { userId: dto.userId } });
      if (userOwner && userOwner.id !== id) {
        throw new ConflictException('The selected ERP user is already linked to another technician');
      }
    }

    Object.assign(technician, {
      ...(dto.employeeId !== undefined && { employeeId: dto.employeeId }),
      ...(dto.technicianName !== undefined && { technicianName: dto.technicianName }),
      ...(dto.department !== undefined && { department: dto.department }),
      ...(dto.skill !== undefined && { skill: dto.skill }),
      ...(dto.shift !== undefined && { shift: dto.shift }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.userId !== undefined && { userId: dto.userId || null }),
      ...(dto.remarks !== undefined && { remarks: dto.remarks }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      updatedBy: erpUserId,
    });
    const saved = await this.technicianRepo.save(technician);

    await this.activityLog.log({
      action: 'MAINTENANCE_TECHNICIAN_UPDATED',
      targetType: 'maintenance_technicians',
      targetId: id,
      actorUserId: erpUserId,
      targetName: saved.technicianName,
      details: JSON.stringify(dto),
    });
    return this.findOne(id);
  }

  async remove(id: string, authUserId: string): Promise<void> {
    const technician = await this.findOne(id);
    const erpUserId = await this.userResolver.resolve(authUserId);
    technician.isActive = false;
    technician.updatedBy = erpUserId;
    await this.technicianRepo.save(technician);
    await this.activityLog.log({
      action: 'MAINTENANCE_TECHNICIAN_DEACTIVATED',
      targetType: 'maintenance_technicians',
      targetId: id,
      actorUserId: erpUserId,
      targetName: technician.technicianName,
    });
  }
}
