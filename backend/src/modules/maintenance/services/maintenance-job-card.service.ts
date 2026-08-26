import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MaintenanceJobCard } from '../entities/maintenance-job-card.entity';
import { MaintenanceJobCardTechnician } from '../entities/maintenance-job-card-technician.entity';
import { MaintenanceJobCardPart } from '../entities/maintenance-job-card-part.entity';
import { MaintenanceJobCardAttachment } from '../entities/maintenance-job-card-attachment.entity';
import { MaintenanceJobCardStatusHistory } from '../entities/maintenance-job-card-status-history.entity';
import { MaintenanceJobCardWorkLog } from '../entities/maintenance-job-card-work-log.entity';
import { Machine } from '../../production/entities/machine.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { JobCardStatus, VALID_TRANSITIONS } from '../enums';
import {
  CreateJobCardDto,
  UpdateJobCardDto,
  AssignJobCardDto,
  AddJobCardPartDto,
  AddWorkLogDto,
  RejectJobCardDto,
  JobCardQueryDto,
} from '../dto';

@Injectable()
export class MaintenanceJobCardService {
  private readonly logger = new Logger(MaintenanceJobCardService.name);

  constructor(
    @InjectRepository(MaintenanceJobCard)
    private readonly jobCardRepo: Repository<MaintenanceJobCard>,
    @InjectRepository(MaintenanceJobCardTechnician)
    private readonly technicianRepo: Repository<MaintenanceJobCardTechnician>,
    @InjectRepository(MaintenanceJobCardPart)
    private readonly partRepo: Repository<MaintenanceJobCardPart>,
    @InjectRepository(MaintenanceJobCardAttachment)
    private readonly attachmentRepo: Repository<MaintenanceJobCardAttachment>,
    @InjectRepository(MaintenanceJobCardStatusHistory)
    private readonly historyRepo: Repository<MaintenanceJobCardStatusHistory>,
    @InjectRepository(MaintenanceJobCardWorkLog)
    private readonly workLogRepo: Repository<MaintenanceJobCardWorkLog>,
    @InjectRepository(Machine)
    private readonly machineRepo: Repository<Machine>,
    @InjectRepository(ErpUser)
    private readonly userRepo: Repository<ErpUser>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateJobCardDto, userId: string): Promise<MaintenanceJobCard> {
    const machine = await this.machineRepo.findOne({ where: { id: dto.machineId, isActive: true } });
    if (!machine) {
      throw new NotFoundException(`Machine with ID '${dto.machineId}' not found`);
    }

    const jobCardNo = await this.generateJobCardNo(dto.companyId);

    const jobCard = this.jobCardRepo.create({
      companyId: dto.companyId,
      jobCardNo,
      machineId: dto.machineId,
      complaint: dto.complaint,
      priority: dto.priority || ('MEDIUM' as any),
      complaintCategoryId: dto.complaintCategoryId || null,
      assignedDepartmentId: dto.assignedDepartmentId || machine.departmentId || null,
      description: dto.description || null,
      requestedBy: dto.requestedBy || userId,
      requestedAt: new Date(),
      currentStatus: JobCardStatus.OPEN,
      createdBy: userId,
      updatedBy: userId,
    });

    const saved = await this.jobCardRepo.save(jobCard);

    await this.recordHistory(saved.id, null, JobCardStatus.OPEN, userId, 'Job card created');
    await this.logActivity(userId, 'JOB_CARD_CREATED', saved.id, jobCardNo);

    return this.findOne(saved.id);
  }

