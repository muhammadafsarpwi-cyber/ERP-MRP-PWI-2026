import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { MaintenanceJobCard } from '../entities/maintenance-job-card.entity';
import { MaintenanceJobCardTechnician } from '../entities/maintenance-job-card-technician.entity';
import { MaintenanceJobCardPart } from '../entities/maintenance-job-card-part.entity';
import { MaintenanceJobCardAttachment } from '../entities/maintenance-job-card-attachment.entity';
import { MaintenanceJobCardStatusHistory } from '../entities/maintenance-job-card-status-history.entity';
import { MaintenanceJobCardWorkLog } from '../entities/maintenance-job-card-work-log.entity';
import { Machine } from '../../production/entities/machine.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { MaintenanceComplaintCategory } from '../entities/maintenance-complaint-category.entity';
import { MaintenanceFailureCategory } from '../entities/maintenance-failure-category.entity';
import { MaintenanceRootCauseCategory } from '../entities/maintenance-root-cause-category.entity';
import { JobCardStatus, MaintenanceType, VALID_TRANSITIONS } from '../enums';
import { ActivityLogService } from '../../audit/services/activity-log.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { StockLedger } from '../../inventory/entities/stock-ledger.entity';
import { InventoryBalance } from '../../inventory/entities/inventory-balance.entity';
import { InventoryPolicy } from '../../inventory/entities/inventory-policy.entity';
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
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(MaintenanceComplaintCategory)
    private readonly complaintCategoryRepo: Repository<MaintenanceComplaintCategory>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
    @InjectRepository(MaintenanceFailureCategory)
    private readonly failureCategoryRepo: Repository<MaintenanceFailureCategory>,
    @InjectRepository(MaintenanceRootCauseCategory)
    private readonly rootCauseCategoryRepo: Repository<MaintenanceRootCauseCategory>,
    private readonly dataSource: DataSource,
    private readonly activityLog: ActivityLogService,
    private readonly inventoryBalanceService: InventoryBalanceService,
  ) {}

  async create(dto: CreateJobCardDto, userId: string): Promise<MaintenanceJobCard> {
    const erpUser = await this.userRepo.findOne({ where: { authUserId: userId, isActive: true } });
    if (!erpUser) {
      throw new NotFoundException('ERP user profile not found for the authenticated account');
    }
    const erpUserId = erpUser.id;
    const machine = await this.machineRepo.findOne({ where: { id: dto.machineId, isActive: true } });
    if (!machine) {
      throw new NotFoundException(`Machine with ID '${dto.machineId}' not found`);
    }
    if (machine.companyId !== dto.companyId) {
      throw new BadRequestException('Selected machine does not belong to the selected company');
    }
    if (machine.divisionId !== dto.divisionId || machine.sectionId !== dto.sectionId) {
      throw new BadRequestException('Selected machine does not belong to the selected division and section');
    }

    const division = await this.divisionRepo.findOne({ where: { id: dto.divisionId, isActive: true } });
    if (!division) throw new NotFoundException(`Division with ID '${dto.divisionId}' not found`);
    if (division.companyId !== dto.companyId) throw new BadRequestException('Selected division does not belong to the selected company');

    const section = await this.sectionRepo.findOne({ where: { id: dto.sectionId, isActive: true } });
    if (!section) throw new NotFoundException(`Section with ID '${dto.sectionId}' not found`);
    if (section.divisionId !== dto.divisionId) throw new BadRequestException('Selected section does not belong to the selected division');

    if (dto.assignedDepartmentId) {
      const department = await this.departmentRepo.findOne({ where: { id: dto.assignedDepartmentId, isActive: true } });
      if (!department) {
        throw new NotFoundException(`Department with ID '${dto.assignedDepartmentId}' not found`);
      }
      if (department.companyId !== dto.companyId || (department.divisionId && department.divisionId !== dto.divisionId) || (department.sectionId && department.sectionId !== dto.sectionId)) {
        throw new BadRequestException('Selected department does not belong to the selected machine organization context');
      }
    }

    if (dto.complaintCategoryId) {
      const category = await this.complaintCategoryRepo.findOne({ where: { id: dto.complaintCategoryId, isActive: true } });
      if (!category) {
        throw new NotFoundException(`Complaint category with ID '${dto.complaintCategoryId}' not found`);
      }
      if (category.companyId && category.companyId !== dto.companyId) {
        throw new BadRequestException('Selected complaint category does not belong to the selected company');
      }
    }
    if (dto.failureCategoryId) {
      const failureCategory = await this.failureCategoryRepo.findOne({ where: { id: dto.failureCategoryId, isActive: true } });
      if (!failureCategory) throw new NotFoundException(`Failure category with ID '${dto.failureCategoryId}' not found`);
      if (failureCategory.companyId && failureCategory.companyId !== dto.companyId) throw new BadRequestException('Selected failure category does not belong to the selected company');
    }
    if (dto.rootCauseCategoryId) {
      const rootCause = await this.rootCauseCategoryRepo.findOne({ where: { id: dto.rootCauseCategoryId, isActive: true } });
      if (!rootCause) throw new NotFoundException(`Root cause category with ID '${dto.rootCauseCategoryId}' not found`);
      if (rootCause.companyId && rootCause.companyId !== dto.companyId) throw new BadRequestException('Selected root cause category does not belong to the selected company');
    }

    const jobCardNo = await this.generateJobCardNo(dto.companyId);

    const jobCard = this.jobCardRepo.create({
      companyId: dto.companyId,
      divisionId: dto.divisionId,
      sectionId: dto.sectionId,
      jobCardNo,
      machineId: dto.machineId,
      complaint: dto.complaint,
      priority: dto.priority || ('MEDIUM' as any),
      maintenanceType: dto.maintenanceType || MaintenanceType.BREAKDOWN,
      complaintCategoryId: dto.complaintCategoryId || null,
      failureCategoryId: dto.failureCategoryId || null,
      rootCauseCategoryId: dto.rootCauseCategoryId || null,
      assignedDepartmentId: dto.assignedDepartmentId || machine.departmentId || null,
      description: dto.description || null,
      requestedBy: dto.requestedBy || erpUserId,
      requestedAt: new Date(),
      currentStatus: JobCardStatus.OPEN,
      createdBy: erpUserId,
      updatedBy: erpUserId,
    });

    const saved = await this.jobCardRepo.save(jobCard);

    await this.recordHistory(saved.id, null, JobCardStatus.OPEN, erpUserId, 'Job card created');
    await this.logActivity(userId, 'JOB_CARD_CREATED', saved.id, jobCardNo);

    return this.findOne(saved.id);
  }

  async findAll(query: JobCardQueryDto): Promise<{ data: MaintenanceJobCard[]; total: number }> {
    const { page = 1, limit = 20, search, companyId, machineId, divisionId, sectionId, assignedDepartmentId, currentStatus, priority, maintenanceType, technicianUserId, dateFrom, dateTo } = query;

    const qb = this.jobCardRepo.createQueryBuilder('jc');
    qb.leftJoinAndSelect('jc.machine', 'machine');
    qb.leftJoinAndSelect('jc.division', 'division');
    qb.leftJoinAndSelect('jc.section', 'section');
    qb.leftJoinAndSelect('jc.assignedDepartment', 'department');
    qb.leftJoinAndSelect('jc.requestedByUser', 'requester');
    qb.leftJoinAndSelect('jc.company', 'company');

    if (companyId) {
      qb.andWhere('jc.companyId = :companyId', { companyId });
    }
    if (machineId) {
      qb.andWhere('jc.machineId = :machineId', { machineId });
    }
    if (divisionId) qb.andWhere('machine.divisionId = :divisionId', { divisionId });
    if (sectionId) qb.andWhere('machine.sectionId = :sectionId', { sectionId });
    if (assignedDepartmentId) {
      qb.andWhere('jc.assignedDepartmentId = :assignedDepartmentId', { assignedDepartmentId });
    }
    if (currentStatus) {
      qb.andWhere('jc.currentStatus = :currentStatus', { currentStatus });
    }
    if (priority) {
      qb.andWhere('jc.priority = :priority', { priority });
    }
    if (maintenanceType) {
      qb.andWhere('jc.maintenanceType = :maintenanceType', { maintenanceType });
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
        'division', 'section', 'machine', 'machine.division', 'machine.section', 'machine.department', 'assignedDepartment', 'requestedByUser', 'complaintCategory', 'rootCauseCategory', 'failureCategory',
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
    const effectiveMachineId = dto.machineId || jobCard.machineId;
    const effectiveDivisionId = dto.divisionId || jobCard.divisionId;
    const effectiveSectionId = dto.sectionId || jobCard.sectionId;
    if (dto.machineId || dto.divisionId || dto.sectionId || dto.assignedDepartmentId) {
      const machine = await this.machineRepo.findOne({ where: { id: effectiveMachineId, isActive: true } });
      if (!machine) throw new NotFoundException(`Machine with ID '${effectiveMachineId}' not found`);
      if (machine.companyId !== jobCard.companyId || machine.divisionId !== effectiveDivisionId || machine.sectionId !== effectiveSectionId) {
        throw new BadRequestException('Selected machine does not belong to the selected organization context');
      }
      const departmentId = dto.assignedDepartmentId || jobCard.assignedDepartmentId;
      if (departmentId) {
        const department = await this.departmentRepo.findOne({ where: { id: departmentId, isActive: true } });
        if (!department) throw new NotFoundException(`Department with ID '${departmentId}' not found`);
        if (department.companyId !== jobCard.companyId || (department.divisionId && department.divisionId !== effectiveDivisionId) || (department.sectionId && department.sectionId !== effectiveSectionId)) {
          throw new BadRequestException('Selected department does not belong to the selected organization context');
        }
      }
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
    const previousStatus = jobCard.currentStatus;

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
        fromStatus: previousStatus,
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
    const previousStatus = jobCard.currentStatus;

    jobCard.currentStatus = JobCardStatus.ON_HOLD;
    jobCard.updatedBy = userId;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, previousStatus, JobCardStatus.ON_HOLD, userId, remarks || 'Job put on hold');
    await this.logActivity(userId, 'JOB_CARD_ON_HOLD', id, jobCard.jobCardNo);
    return this.findOne(id);
  }

  async waitingForParts(id: string, userId: string, remarks?: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.WAITING_FOR_PARTS);
    const previousStatus = jobCard.currentStatus;

    jobCard.currentStatus = JobCardStatus.WAITING_FOR_PARTS;
    jobCard.updatedBy = userId;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, previousStatus, JobCardStatus.WAITING_FOR_PARTS, userId, remarks || 'Waiting for parts');
    await this.logActivity(userId, 'JOB_CARD_WAITING_FOR_PARTS', id, jobCard.jobCardNo);
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
    await this.logActivity(userId, 'JOB_CARD_RESUMED', id, jobCard.jobCardNo);
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
    await this.logActivity(userId, 'JOB_CARD_CLOSED', id, jobCard.jobCardNo);
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
    await this.logActivity(userId, 'JOB_CARD_VERIFIED', id, jobCard.jobCardNo);
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
    await this.logActivity(userId, 'JOB_CARD_SUBMITTED_FOR_VERIFICATION', id, jobCard.jobCardNo);
    return this.findOne(id);
  }

  async addPart(id: string, dto: AddJobCardPartDto, userId: string): Promise<MaintenanceJobCardPart> {
    const jobCard = await this.findOne(id);
    if (jobCard.currentStatus === JobCardStatus.APPROVED) {
      throw new BadRequestException('Cannot add parts to an approved job card');
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      if (dto.issuedFrom) {
        await this.writeStockMovementTx(manager, {
          companyId: jobCard.companyId,
          transactionType: 'MAINTENANCE_ISSUE',
          itemId: dto.itemId,
          warehouseId: dto.issuedFrom,
          quantity: dto.quantity,
          uomId: dto.uomId,
          direction: 'OUT',
          referenceType: 'JOB_CARD',
          referenceId: id,
          referenceNumber: jobCard.jobCardNo,
          notes: `Spare part issued for job card ${jobCard.jobCardNo}`,
          createdBy: userId,
        });
      }

      const part = manager.create(MaintenanceJobCardPart, {
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
      return manager.save(part);
    });

    await this.logActivity(userId, 'JOB_CARD_PART_ADDED', id, jobCard.jobCardNo);
    return saved;
  }

  async removePart(jobCardId: string, partId: string, userId?: string): Promise<void> {
    const part = await this.partRepo.findOne({ where: { id: partId, jobCardId } });
    if (!part) throw new NotFoundException(`Spare part '${partId}' not found in job card '${jobCardId}'`);

    const jobCard = await this.findOne(jobCardId);
    const issuedFrom = part.issuedFrom;

    if (issuedFrom) {
      await this.dataSource.transaction(async (manager) => {
        await this.writeStockMovementTx(manager, {
          companyId: jobCard.companyId,
          transactionType: 'MAINTENANCE_RETURN',
          itemId: part.itemId,
          warehouseId: issuedFrom,
          quantity: part.quantity,
          uomId: part.uomId,
          direction: 'IN',
          referenceType: 'JOB_CARD',
          referenceId: jobCardId,
          referenceNumber: jobCard.jobCardNo,
          notes: `Spare part returned from job card ${jobCard.jobCardNo}`,
          createdBy: userId || 'system',
        });
        await manager.getRepository(MaintenanceJobCardPart).delete({ id: partId, jobCardId });
      });
    } else {
      await this.partRepo.delete({ id: partId, jobCardId });
    }

    if (userId) {
      await this.logActivity(userId, 'JOB_CARD_PART_REMOVED', jobCardId, jobCard.jobCardNo);
    }
  }

  async getParts(jobCardId: string): Promise<MaintenanceJobCardPart[]> {
    return this.partRepo.find({
      where: { jobCardId },
      relations: ['item', 'uom', 'issuedFromWarehouse'],
      order: { createdAt: 'ASC' },
    });
  }

  private async writeStockMovementTx(
    manager: EntityManager,
    params: {
      companyId: string;
      transactionType: string;
      itemId: string;
      warehouseId: string;
      quantity: number;
      uomId: string;
      direction: 'IN' | 'OUT';
      referenceType: string;
      referenceId: string;
      referenceNumber: string;
      notes: string;
      createdBy: string;
    },
  ): Promise<void> {
    const ledgerRepo = manager.getRepository(StockLedger);
    const balanceRepo = manager.getRepository(InventoryBalance);
    const policyRepo = manager.getRepository(InventoryPolicy);

    const ledger = ledgerRepo.create({
      companyId: params.companyId,
      transactionType: params.transactionType,
      transactionDate: new Date(),
      itemId: params.itemId,
      warehouseId: params.warehouseId,
      locationId: null,
      quantity: params.quantity,
      uomId: params.uomId,
      direction: params.direction,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      referenceNumber: params.referenceNumber,
      batchId: null,
      serialNumber: null,
      notes: params.notes,
      createdBy: params.createdBy,
    });
    await ledgerRepo.save(ledger);

    let balance = await balanceRepo.findOne({
      where: {
        companyId: params.companyId,
        itemId: params.itemId,
        warehouseId: params.warehouseId,
      },
    });

    if (!balance) {
      balance = balanceRepo.create({
        companyId: params.companyId,
        itemId: params.itemId,
        warehouseId: params.warehouseId,
        locationId: null,
        batchId: null,
        uomId: params.uomId,
        onHand: 0,
        reserved: 0,
        available: 0,
        status: 'ACTIVE',
      });
    }

    if (params.direction === 'IN') {
      balance.onHand = Number(balance.onHand) + params.quantity;
      balance.available = Number(balance.available) + params.quantity;
    } else {
      const newOnHand = Number(balance.onHand) - params.quantity;
      const newAvailable = Number(balance.available) - params.quantity;

      if (newOnHand < 0) {
        const policy = await policyRepo.findOne({
          where: { companyId: params.companyId, itemId: params.itemId, warehouseId: params.warehouseId },
        });
        if (!policy || !policy.allowNegativeStock) {
          throw new BadRequestException(
            `Insufficient stock. Available: ${balance.onHand}, requested: ${params.quantity}`,
          );
        }
      }

      balance.onHand = newOnHand;
      balance.available = newAvailable;
    }

    await balanceRepo.save(balance);
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
    const saved = await this.workLogRepo.save(workLog);
    const jobCard = await this.findOne(id);
    await this.logActivity(userId, 'JOB_CARD_WORK_LOG_ADDED', id, jobCard.jobCardNo);
    return saved;
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
    const saved = await this.attachmentRepo.save(attachment);
    const jobCard = await this.findOne(id);
    await this.logActivity(userId, 'JOB_CARD_ATTACHMENT_ADDED', id, jobCard.jobCardNo);
    return saved;
  }

  async getAttachments(jobCardId: string): Promise<MaintenanceJobCardAttachment[]> {
    return this.attachmentRepo.find({
      where: { jobCardId },
      order: { uploadedAt: 'ASC' },
    });
  }

  async checkStock(companyId: string, itemId: string, warehouseId?: string): Promise<any> {
    if (warehouseId) {
      const balance = await this.inventoryBalanceService.findByItemWarehouse(companyId, itemId, warehouseId);
      const onHand = balance ? Number(balance.onHand) : 0;
      const reserved = balance ? Number(balance.reserved) : 0;
      return { balances: balance ? [balance] : [], totalOnHand: onHand, totalReserved: reserved, totalAvailable: onHand - reserved };
    }
    const result = await this.inventoryBalanceService.findAll({ companyId, itemId, limit: 100 });
    const balances = result.data;
    const totalOnHand = balances.reduce((sum, b) => sum + Number(b.onHand || 0), 0);
    const totalReserved = balances.reduce((sum, b) => sum + Number(b.reserved || 0), 0);
    const totalAvailable = balances.reduce((sum, b) => sum + Number(b.available || 0), 0);
    return { balances, totalOnHand, totalReserved, totalAvailable };
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

  async getMachineStats(machineId: string): Promise<any> {
    const machine = await this.machineRepo.findOne({ where: { id: machineId }, relations: ['company', 'division', 'section', 'department'] });
    if (!machine) throw new NotFoundException(`Machine '${machineId}' not found`);

    const total = await this.jobCardRepo.count({ where: { machineId, isActive: true } });
    const approved = await this.jobCardRepo.count({ where: { machineId, isActive: true, currentStatus: JobCardStatus.APPROVED } });
    const inProgress = await this.jobCardRepo.count({ where: { machineId, isActive: true, currentStatus: JobCardStatus.IN_PROGRESS } });
    const completed = await this.jobCardRepo.count({ where: { machineId, isActive: true, currentStatus: JobCardStatus.COMPLETED } });

    const downtimeResult = await this.jobCardRepo
      .createQueryBuilder('jc')
      .select('SUM(jc.downtimeMinutes)', 'totalDowntimeMinutes')
      .addSelect('AVG(jc.downtimeMinutes)', 'avgDowntimeMinutes')
      .addSelect('COUNT(CASE WHEN jc.maintenanceType = :bt THEN 1 END)', 'breakdownCount')
      .addSelect('COUNT(CASE WHEN jc.maintenanceType = :pt THEN 1 END)', 'preventiveCount')
      .addSelect('COUNT(CASE WHEN jc.maintenanceType = :ct THEN 1 END)', 'correctiveCount')
      .addSelect('COUNT(CASE WHEN jc.maintenanceType = :it THEN 1 END)', 'inspectionCount')
      .addSelect('COUNT(CASE WHEN jc.maintenanceType = :et THEN 1 END)', 'emergencyCount')
      .where('jc.machineId = :machineId', { machineId })
      .andWhere('jc.isActive = true')
      .setParameters({ bt: 'BREAKDOWN', pt: 'PREVENTIVE', ct: 'CORRECTIVE', it: 'INSPECTION', et: 'EMERGENCY' })
      .getRawOne();

    const byType = {
      breakdown: parseInt(downtimeResult?.breakdownCount || '0', 10),
      preventive: parseInt(downtimeResult?.preventiveCount || '0', 10),
      corrective: parseInt(downtimeResult?.correctiveCount || '0', 10),
      inspection: parseInt(downtimeResult?.inspectionCount || '0', 10),
      emergency: parseInt(downtimeResult?.emergencyCount || '0', 10),
    };

    const recentCards = await this.jobCardRepo.find({
      where: { machineId, isActive: true },
      order: { requestedAt: 'DESC' },
      take: 10,
    });

    let mtbf = 0;
    if (approved > 1) {
      const approvedCards = await this.jobCardRepo.find({
        where: { machineId, isActive: true, currentStatus: JobCardStatus.APPROVED },
        order: { requestedAt: 'ASC' },
      });
      let totalMinutesBetween = 0;
      for (let i = 1; i < approvedCards.length; i++) {
        const prev = new Date(approvedCards[i - 1].requestedAt).getTime();
        const curr = new Date(approvedCards[i].requestedAt).getTime();
        totalMinutesBetween += (curr - prev) / 60000;
      }
      mtbf = Math.round(totalMinutesBetween / (approvedCards.length - 1) / 60);
    }

    return {
      machine,
      total,
      approved,
      inProgress,
      completed,
      totalDowntimeMinutes: parseInt(downtimeResult?.totalDowntimeMinutes || '0', 10),
      avgDowntimeMinutes: Math.round(parseFloat(downtimeResult?.avgDowntimeMinutes || '0')),
      mtbfHours: mtbf,
      byType,
      recentCards,
    };
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

    const byMaintenanceType = await this.jobCardRepo
      .createQueryBuilder('jc')
      .select('jc.maintenanceType', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('jc.companyId = :companyId', { companyId })
      .andWhere('jc.isActive = true')
      .andWhere('jc.currentStatus NOT IN (:...done)', { done: [JobCardStatus.APPROVED, JobCardStatus.REJECTED] })
      .groupBy('jc.maintenanceType')
      .getRawMany();

    return {
      total, open, assigned, inProgress, onHold, waitingForParts,
      completed, pendingVerification, approved, critical,
      byMaintenanceType,
    };
  }

  async getChartData(companyId: string): Promise<any> {
    const typeBreakdown = await this.jobCardRepo
      .createQueryBuilder('jc')
      .select('jc.maintenanceType', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('jc.companyId = :companyId', { companyId })
      .andWhere('jc.isActive = true')
      .groupBy('jc.maintenanceType')
      .getRawMany();

    const priorityBreakdown = await this.jobCardRepo
      .createQueryBuilder('jc')
      .select('jc.priority', 'priority')
      .addSelect('COUNT(*)', 'count')
      .where('jc.companyId = :companyId', { companyId })
      .andWhere('jc.isActive = true')
      .andWhere('jc.currentStatus NOT IN (:...done)', { done: [JobCardStatus.APPROVED, JobCardStatus.REJECTED] })
      .groupBy('jc.priority')
      .getRawMany();

    const monthlyTrend = await this.jobCardRepo
      .createQueryBuilder('jc')
      .select("TO_CHAR(jc.requestedAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(CASE WHEN jc.currentStatus = :approved THEN 1 ELSE 0 END)', 'completed')
      .addSelect('SUM(CASE WHEN jc.maintenanceType = :bt THEN 1 ELSE 0 END)', 'breakdowns')
      .where('jc.companyId = :companyId', { companyId })
      .andWhere('jc.isActive = true')
      .andWhere('jc.requestedAt >= NOW() - INTERVAL \'12 months\'')
      .setParameters({ approved: JobCardStatus.APPROVED, bt: 'BREAKDOWN' })
      .groupBy("TO_CHAR(jc.requestedAt, 'YYYY-MM')")
      .orderBy("TO_CHAR(jc.requestedAt, 'YYYY-MM')", 'ASC')
      .getRawMany();

    const statusBreakdown = await this.jobCardRepo
      .createQueryBuilder('jc')
      .select('jc.currentStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('jc.companyId = :companyId', { companyId })
      .andWhere('jc.isActive = true')
      .groupBy('jc.currentStatus')
      .getRawMany();

    const avgDowntime = await this.jobCardRepo
      .createQueryBuilder('jc')
      .select('AVG(jc.downtimeMinutes)', 'avgDowntime')
      .addSelect('SUM(jc.downtimeMinutes)', 'totalDowntime')
      .where('jc.companyId = :companyId', { companyId })
      .andWhere('jc.isActive = true')
      .andWhere('jc.downtimeMinutes IS NOT NULL')
      .getRawOne();

    return {
      typeBreakdown,
      priorityBreakdown,
      monthlyTrend,
      statusBreakdown,
      avgDowntimeMinutes: Math.round(parseFloat(avgDowntime?.avgDowntime || '0')),
      totalDowntimeMinutes: parseInt(avgDowntime?.totalDowntime || '0', 10),
    };
  }

  async getReports(companyId: string): Promise<any> {
    const topProblemMachines = await this.jobCardRepo
      .createQueryBuilder('jc')
      .leftJoin('jc.machine', 'machine')
      .select('machine.id', 'machineId')
      .addSelect('machine.machine_name', 'machineName')
      .addSelect('machine.machine_code', 'machineCode')
      .addSelect('COUNT(*)', 'jobCount')
      .addSelect('SUM(CASE WHEN jc.currentStatus = :approved THEN 1 ELSE 0 END)', 'approvedCount')
      .addSelect('SUM(jc.downtimeMinutes)', 'totalDowntime')
      .where('jc.companyId = :companyId', { companyId })
      .andWhere('jc.isActive = true')
      .setParameters({ approved: JobCardStatus.APPROVED })
      .groupBy('machine.id')
      .addGroupBy('machine.machine_name')
      .addGroupBy('machine.machine_code')
      .orderBy('"jobCount"', 'DESC')
      .limit(10)
      .getRawMany();

    const downtimeByType = await this.jobCardRepo
      .createQueryBuilder('jc')
      .select('jc.maintenanceType', 'type')
      .addSelect('COUNT(*)', 'count')
      .addSelect('AVG(jc.downtimeMinutes)', 'avgDowntime')
      .addSelect('SUM(jc.downtimeMinutes)', 'totalDowntime')
      .where('jc.companyId = :companyId', { companyId })
      .andWhere('jc.isActive = true')
      .andWhere('jc.downtimeMinutes IS NOT NULL')
      .groupBy('jc.maintenanceType')
      .getRawMany();

    const mtbfByMachine = await this.jobCardRepo
      .createQueryBuilder('jc')
      .leftJoin('jc.machine', 'machine')
      .select('machine.id', 'machineId')
      .addSelect('machine.machine_name', 'machineName')
      .addSelect('COUNT(*)', 'totalJobs')
      .where('jc.companyId = :companyId', { companyId })
      .andWhere('jc.isActive = true')
      .andWhere('jc.currentStatus = :approved')
      .setParameters({ approved: JobCardStatus.APPROVED })
      .groupBy('machine.id')
      .addGroupBy('machine.machine_name')
      .having('COUNT(*) > 1')
      .getRawMany();

    return { topProblemMachines, downtimeByType, mtbfByMachine };
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
      await this.activityLog.log({
        action,
        targetType: 'maintenance_job_cards',
        targetId,
        targetName,
        actorUserId: userId,
        details: `Job Card: ${targetName}`,
      });
    } catch {
      // Activity logging is best-effort
    }
  }
}