  async findAll(query: JobCardQueryDto): Promise<{ data: MaintenanceJobCard[]; total: number }> {
    const { page = 1, limit = 20, search, companyId, machineId, assignedDepartmentId, currentStatus, priority, technicianUserId, dateFrom, dateTo } = query;

    const qb = this.jobCardRepo.createQueryBuilder('jc');
    qb.leftJoinAndSelect('jc.machine', 'machine');
    qb.leftJoinAndSelect('jc.assignedDepartment', 'department');
    qb.leftJoinAndSelect('jc.requestedByUser', 'requester');
    qb.leftJoinAndSelect('jc.company', 'company');

    if (companyId) {
      qb.andWhere('jc.companyId = :companyId', { companyId });
    }
    if (machineId) {
      qb.andWhere('jc.machineId = :machineId', { machineId });
    }
    if (assignedDepartmentId) {
      qb.andWhere('jc.assignedDepartmentId = :assignedDepartmentId', { assignedDepartmentId });
    }
    if (currentStatus) {
      qb.andWhere('jc.currentStatus = :currentStatus', { currentStatus });
    }
    if (priority) {
      qb.andWhere('jc.priority = :priority', { priority });
    }
    if (technicianUserId) {
      qb.innerJoin('maintenance_job_card_technicians', 't', 't.job_card_id = jc.id AND t.technician_user_id = :technicianUserId', { technicianUserId });
    }
    if (search) {
      qb.andWhere('(jc.jobCardNo ILIKE :search OR jc.complaint ILIKE :search)', { search: `%${search}%` });
    }
    if (dateFrom) {
      qb.andWhere('jc.requestedAt >= :dateFrom', { dateFrom });
    }
    if (dateTo) {
      qb.andWhere('jc.requestedAt <= :dateTo', { dateTo: dateTo + 'T23:59:59.999Z' });
    }

    qb.orderBy('jc.requestedAt', 'DESC');
    qb.skip((page - 1) * limit);
    qb.take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.jobCardRepo.findOne({
      where: { id },
      relations: [
        'machine', 'assignedDepartment', 'requestedByUser',
        'startedByUser', 'completedByUser', 'closedByUser', 'verifiedByUser', 'approvedByUser',
        'company',
      ],
    });
    if (!jobCard) {
      throw new NotFoundException(`Job Card with ID '${id}' not found`);
    }
    return jobCard;
  }

  async update(id: string, dto: UpdateJobCardDto, userId: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    if (jobCard.currentStatus === JobCardStatus.APPROVED) {
      throw new BadRequestException('Cannot edit an approved job card');
    }
    Object.assign(jobCard, dto, { updatedBy: userId });
    await this.jobCardRepo.save(jobCard);
    return this.findOne(id);
  }

  async remove(id: string, userId: string): Promise<void> {
    const jobCard = await this.findOne(id);
    if (jobCard.currentStatus !== JobCardStatus.OPEN) {
      throw new BadRequestException('Only OPEN job cards can be deleted');
    }
    jobCard.isActive = false;
    jobCard.updatedBy = userId;
    await this.jobCardRepo.save(jobCard);
  }

  async assign(id: string, dto: AssignJobCardDto, userId: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.ASSIGNED);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      for (const techUserId of dto.technicianUserIds) {
        const user = await this.userRepo.findOne({ where: { id: techUserId, isActive: true } });
        if (!user) throw new NotFoundException(`User '${techUserId}' not found`);
      }

      await queryRunner.manager.delete(MaintenanceJobCardTechnician, { jobCardId: id });

      for (let i = 0; i < dto.technicianUserIds.length; i++) {
        const tech = queryRunner.manager.create(MaintenanceJobCardTechnician, {
          jobCardId: id,
          technicianUserId: dto.technicianUserIds[i],
          role: i === 0 ? 'PRIMARY' : 'SECONDARY',
          assignedAt: new Date(),
        });
        await queryRunner.manager.save(tech);
      }

      jobCard.currentStatus = JobCardStatus.ASSIGNED;
      jobCard.assignedAt = new Date();
      jobCard.updatedBy = userId;
      await queryRunner.manager.save(jobCard);

      const history = queryRunner.manager.create(MaintenanceJobCardStatusHistory, {
        jobCardId: id,
        fromStatus: JobCardStatus.OPEN,
        toStatus: JobCardStatus.ASSIGNED,
        changedBy: userId,
        remarks: dto.remarks || `Assigned to ${dto.technicianUserIds.length} technician(s)`,
      });
      await queryRunner.manager.save(history);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.logActivity(userId, 'JOB_CARD_ASSIGNED', id, jobCard.jobCardNo);
    return this.findOne(id);
  }

  async start(id: string, userId: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.IN_PROGRESS);

    jobCard.currentStatus = JobCardStatus.IN_PROGRESS;
    jobCard.startedAt = new Date();
    jobCard.startedBy = userId;
    jobCard.downtimeStart = jobCard.downtimeStart || new Date();
    jobCard.updatedBy = userId;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, JobCardStatus.ASSIGNED, JobCardStatus.IN_PROGRESS, userId, 'Job started');
    await this.logActivity(userId, 'JOB_CARD_STARTED', id, jobCard.jobCardNo);
    return this.findOne(id);
  }

  async hold(id: string, userId: string, remarks?: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.ON_HOLD);

    jobCard.currentStatus = JobCardStatus.ON_HOLD;
    jobCard.updatedBy = userId;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, JobCardStatus.IN_PROGRESS, JobCardStatus.ON_HOLD, userId, remarks || 'Job put on hold');
    return this.findOne(id);
  }

  async waitingForParts(id: string, userId: string, remarks?: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.WAITING_FOR_PARTS);

    jobCard.currentStatus = JobCardStatus.WAITING_FOR_PARTS;
    jobCard.updatedBy = userId;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, JobCardStatus.IN_PROGRESS, JobCardStatus.WAITING_FOR_PARTS, userId, remarks || 'Waiting for parts');
    return this.findOne(id);
  }

  async resumeFromHold(id: string, userId: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.IN_PROGRESS);

    const previousStatus = jobCard.currentStatus;
    jobCard.currentStatus = JobCardStatus.IN_PROGRESS;
    jobCard.updatedBy = userId;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, previousStatus, JobCardStatus.IN_PROGRESS, userId, 'Job resumed');
    return this.findOne(id);
  }

  async complete(id: string, dto: { diagnosis?: string; correctiveAction?: string; preventiveAction?: string; rootCauseCategoryId?: string; failureCategoryId?: string; remarks?: string }, userId: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.COMPLETED);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      jobCard.currentStatus = JobCardStatus.COMPLETED;
      jobCard.completedAt = new Date();
      jobCard.completedBy = userId;
      jobCard.diagnosis = dto.diagnosis || jobCard.diagnosis;
      jobCard.correctiveAction = dto.correctiveAction || jobCard.correctiveAction;
      jobCard.preventiveAction = dto.preventiveAction || jobCard.preventiveAction;
      jobCard.rootCauseCategoryId = dto.rootCauseCategoryId || jobCard.rootCauseCategoryId;
      jobCard.failureCategoryId = dto.failureCategoryId || jobCard.failureCategoryId;
      jobCard.remarks = dto.remarks || jobCard.remarks;
      jobCard.updatedBy = userId;

      if (jobCard.downtimeStart) {
        const start = new Date(jobCard.downtimeStart);
        const end = new Date();
        jobCard.downtimeEnd = end;
        jobCard.downtimeMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
      }

      await queryRunner.manager.save(jobCard);

      const history = queryRunner.manager.create(MaintenanceJobCardStatusHistory, {
        jobCardId: id,
        fromStatus: JobCardStatus.IN_PROGRESS,
        toStatus: JobCardStatus.COMPLETED,
        changedBy: userId,
        remarks: dto.remarks || 'Job completed',
      });
      await queryRunner.manager.save(history);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.logActivity(userId, 'JOB_CARD_COMPLETED', id, jobCard.jobCardNo);
    return this.findOne(id);
  }

  async close(id: string, userId: string, remarks?: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.CLOSED);

    jobCard.currentStatus = JobCardStatus.CLOSED;
    jobCard.closedAt = new Date();
    jobCard.closedBy = userId;
    jobCard.updatedBy = userId;
    if (remarks) jobCard.remarks = remarks;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, JobCardStatus.COMPLETED, JobCardStatus.CLOSED, userId, remarks || 'Job closed');
    return this.findOne(id);
  }

  async verify(id: string, userId: string, remarks?: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.VERIFIED);

    jobCard.currentStatus = JobCardStatus.VERIFIED;
    jobCard.verifiedAt = new Date();
    jobCard.verifiedBy = userId;
    jobCard.updatedBy = userId;
    if (remarks) jobCard.remarks = remarks;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, JobCardStatus.PENDING_VERIFICATION, JobCardStatus.VERIFIED, userId, remarks || 'Job verified');
    return this.findOne(id);
  }

  async approve(id: string, userId: string, remarks?: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.APPROVED);

    jobCard.currentStatus = JobCardStatus.APPROVED;
    jobCard.approvedAt = new Date();
    jobCard.approvedBy = userId;
    jobCard.updatedBy = userId;
    if (remarks) jobCard.remarks = remarks;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, JobCardStatus.VERIFIED, JobCardStatus.APPROVED, userId, remarks || 'Job approved');
    await this.logActivity(userId, 'JOB_CARD_APPROVED', id, jobCard.jobCardNo);
    return this.findOne(id);
  }

  async reject(id: string, dto: RejectJobCardDto, userId: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.REJECTED);

    jobCard.currentStatus = JobCardStatus.REJECTED;
    jobCard.updatedBy = userId;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, JobCardStatus.PENDING_VERIFICATION, JobCardStatus.REJECTED, userId, dto.reason);
    await this.logActivity(userId, 'JOB_CARD_REJECTED', id, jobCard.jobCardNo);
    return this.findOne(id);
  }

  async submitForVerification(id: string, userId: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.PENDING_VERIFICATION);

    jobCard.currentStatus = JobCardStatus.PENDING_VERIFICATION;
    jobCard.updatedBy = userId;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, JobCardStatus.CLOSED, JobCardStatus.PENDING_VERIFICATION, userId, 'Submitted for verification');
    return this.findOne(id);
  }

  async addPart(id: string, dto: AddJobCardPartDto, userId: string): Promise<MaintenanceJobCardPart> {
    const jobCard = await this.findOne(id);
    if (jobCard.currentStatus === JobCardStatus.APPROVED) {
      throw new BadRequestException('Cannot add parts to an approved job card');
    }

    const part = this.partRepo.create({
      jobCardId: id,
      itemId: dto.itemId,
      quantity: dto.quantity,
      uomId: dto.uomId,
      unitCost: dto.unitCost || null,
      totalCost: dto.unitCost ? dto.unitCost * dto.quantity : null,
      issuedFrom: dto.issuedFrom || null,
      issuedAt: new Date(),
      issuedBy: userId,
      remarks: dto.remarks || null,
    });
    return this.partRepo.save(part);
  }

  async removePart(jobCardId: string, partId: string): Promise<void> {
    await this.partRepo.delete({ id: partId, jobCardId });
  }

  async getParts(jobCardId: string): Promise<MaintenanceJobCardPart[]> {
    return this.partRepo.find({
      where: { jobCardId },
      relations: ['item', 'uom', 'issuedFromWarehouse'],
      order: { createdAt: 'ASC' },
    });
  }

  async addWorkLog(id: string, dto: AddWorkLogDto, userId: string): Promise<MaintenanceJobCardWorkLog> {
    const workLog = this.workLogRepo.create({
      jobCardId: id,
      technicianUserId: dto.technicianUserId || userId,
      startedAt: dto.startedAt ? new Date(dto.startedAt) : null,
      endedAt: dto.endedAt ? new Date(dto.endedAt) : null,
      durationMinutes: dto.startedAt && dto.endedAt
        ? Math.round((new Date(dto.endedAt).getTime() - new Date(dto.startedAt).getTime()) / 60000)
        : null,
      workDescription: dto.workDescription,
      remarks: dto.remarks || null,
    });
    return this.workLogRepo.save(workLog);
  }

  async getWorkLogs(jobCardId: string): Promise<MaintenanceJobCardWorkLog[]> {
    return this.workLogRepo.find({
      where: { jobCardId },
      relations: ['technicianUser'],
      order: { createdAt: 'ASC' },
    });
  }

  async addAttachment(id: string, dto: { fileName: string; fileUrl: string; mimeType?: string; fileSize?: number; description?: string }, userId: string): Promise<MaintenanceJobCardAttachment> {
    const attachment = this.attachmentRepo.create({
      jobCardId: id,
      fileName: dto.fileName,
      fileUrl: dto.fileUrl,
      mimeType: dto.mimeType || null,
      fileSize: dto.fileSize || null,
      uploadedBy: userId,
      description: dto.description || null,
    });
    return this.attachmentRepo.save(attachment);
  }

  async getAttachments(jobCardId: string): Promise<MaintenanceJobCardAttachment[]> {
    return this.attachmentRepo.find({
      where: { jobCardId },
      order: { uploadedAt: 'ASC' },
    });
  }

  async getHistory(jobCardId: string): Promise<MaintenanceJobCardStatusHistory[]> {
    return this.historyRepo.find({
      where: { jobCardId },
      relations: ['changedByUser'],
      order: { changedAt: 'ASC' },
    });
  }

  async getTechnicians(jobCardId: string): Promise<MaintenanceJobCardTechnician[]> {
    return this.technicianRepo.find({
      where: { jobCardId },
      relations: ['technicianUser'],
      order: { assignedAt: 'ASC' },
    });
  }

  async getMachineHistory(machineId: string): Promise<MaintenanceJobCard[]> {
    return this.jobCardRepo.find({
      where: { machineId, isActive: true },
      relations: ['requestedByUser'],
      order: { requestedAt: 'DESC' },
      take: 50,
    });
  }

  async getDashboard(companyId: string): Promise<any> {
    const qb = this.jobCardRepo.createQueryBuilder('jc');
    qb.where('jc.companyId = :companyId', { companyId });
    qb.andWhere('jc.isActive = true');

    const total = await qb.getCount();
    const open = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.OPEN }).getCount();
    const assigned = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.ASSIGNED }).getCount();
    const inProgress = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.IN_PROGRESS }).getCount();
    const onHold = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.ON_HOLD }).getCount();
    const waitingForParts = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.WAITING_FOR_PARTS }).getCount();
    const completed = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.COMPLETED }).getCount();
    const pendingVerification = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.PENDING_VERIFICATION }).getCount();
    const approved = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.APPROVED }).getCount();
    const critical = await qb.clone().andWhere('jc.priority = :p AND jc.currentStatus NOT IN (:...done)', { p: 'CRITICAL', done: [JobCardStatus.APPROVED, JobCardStatus.REJECTED] }).getCount();

    return {
      total, open, assigned, inProgress, onHold, waitingForParts,
      completed, pendingVerification, approved, critical,
    };
  }

  private validateTransition(current: JobCardStatus, target: JobCardStatus): void {
    const allowed = VALID_TRANSITIONS[current];
    if (!allowed || !allowed.includes(target)) {
      throw new BadRequestException(`Cannot transition from '${current}' to '${target}'`);
    }
  }

  private async recordHistory(jobCardId: string, fromStatus: string | null, toStatus: string, changedBy: string, remarks?: string): Promise<void> {
    const history = this.historyRepo.create({
      jobCardId,
      fromStatus,
      toStatus,
      changedBy,
      remarks: remarks || null,
    });
    await this.historyRepo.save(history);
  }

  private async generateJobCardNo(companyId: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `JC-${year}${month}-`;

    const lastCard = await this.jobCardRepo
      .createQueryBuilder('jc')
      .where('jc.jobCardNo LIKE :prefix', { prefix: `${prefix}%` })
      .andWhere('jc.companyId = :companyId', { companyId })
      .orderBy('jc.jobCardNo', 'DESC')
      .getOne();

    let seq = 1;
    if (lastCard) {
      const lastSeq = parseInt(lastCard.jobCardNo.split('-').pop() || '0', 10);
      seq = lastSeq + 1;
    }

    return `${prefix}${seq.toString().padStart(4, '0')}`;
  }

  private async logActivity(userId: string, action: string, targetId: string, targetName: string): Promise<void> {
    try {
      const user = await this.userRepo.findOne({ where: { id: userId }, select: ['email'] });
      const { ActivityLogService } = await import('../../audit/services/activity-log.service');
    } catch {
      // Activity logging is best-effort
    }
  }
}
