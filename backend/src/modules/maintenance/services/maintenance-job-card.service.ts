import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
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
import { MaintenanceTechnician } from '../entities/maintenance-technician.entity';
import { MaintenanceTeam } from '../entities/maintenance-team.entity';
import { JobCardStatus, MaintenanceType, VALID_TRANSITIONS } from '../enums';
import { ActivityLogService } from '../../audit/services/activity-log.service';
import { MaintenanceUserResolverService } from './maintenance-user-resolver.service';
import { NotificationEngineService } from '../../notification/notification-engine.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { StockLedger } from '../../inventory/entities/stock-ledger.entity';
import { InventoryBalance } from '../../inventory/entities/inventory-balance.entity';
import { InventoryPolicy } from '../../inventory/entities/inventory-policy.entity';
import {
  CreateJobCardDto,
  UpdateJobCardDto,
  AssignJobCardDto,
  StartJobCardDto,
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
    @InjectRepository(MaintenanceTechnician)
    private readonly maintenanceTechnicianRepo: Repository<MaintenanceTechnician>,
    @InjectRepository(MaintenanceTeam)
    private readonly teamRepo: Repository<MaintenanceTeam>,
    private readonly dataSource: DataSource,
    private readonly activityLog: ActivityLogService,
    private readonly inventoryBalanceService: InventoryBalanceService,
    private readonly userResolver: MaintenanceUserResolverService,
    private readonly notificationEngine: NotificationEngineService,
  ) {}

  async create(dto: CreateJobCardDto, userId: string): Promise<MaintenanceJobCard> {
    const erpUserId = await this.userResolver.resolve(userId);
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
    await this.logActivity(erpUserId, 'JOB_CARD_CREATED', saved.id, jobCardNo);
    this.emitJobCardEvent('MAINT_JOB_CARD_CREATED', saved.id, userId);

    return this.findOne(saved.id);
  }

  async importCsv(file: any, companyId: string, userId: string): Promise<any> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const fileName = (file.originalname || '').toLowerCase();
    if (!fileName.endsWith('.csv') && file.mimetype !== 'text/csv' && file.mimetype !== 'application/vnd.ms-excel') {
      throw new BadRequestException('Invalid file format. Please upload a CSV file.');
    }
    const content = file.buffer ? file.buffer.toString('utf8') : String(file.originalname || '');
    if (!content || !content.trim()) {
      throw new BadRequestException('The uploaded CSV file is empty.');
    }

    const rows = this.parseCsv(content);
    if (rows.length < 2) {
      throw new BadRequestException('CSV must contain a header row and at least one data row.');
    }

    const headers = rows[0].map(h => this.normalizeKey(h));
    const headerSet = new Set(headers);
    const machineKey = ['MACHINECODE', 'MACHINENUMBER', 'MACHINENO', 'MACHINEID', 'MACHINE']
      .find(k => headerSet.has(k));
    if (!machineKey) {
      throw new BadRequestException(
        'Missing required column "machineCode" (or "machineNumber"/"machineId"). Please include a column identifying the machine.',
      );
    }
    if (!headerSet.has('COMPLAINT')) {
      throw new BadRequestException('Missing required column "complaint".');
    }

    const erpUserId = await this.userResolver.resolve(userId);
    const now = new Date();
    const results: Array<{ row: number; status: string; message: string }> = [];
    let imported = 0;

    const cardsToSave: Partial<MaintenanceJobCard>[] = [];
    const pending: Array<{ rowIndex: number; card: Partial<MaintenanceJobCard>; jobCardNo?: string }> = [];
    const usedNumbers = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
      const raw = rows[i];
      const rowNumber = i + 1;
      const record: Record<string, string> = {};
      raw.forEach((value, idx) => { record[this.normalizeKey(headers[idx] || `col${idx}`)] = (value || '').trim(); });

      const pushError = (message: string) => results.push({ row: rowNumber, status: 'error', message });
      const card = await this.buildCardFromImport(record, companyId, erpUserId, now, machineKey, pushError);
      if (!card) continue; // an error was already pushed

      const explicitNo = record.JOBCARDNO;
      let jobCardNo: string | undefined;
      if (explicitNo) {
        if (usedNumbers.has(explicitNo)) {
          pushError(`Duplicate job card number "${explicitNo}" within the uploaded file.`);
          continue;
        }
        const dup = await this.jobCardRepo.findOne({ where: { jobCardNo: explicitNo } });
        if (dup) {
          pushError(`Duplicate job card number "${explicitNo}". This number already exists.`);
          continue;
        }
        jobCardNo = explicitNo;
        usedNumbers.add(explicitNo);
      } else {
        let candidate = await this.generateJobCardNo(companyId);
        while (usedNumbers.has(candidate)) {
          const parts = candidate.split('-');
          const seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
          candidate = `${parts.slice(0, -1).join('-')}-${seq.toString().padStart(4, '0')}`;
        }
        jobCardNo = candidate;
        usedNumbers.add(candidate);
      }
      cardsToSave.push({ ...card, jobCardNo });
      pending.push({ rowIndex: rowNumber, card: { ...card, jobCardNo }, jobCardNo });
    }

    if (cardsToSave.length > 0) {
      await this.dataSource.transaction(async (manager) => {
        for (const p of pending) {
          const saved = await manager.save(manager.create(MaintenanceJobCard, p.card));
          await manager.save(
            manager.create(MaintenanceJobCardStatusHistory, {
              jobCardId: saved.id,
              fromStatus: null,
              toStatus: JobCardStatus.OPEN,
              changedBy: erpUserId,
              remarks: 'Imported via CSV',
            }),
          );
          imported += 1;
          results.push({ row: p.rowIndex, status: 'imported', message: `Imported job card ${p.jobCardNo}` });
        }
      });
      try {
        await this.logActivity(erpUserId, 'JOB_CARDS_IMPORTED', '', `${imported} job card(s) imported`);
      } catch { /* best-effort */ }
    }

    return {
      totalRows: rows.length - 1,
      imported,
      failed: results.length - imported,
      results,
    };
  }

  private parseCsv(content: string): string[][] {
    const rows: string[][] = [];
    let field = '';
    let row: string[] = [];
    let inQuotes = false;
    const input = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const pushField = () => { row.push(field); field = ''; };
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (inQuotes) {
        if (ch === '"') {
          if (input[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        pushField();
      } else if (ch === '\n') {
        pushField();
        rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    if (field.length > 0 || row.length > 0) {
      pushField();
      rows.push(row);
    }
    return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
  }

  private normalizeKey(value: string): string {
    return (value || '').trim().toUpperCase();
  }

  private async buildCardFromImport(
    record: Record<string, string>,
    companyId: string,
    erpUserId: string,
    now: Date,
    machineKey: string,
    pushError: (message: string) => void,
  ): Promise<Partial<MaintenanceJobCard> | null> {
    const machineValue = record[machineKey] || record[machineKey.toLowerCase()];
    if (!machineValue) {
      pushError('Missing machine identifier.');
      return null;
    }
    const complaint = record.COMPLAINT;
    if (!complaint) {
      pushError('Missing required "complaint".');
      return null;
    }

    let machine: Machine | null = null;
    if (isUUID(machineValue)) {
      const m = await this.machineRepo.findOne({ where: { id: machineValue, companyId, isActive: true } });
      if (m) machine = m;
    }
    if (!machine) {
      machine = await this.machineRepo
        .createQueryBuilder('m')
        .where('m.companyId = :companyId', { companyId })
        .andWhere('m.isActive = true')
        .andWhere('(m.machine_code = :v OR m.machine_number = :v OR m.machine_name = :v OR m.machine_id = :v)', { v: machineValue })
        .getOne();
    }
    if (!machine) {
      pushError(`Invalid machine "${machineValue}". No active machine matches in the selected company.`);
      return null;
    }

    const priority = record.PRIORITY ? this.normalizePriority(record.PRIORITY) : 'MEDIUM';
    const maintenanceType = record.MAINTENANCETYPE ? this.normalizeMaintenanceType(record.MAINTENANCETYPE) : undefined;

    let assignedDepartmentId: string | null = machine.departmentId || null;
    if (record.ASSIGNEDDEPARTMENTID) {
      if (!isUUID(record.ASSIGNEDDEPARTMENTID)) {
        pushError(`Invalid assignedDepartmentId "${record.ASSIGNEDDEPARTMENTID}". Must be a valid ID.`);
        return null;
      }
      const department = await this.departmentRepo.findOne({ where: { id: record.ASSIGNEDDEPARTMENTID, isActive: true } });
      if (!department) {
        pushError(`Invalid department "${record.ASSIGNEDDEPARTMENTID}". Department not found.`);
        return null;
      }
      if (department.companyId !== companyId || (department.divisionId && department.divisionId !== machine.divisionId) || (department.sectionId && department.sectionId !== machine.sectionId)) {
        pushError('Selected department does not belong to the machine organization context.');
        return null;
      }
      assignedDepartmentId = department.id;
    }

    let requestedBy: string | null = erpUserId;
    if (record.REQUESTEDBY) {
      const requester = await this.userRepo
        .createQueryBuilder('u')
        .where('(u.email = :v OR u.id = :v)', { v: record.REQUESTEDBY })
        .getOne();
      if (requester) requestedBy = requester.id;
    }

    let requestedAt: Date = now;
    if (record.REQUESTEDAT) {
      const parsed = new Date(record.REQUESTEDAT);
      if (!Number.isNaN(parsed.getTime())) requestedAt = parsed;
    }

    const invalidFields: string[] = [];
    if (record.PRIORITY && !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(priority)) invalidFields.push('priority');
    if (record.MAINTENANCETYPE && !maintenanceType) invalidFields.push('maintenanceType');
    if (invalidFields.length) {
      pushError(`Invalid value(s): ${invalidFields.join(', ')}.`);
      return null;
    }

    return {
      companyId,
      divisionId: machine.divisionId ?? undefined,
      sectionId: machine.sectionId ?? undefined,
      machineId: machine.id,
      complaint,
      priority: priority as any,
      maintenanceType: (maintenanceType as any) || MaintenanceType.BREAKDOWN,
      assignedDepartmentId,
      description: record.DESCRIPTION || null,
      requestedBy,
      requestedAt,
      currentStatus: JobCardStatus.OPEN,
      createdBy: erpUserId,
      updatedBy: erpUserId,
    };
  }

  private normalizePriority(value: string): string {
    const v = String(value).trim().toUpperCase();
    if (v === 'CRIT' || v === 'CRITICAL') return 'CRITICAL';
    if (v === 'HIGH') return 'HIGH';
    if (v === 'LOW') return 'LOW';
    if (v === 'MED' || v === 'MEDIUM' || v === 'NORMAL' || v === 'MODERATE' || v === 'NONE') return 'MEDIUM';
    return v;
  }

  private normalizeMaintenanceType(value: string): MaintenanceType | undefined {
    const v = String(value).trim().toUpperCase();
    if (v === 'BREAKDOWN' || v === 'BREAK DOWN' || v === 'BREAKDOWN MAINTENANCE') return MaintenanceType.BREAKDOWN;
    if (v === 'PREVENTIVE' || v === 'PREVENTIVE MAINTENANCE' || v === 'PM') return MaintenanceType.PREVENTIVE;
    if (v === 'CORRECTIVE' || v === 'CORRECTIVE MAINTENANCE' || v === 'CM') return MaintenanceType.CORRECTIVE;
    if (v === 'INSPECTION' || v === 'INSPECT') return MaintenanceType.INSPECTION;
    if (v === 'EMERGENCY' || v === 'URGENT') return MaintenanceType.EMERGENCY;
    return undefined;
  }

  async findAll(query: JobCardQueryDto): Promise<{ data: MaintenanceJobCard[]; total: number }> {
    const { page = 1, limit = 20, search, companyId, machineId, divisionId, sectionId, assignedDepartmentId, currentStatus, statuses, priority, maintenanceType, technicianUserId, dateFrom, dateTo } = query;

    const qb = this.jobCardRepo.createQueryBuilder('jc');
    qb.leftJoinAndSelect('jc.machine', 'machine');
    qb.leftJoinAndSelect('jc.division', 'division');
    qb.leftJoinAndSelect('jc.section', 'section');
    qb.leftJoinAndSelect('jc.assignedDepartment', 'department');
    qb.leftJoinAndSelect('jc.requestedByUser', 'requester');
    qb.leftJoinAndSelect('jc.company', 'company');
    qb.leftJoinAndSelect('jc.technicians', 'technicians');
    qb.leftJoinAndSelect('technicians.technicianUser', 'technicianUser');
    qb.leftJoinAndSelect('technicians.technician', 'technicianMaster');

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
    // Multi-status queue filter (e.g. "Started" = OPEN,ASSIGNED). Comma
    // separated; OR semantics. Takes precedence over a single currentStatus.
    if (statuses) {
      const list = statuses.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (list.length) {
        qb.andWhere('jc.currentStatus IN (:...statuses)', { statuses: list });
      }
    } else if (currentStatus) {
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
      qb.andWhere(
        '(jc.jobCardNo ILIKE :search OR jc.complaint ILIKE :search OR machine.machineCode ILIKE :search OR machine.machineNumber ILIKE :search OR machine.name ILIKE :search OR machine.machineId ILIKE :search OR EXISTS (SELECT 1 FROM maintenance_job_card_technicians t2 LEFT JOIN erp_users u2 ON u2.id = t2.technician_user_id WHERE t2.job_card_id = jc.id AND (u2.display_name ILIKE :search OR u2.first_name ILIKE :search OR u2.last_name ILIKE :search OR u2.email ILIKE :search)))',
        { search: `%${search}%` },
      );
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
        'team',
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
    const erpUserId = await this.userResolver.resolve(userId);
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
    Object.assign(jobCard, dto, { updatedBy: erpUserId });
    await this.jobCardRepo.save(jobCard);
    return this.findOne(id);
  }

  async remove(id: string, userId: string): Promise<void> {
    const jobCard = await this.findOne(id);
    if (jobCard.currentStatus !== JobCardStatus.OPEN) {
      throw new BadRequestException('Only OPEN job cards can be deleted');
    }
    const erpUserId = await this.userResolver.resolve(userId);
    jobCard.isActive = false;
    jobCard.updatedBy = erpUserId;
    await this.jobCardRepo.save(jobCard);
  }

  async assign(id: string, dto: AssignJobCardDto, userId: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.ASSIGNED);
    const previousStatus = jobCard.currentStatus;
    const erpUserId = await this.userResolver.resolve(userId);

    if (!dto.technicianIds || !dto.technicianIds.length) {
      throw new BadRequestException('At least one technician must be selected');
    }
    const uniqueIds = Array.from(new Set(dto.technicianIds.map(t => String(t).trim()).filter(Boolean)));

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const technicians = await this.maintenanceTechnicianRepo
        .createQueryBuilder('t')
        .where('t.id IN (:...ids)', { ids: uniqueIds })
        .getMany();

      if (technicians.length !== uniqueIds.length) {
        const missing = uniqueIds.filter(u => !technicians.some(t => t.id === u));
        throw new NotFoundException(`Technician(s) not found: ${missing.join(', ')}`);
      }
      const inactive = technicians.filter(t => !t.isActive || t.status !== 'ACTIVE');
      if (inactive.length) {
        throw new BadRequestException(`Technician(s) are not active: ${inactive.map(t => `${t.employeeId} ${t.technicianName}`).join(', ')}`);
      }

      let resolvedTeamId: string | null = null;
      if (dto.teamCode) {
        const team = await this.teamRepo.findOne({ where: { code: dto.teamCode, companyId: jobCard.companyId, isActive: true } });
        if (!team) throw new NotFoundException(`Maintenance team '${dto.teamCode}' not found for this company`);
        resolvedTeamId = team.id;
      }

      await queryRunner.manager.delete(MaintenanceJobCardTechnician, { jobCardId: id });

      for (let i = 0; i < technicians.length; i++) {
        const t = technicians[i];
        const tech = queryRunner.manager.create(MaintenanceJobCardTechnician, {
          jobCardId: id,
          technicianId: t.id,
          technicianUserId: t.userId ?? null,
          role: i === 0 ? 'PRIMARY' : 'SECONDARY',
          assignedAt: new Date(),
          createdBy: erpUserId,
          updatedBy: erpUserId,
          remarks: dto.remarks || null,
        });
        await queryRunner.manager.save(tech);
      }

      jobCard.currentStatus = JobCardStatus.ASSIGNED;
      jobCard.assignedAt = new Date();
      jobCard.teamId = resolvedTeamId;
      jobCard.updatedBy = erpUserId;
      await queryRunner.manager.save(jobCard);

      const history = queryRunner.manager.create(MaintenanceJobCardStatusHistory, {
        jobCardId: id,
        fromStatus: previousStatus,
        toStatus: JobCardStatus.ASSIGNED,
        changedBy: erpUserId,
        remarks: dto.remarks || `Assigned to ${technicians.length} technician(s)`,
      });
      await queryRunner.manager.save(history);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.logActivity(erpUserId, 'JOB_CARD_ASSIGNED', id, jobCard.jobCardNo);
    return this.findOne(id);
  }

  async start(id: string, userId: string, dto?: StartJobCardDto): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.IN_PROGRESS);
    const erpUserId = await this.userResolver.resolve(userId);

    const remarks = dto?.remarks ?? undefined;

    if (dto?.technicianIds && dto.technicianIds.length) {
      const uniqueIds = Array.from(new Set(dto.technicianIds.map(t => String(t).trim()).filter(Boolean)));

      const technicians = await this.maintenanceTechnicianRepo
        .createQueryBuilder('t')
        .where('t.id IN (:...ids)', { ids: uniqueIds })
        .getMany();

      if (technicians.length !== uniqueIds.length) {
        const missing = uniqueIds.filter(u => !technicians.some(t => t.id === u));
        throw new NotFoundException(`Technician(s) not found: ${missing.join(', ')}`);
      }
      const inactive = technicians.filter(t => !t.isActive || t.status !== 'ACTIVE');
      if (inactive.length) {
        throw new BadRequestException(`Technician(s) are not active: ${inactive.map(t => `${t.employeeId} ${t.technicianName}`).join(', ')}`);
      }

      let resolvedTeamId: string | null = null;
      if (dto.teamCode) {
        const team = await this.teamRepo.findOne({ where: { code: dto.teamCode, companyId: jobCard.companyId, isActive: true } });
        if (!team) throw new NotFoundException(`Maintenance team '${dto.teamCode}' not found for this company`);
        resolvedTeamId = team.id;
      }

      await this.technicianRepo.delete({ jobCardId: id });

      for (let i = 0; i < technicians.length; i++) {
        const t = technicians[i];
        await this.technicianRepo.save(this.technicianRepo.create({
          jobCardId: id,
          technicianId: t.id,
          technicianUserId: t.userId ?? null,
          role: i === 0 ? 'PRIMARY' : 'SECONDARY',
          assignedAt: new Date(),
          createdBy: erpUserId,
          updatedBy: erpUserId,
          remarks: remarks || null,
        }));
      }

      jobCard.teamId = resolvedTeamId;
    }

    const previousStatus = jobCard.currentStatus;
    jobCard.currentStatus = JobCardStatus.IN_PROGRESS;
    jobCard.startedAt = new Date();
    jobCard.startedBy = erpUserId;
    jobCard.downtimeStart = jobCard.downtimeStart || new Date();
    if (remarks) jobCard.remarks = remarks;
    jobCard.updatedBy = erpUserId;
    await this.jobCardRepo.save(jobCard);

    // History records the real source state (OPEN when started before any
    // explicit assignment, ASSIGNED when the assignment was made first).
    await this.recordHistory(id, previousStatus, JobCardStatus.IN_PROGRESS, erpUserId, remarks || 'Job started');
    await this.logActivity(erpUserId, 'JOB_CARD_STARTED', id, jobCard.jobCardNo);
    this.emitJobCardEvent('MAINT_JOB_CARD_STARTED', id, userId);
    return this.findOne(id);
  }

  async hold(id: string, userId: string, remarks?: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.ON_HOLD);
    const previousStatus = jobCard.currentStatus;
    const erpUserId = await this.userResolver.resolve(userId);

    jobCard.currentStatus = JobCardStatus.ON_HOLD;
    jobCard.updatedBy = erpUserId;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, previousStatus, JobCardStatus.ON_HOLD, erpUserId, remarks || 'Job put on hold');
    await this.logActivity(erpUserId, 'JOB_CARD_ON_HOLD', id, jobCard.jobCardNo);
    return this.findOne(id);
  }

  async waitingForParts(id: string, userId: string, remarks?: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.WAITING_FOR_PARTS);
    const previousStatus = jobCard.currentStatus;
    const erpUserId = await this.userResolver.resolve(userId);

    jobCard.currentStatus = JobCardStatus.WAITING_FOR_PARTS;
    jobCard.updatedBy = erpUserId;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, previousStatus, JobCardStatus.WAITING_FOR_PARTS, erpUserId, remarks || 'Waiting for parts');
    await this.logActivity(erpUserId, 'JOB_CARD_WAITING_FOR_PARTS', id, jobCard.jobCardNo);
    return this.findOne(id);
  }

  async resumeFromHold(id: string, userId: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.IN_PROGRESS);
    const erpUserId = await this.userResolver.resolve(userId);

    const previousStatus = jobCard.currentStatus;
    jobCard.currentStatus = JobCardStatus.IN_PROGRESS;
    jobCard.updatedBy = erpUserId;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, previousStatus, JobCardStatus.IN_PROGRESS, erpUserId, 'Job resumed');
    await this.logActivity(erpUserId, 'JOB_CARD_RESUMED', id, jobCard.jobCardNo);
    return this.findOne(id);
  }

  async complete(id: string, dto: { diagnosis?: string; correctiveAction?: string; preventiveAction?: string; rootCauseCategoryId?: string; failureCategoryId?: string; remarks?: string }, userId: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.PENDING_VERIFICATION);
    const previousStatus = jobCard.currentStatus;
    const erpUserId = await this.userResolver.resolve(userId);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      jobCard.currentStatus = JobCardStatus.PENDING_VERIFICATION;
      jobCard.completedAt = new Date();
      jobCard.completedBy = erpUserId;
      jobCard.diagnosis = dto.diagnosis || jobCard.diagnosis;
      jobCard.correctiveAction = dto.correctiveAction || jobCard.correctiveAction;
      jobCard.preventiveAction = dto.preventiveAction || jobCard.preventiveAction;
      jobCard.rootCauseCategoryId = dto.rootCauseCategoryId || jobCard.rootCauseCategoryId;
      jobCard.failureCategoryId = dto.failureCategoryId || jobCard.failureCategoryId;
      jobCard.remarks = dto.remarks || jobCard.remarks;
      jobCard.updatedBy = erpUserId;

      if (jobCard.downtimeStart) {
        const start = new Date(jobCard.downtimeStart);
        const end = new Date();
        jobCard.downtimeEnd = end;
        jobCard.downtimeMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
      }

      await queryRunner.manager.save(jobCard);

      const history = queryRunner.manager.create(MaintenanceJobCardStatusHistory, {
        jobCardId: id,
        fromStatus: previousStatus,
        toStatus: JobCardStatus.PENDING_VERIFICATION,
        changedBy: erpUserId,
        remarks: dto.remarks || 'Job completed, submitted for review',
      });
      await queryRunner.manager.save(history);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.logActivity(erpUserId, 'JOB_CARD_COMPLETED', id, jobCard.jobCardNo);
    this.emitJobCardEvent('MAINT_JOB_CARD_SUBMITTED', id, userId);
    return this.findOne(id);
  }

  async close(id: string, userId: string, remarks?: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.CLOSED);
    const erpUserId = await this.userResolver.resolve(userId);

    jobCard.currentStatus = JobCardStatus.CLOSED;
    jobCard.closedAt = new Date();
    jobCard.closedBy = erpUserId;
    jobCard.updatedBy = erpUserId;
    if (remarks) jobCard.remarks = remarks;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, JobCardStatus.COMPLETED, JobCardStatus.CLOSED, erpUserId, remarks || 'Job closed');
    await this.logActivity(erpUserId, 'JOB_CARD_CLOSED', id, jobCard.jobCardNo);
    this.emitJobCardEvent('MAINT_JOB_CARD_CLOSED', id, userId);
    return this.findOne(id);
  }

  async verify(id: string, userId: string, remarks?: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.VERIFIED);
    const erpUserId = await this.userResolver.resolve(userId);

    jobCard.currentStatus = JobCardStatus.VERIFIED;
    jobCard.verifiedAt = new Date();
    jobCard.verifiedBy = erpUserId;
    jobCard.updatedBy = erpUserId;
    if (remarks) jobCard.remarks = remarks;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, JobCardStatus.PENDING_VERIFICATION, JobCardStatus.VERIFIED, erpUserId, remarks || 'Job verified');
    await this.logActivity(erpUserId, 'JOB_CARD_VERIFIED', id, jobCard.jobCardNo);
    this.emitJobCardEvent('MAINT_JOB_CARD_VERIFIED', id, userId);
    return this.findOne(id);
  }

  async approve(id: string, userId: string, remarks?: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.CLOSED);
    const previousStatus = jobCard.currentStatus;
    const erpUserId = await this.userResolver.resolve(userId);

    // Approving review closes the job card directly — the approval decision is
    // preserved as a timeline event (Pending Review → Closed) rather than
    // creating a separate "Approved" workflow state.
    jobCard.currentStatus = JobCardStatus.CLOSED;
    jobCard.approvedAt = new Date();
    jobCard.approvedBy = erpUserId;
    jobCard.closedAt = new Date();
    jobCard.closedBy = erpUserId;
    jobCard.updatedBy = erpUserId;
    if (remarks) jobCard.remarks = remarks;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, previousStatus, JobCardStatus.CLOSED, erpUserId, remarks || 'Job approved');
    await this.logActivity(erpUserId, 'JOB_CARD_APPROVED', id, jobCard.jobCardNo);
    this.emitJobCardEvent('MAINT_JOB_CARD_APPROVED', id, userId);
    return this.findOne(id);
  }

  async reject(id: string, dto: RejectJobCardDto, userId: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.REJECTED);
    const erpUserId = await this.userResolver.resolve(userId);

    jobCard.currentStatus = JobCardStatus.REJECTED;
    jobCard.updatedBy = erpUserId;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, JobCardStatus.PENDING_VERIFICATION, JobCardStatus.REJECTED, erpUserId, dto.reason);
    await this.logActivity(erpUserId, 'JOB_CARD_REJECTED', id, jobCard.jobCardNo);
    this.emitJobCardEvent('MAINT_JOB_CARD_REJECTED', id, userId);
    return this.findOne(id);
  }

  async submitForVerification(id: string, userId: string, remarks?: string): Promise<MaintenanceJobCard> {
    const jobCard = await this.findOne(id);
    this.validateTransition(jobCard.currentStatus, JobCardStatus.PENDING_VERIFICATION);
    const previousStatus = jobCard.currentStatus;
    const erpUserId = await this.userResolver.resolve(userId);

    jobCard.currentStatus = JobCardStatus.PENDING_VERIFICATION;
    jobCard.updatedBy = erpUserId;
    if (remarks) jobCard.remarks = remarks;
    await this.jobCardRepo.save(jobCard);

    await this.recordHistory(id, previousStatus, JobCardStatus.PENDING_VERIFICATION, erpUserId, remarks || 'Submitted for verification');
    await this.logActivity(erpUserId, 'JOB_CARD_SUBMITTED_FOR_VERIFICATION', id, jobCard.jobCardNo);
    this.emitJobCardEvent('MAINT_JOB_CARD_SUBMITTED', id, userId);
    return this.findOne(id);
  }

  async addPart(id: string, dto: AddJobCardPartDto, userId: string): Promise<MaintenanceJobCardPart> {
    const jobCard = await this.findOne(id);
    if (jobCard.currentStatus === JobCardStatus.APPROVED) {
      throw new BadRequestException('Cannot add parts to an approved job card');
    }
    const erpUserId = await this.userResolver.resolve(userId);

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
          createdBy: erpUserId,
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
        issuedBy: erpUserId,
        createdBy: erpUserId,
        updatedBy: erpUserId,
        remarks: dto.remarks || null,
      });
      return manager.save(part);
    });

    await this.logActivity(erpUserId, 'JOB_CARD_PART_ADDED', id, jobCard.jobCardNo);
    return saved;
  }

  async removePart(jobCardId: string, partId: string, userId?: string): Promise<void> {
    const part = await this.partRepo.findOne({ where: { id: partId, jobCardId } });
    if (!part) throw new NotFoundException(`Spare part '${partId}' not found in job card '${jobCardId}'`);

    const jobCard = await this.findOne(jobCardId);
    const issuedFrom = part.issuedFrom;
    const erpUserId = userId ? await this.userResolver.resolve(userId) : null;

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
          createdBy: erpUserId || 'system',
        });
        await manager.getRepository(MaintenanceJobCardPart).delete({ id: partId, jobCardId });
      });
    } else {
      await this.partRepo.delete({ id: partId, jobCardId });
    }

    if (erpUserId) {
      await this.logActivity(erpUserId, 'JOB_CARD_PART_REMOVED', jobCardId, jobCard.jobCardNo);
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
    const erpUserId = await this.userResolver.resolve(userId);
    const workLog = this.workLogRepo.create({
      jobCardId: id,
      technicianUserId: dto.technicianUserId || erpUserId,
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
    await this.logActivity(erpUserId, 'JOB_CARD_WORK_LOG_ADDED', id, jobCard.jobCardNo);
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
    const erpUserId = await this.userResolver.resolve(userId);
    const attachment = this.attachmentRepo.create({
      jobCardId: id,
      fileName: dto.fileName,
      fileUrl: dto.fileUrl,
      mimeType: dto.mimeType || null,
      fileSize: dto.fileSize || null,
      uploadedBy: erpUserId,
      createdBy: erpUserId,
      updatedBy: erpUserId,
      description: dto.description || null,
    });
    const saved = await this.attachmentRepo.save(attachment);
    const jobCard = await this.findOne(id);
    await this.logActivity(erpUserId, 'JOB_CARD_ATTACHMENT_ADDED', id, jobCard.jobCardNo);
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
      relations: ['technicianUser', 'technician'],
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

  async getDashboard(
    companyId: string,
    machineId?: string,
    divisionId?: string,
    sectionId?: string,
    departmentId?: string,
    search?: string,
  ): Promise<any> {
    const qb = this.jobCardRepo.createQueryBuilder('jc');
    qb.where('jc.companyId = :companyId', { companyId });
    qb.andWhere('jc.isActive = true');
    this.applyDashboardFilters(qb, { machineId, divisionId, sectionId, departmentId, search });

    const total = await qb.getCount();
    const open = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.OPEN }).getCount();
    const assigned = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.ASSIGNED }).getCount();
    const inProgress = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.IN_PROGRESS }).getCount();
    const onHold = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.ON_HOLD }).getCount();
    const waitingForParts = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.WAITING_FOR_PARTS }).getCount();
    const completed = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.COMPLETED }).getCount();
    const pendingVerification = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.PENDING_VERIFICATION }).getCount();
    const verified = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.VERIFIED }).getCount();
    const closed = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.CLOSED }).getCount();
    const rejected = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.REJECTED }).getCount();
    const cancelled = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.CANCELLED }).getCount();
    const approved = await qb.clone().andWhere('jc.currentStatus = :s', { s: JobCardStatus.APPROVED }).getCount();
    const critical = await qb.clone().andWhere('jc.priority = :p AND jc.currentStatus NOT IN (:...done)', { p: 'CRITICAL', done: [JobCardStatus.APPROVED, JobCardStatus.REJECTED] }).getCount();

    let byMaintenanceType = await this.jobCardRepo
      .createQueryBuilder('jc')
      .select('jc.maintenanceType', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('jc.companyId = :companyId', { companyId })
      .andWhere('jc.isActive = true')
      .andWhere('jc.currentStatus NOT IN (:...done)', { done: [JobCardStatus.APPROVED, JobCardStatus.REJECTED] })
      .groupBy('jc.maintenanceType')
      .getRawMany();

    const breakdownFilter = this.buildDashboardFilterFragment({ machineId, divisionId, sectionId, departmentId, search });
    if (breakdownFilter.sql) {
      byMaintenanceType = await this.jobCardRepo
        .createQueryBuilder('jc')
        .select('jc.maintenanceType', 'type')
        .addSelect('COUNT(*)', 'count')
        .where('jc.companyId = :companyId' + breakdownFilter.sql, { ...breakdownFilter.params, companyId })
        .andWhere('jc.isActive = true')
        .andWhere('jc.currentStatus NOT IN (:...done)', { done: [JobCardStatus.APPROVED, JobCardStatus.REJECTED] })
        .groupBy('jc.maintenanceType')
        .getRawMany();
    }

    const countForPercent = (n: number): number | null => total > 0 ? Math.round((n / total) * 1000) / 10 : null;
    const percentages = {
      total,
      open: countForPercent(open),
      assigned: countForPercent(assigned),
      inProgress: countForPercent(inProgress),
      onHold: countForPercent(onHold),
      waitingForParts: countForPercent(waitingForParts),
      completed: countForPercent(completed),
      pendingVerification: countForPercent(pendingVerification),
      verified: countForPercent(verified),
      approved: countForPercent(approved),
      closed: countForPercent(closed),
      rejected: countForPercent(rejected),
      cancelled: countForPercent(cancelled),
    };

    return {
      total, open, assigned, inProgress, onHold, waitingForParts,
      completed, pendingVerification, verified, closed, rejected, cancelled,
      approved, critical,
      byMaintenanceType,
      percentages,
    };
  }

  private async computeKpis(opts: { companyId: string; machineId?: string; divisionId?: string; sectionId?: string; departmentId?: string; search?: string }): Promise<{
    mttrMinutes: number | null;
    mtbfMinutes: number | null;
    mpbfMinutes: number | null;
    availabilityPercent: number | null;
    averageDowntimeMinutes: number | null;
    totalDowntimeMinutes: number | null;
    plannedDowntimeMinutes: number | null;
    unplannedDowntimeMinutes: number | null;
    activeRepairMinutes: number | null;
    waitingMinutes: number | null;
    onHoldMinutes: number | null;
    breakdownJobs: number;
    completedJobs: number;
    openJobs: number;
    overdueJobs: number | null;
    pmScheduled: number;
    pmCompletedOnTime: number;
    pmCompliancePercent: number | null;
    pmOverdue: number;
    maintenanceCost: number | null;
    downtimeTrend: Array<{ month: string; planned: number; unplanned: number; total: number }>;
    breakdownTrend: Array<{ month: string; count: number }>;
    mttrTrend: Array<{ month: string; mttr: number }>;
  }> {
    const f = this.buildDashboardFilterFragment({ machineId: opts.machineId, divisionId: opts.divisionId, sectionId: opts.sectionId, departmentId: opts.departmentId, search: opts.search });
    const baseParams = { ...f.params, companyId: opts.companyId };

    const cards = await this.jobCardRepo
      .createQueryBuilder('jc')
      .select(['jc.id', 'jc.machineId', 'jc.maintenanceType', 'jc.startedAt', 'jc.completedAt', 'jc.requestedAt', 'jc.currentStatus'])
      .where('jc.companyId = :companyId AND jc.isActive = true' + f.sql, baseParams)
      .getMany();

    const emptyMetrics = {
      mttrMinutes: null, mtbfMinutes: null, mpbfMinutes: null, availabilityPercent: null,
      averageDowntimeMinutes: null, totalDowntimeMinutes: null, plannedDowntimeMinutes: null, unplannedDowntimeMinutes: null,
      activeRepairMinutes: null, waitingMinutes: null, onHoldMinutes: null,
      breakdownJobs: 0, completedJobs: 0, openJobs: 0, overdueJobs: null,
      pmScheduled: 0, pmCompletedOnTime: 0, pmCompliancePercent: null, pmOverdue: 0, maintenanceCost: null,
      downtimeTrend: [], breakdownTrend: [], mttrTrend: [],
    };

    const cardIds = cards.map(c => c.id);
    const histories: Array<{ jobCardId: string; fromStatus: string | null; toStatus: string; changedAt: Date }> = cardIds.length
      ? await this.historyRepo
          .createQueryBuilder('h')
          .select(['h.jobCardId', 'h.fromStatus', 'h.toStatus', 'h.changedAt'])
          .where('h.jobCardId IN (:...cardIds)', { cardIds })
          .orderBy('h.changedAt', 'ASC')
          .getMany()
      : [];

    const historyByCard = new Map<string, typeof histories>();
    for (const h of histories) {
      const arr = historyByCard.get(h.jobCardId) || [];
      arr.push(h);
      historyByCard.set(h.jobCardId, arr);
    }

    let completedJobs = 0;
    let totalActiveRepair = 0;
    let totalWaiting = 0;
    let totalOnHold = 0;
    let totalDowntime = 0;
    let plannedDowntime = 0;
    let unplannedDowntime = 0;
    let downtimeCards = 0;
    let openJobs = 0;
    let earliestTs: number | null = null;
    let latestTs: number | null = null;

    const MTTR_BY_MONTH = new Map<string, { sum: number; n: number }>();
    const BREAKDOWN_BY_MONTH = new Map<string, number>();
    const DOWNTIME_BY_MONTH = new Map<string, { planned: number; unplanned: number }>();

    const PLANNED_TYPES: MaintenanceType[] = [MaintenanceType.PREVENTIVE, MaintenanceType.INSPECTION];
    const UNPLANNED_TYPES: MaintenanceType[] = [MaintenanceType.BREAKDOWN, MaintenanceType.EMERGENCY, MaintenanceType.CORRECTIVE];

    for (const card of cards) {
      const ev = historyByCard.get(card.id) || [];
      let hasCompleted = false;
      let active = 0;
      let waiting = 0;
      let onHold = 0;
      let inProgressSince: number | null = null;
      let monthKey = '';

      for (const h of ev) {
        const ts = new Date(h.changedAt).getTime();
        if (h.toStatus === JobCardStatus.IN_PROGRESS) {
          inProgressSince = ts;
        } else if (inProgressSince !== null) {
          const minutes = (ts - inProgressSince) / 60000;
          if (h.toStatus === JobCardStatus.ON_HOLD) onHold += minutes;
          else if (h.toStatus === JobCardStatus.WAITING_FOR_PARTS) waiting += minutes;
          active += minutes;
          inProgressSince = null;
        }
        if (h.toStatus === JobCardStatus.COMPLETED) hasCompleted = true;
        if (h.changedAt) {
          const d = new Date(h.changedAt);
          monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const t = d.getTime();
          if (earliestTs === null || t < earliestTs) earliestTs = t;
          if (latestTs === null || t > latestTs) latestTs = t;
        }
      }

      const repairDone = hasCompleted || !!card.completedAt;
      if (repairDone) {
        completedJobs += 1;
        totalActiveRepair += active;
        if (card.startedAt && card.completedAt) {
          const downward = (new Date(card.completedAt).getTime() - new Date(card.startedAt).getTime()) / 60000;
          if (downward >= 0) {
            totalDowntime += downward;
            downtimeCards += 1;
            const isPlanned = PLANNED_TYPES.includes(card.maintenanceType);
            const isUnplanned = UNPLANNED_TYPES.includes(card.maintenanceType);
            if (isPlanned) plannedDowntime += downward;
            if (isUnplanned) unplannedDowntime += downward;
            const d = new Date(card.completedAt || card.startedAt);
            const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const dm = DOWNTIME_BY_MONTH.get(mk) || { planned: 0, unplanned: 0 };
            if (isPlanned) dm.planned += downward;
            if (isUnplanned) dm.unplanned += downward;
            DOWNTIME_BY_MONTH.set(mk, dm);
          }
        }
        if (card.completedAt) {
          const d = new Date(card.completedAt);
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const mt = MTTR_BY_MONTH.get(mk) || { sum: 0, n: 0 };
          mt.sum += active;
          mt.n += 1;
          MTTR_BY_MONTH.set(mk, mt);
        }
      }

      if (card.requestedAt) {
        const d = new Date(card.requestedAt);
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const t = d.getTime();
        if (earliestTs === null || t < earliestTs) earliestTs = t;
        if (latestTs === null || t > latestTs) latestTs = t;
        if (card.maintenanceType === MaintenanceType.BREAKDOWN) {
          BREAKDOWN_BY_MONTH.set(mk, (BREAKDOWN_BY_MONTH.get(mk) || 0) + 1);
        }
      }

      totalWaiting += waiting;
      totalOnHold += onHold;

      if (![JobCardStatus.APPROVED, JobCardStatus.REJECTED, JobCardStatus.CANCELLED, JobCardStatus.CLOSED].includes(card.currentStatus)) {
        openJobs += 1;
      }
    }

    const breakdownCount = cards.filter(c => c.maintenanceType === MaintenanceType.BREAKDOWN).length;

    // ---- MTBF / MPBF from breakdown events per machine ----
    const failureStartByMachine = new Map<string, number[]>();
    const failureEndByMachine = new Map<string, number[]>();
    for (const card of cards) {
      if (card.maintenanceType !== MaintenanceType.BREAKDOWN) continue;
      const ev = historyByCard.get(card.id) || [];
      const inProgEv = ev.find(h => h.toStatus === JobCardStatus.IN_PROGRESS);
      const occurred = inProgEv ? new Date(inProgEv.changedAt).getTime() : (card.startedAt ? new Date(card.startedAt).getTime() : (card.requestedAt ? new Date(card.requestedAt).getTime() : NaN));
      if (!Number.isNaN(occurred)) {
        const arr = failureStartByMachine.get(card.machineId) || [];
        arr.push(occurred);
        failureStartByMachine.set(card.machineId, arr);
      }
      if (card.completedAt) {
        const arr = failureEndByMachine.get(card.machineId) || [];
        arr.push(new Date(card.completedAt).getTime());
        failureEndByMachine.set(card.machineId, arr);
      }
    }
    const meanInterval = (m: Map<string, number[]>): { avgMin: number | null; pairs: number } => {
      let sum = 0;
      let pairs = 0;
      for (const times of m.values()) {
        if (times.length < 2) continue;
        times.sort((a, b) => a - b);
        for (let i = 1; i < times.length; i++) {
          sum += (times[i] - times[i - 1]) / 60000;
          pairs += 1;
        }
      }
      return { avgMin: pairs > 0 ? sum / pairs : null, pairs };
    };
    const mtbf = meanInterval(failureStartByMachine);
    const mpbf = meanInterval(failureEndByMachine);

    // ---- Availability % over observed maintenance window ----
    let availabilityPercent: number | null = null;
    if (earliestTs !== null && latestTs !== null && unplannedDowntime > 0) {
      const windowMin = (latestTs - earliestTs) / 60000;
      if (windowMin > 0) {
        const avail = ((windowMin - unplannedDowntime) / windowMin) * 100;
        availabilityPercent = Math.round(Math.max(0, Math.min(100, avail)));
      }
    }

    const downtimeTrend = Array.from(DOWNTIME_BY_MONTH.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, planned: Math.round(v.planned), unplanned: Math.round(v.unplanned), total: Math.round(v.planned + v.unplanned) }));

    const breakdownTrend = Array.from(BREAKDOWN_BY_MONTH.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, count]) => ({ month, count }));

    const mttrTrend = Array.from(MTTR_BY_MONTH.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, mttr: v.n > 0 ? Math.round(v.sum / v.n) : 0 }));

    // ---- PM metrics ----
    const pmQb = this.dataSource.createQueryBuilder()
      .from('maintenance_pm_schedules', 's')
      .innerJoin('maintenance_pm_plans', 'p', 'p.id = s.pm_plan_id')
      .innerJoin('machines', 'm', 'm.id = s.machine_id')
      .select('s.status', 'status')
      .addSelect('s.scheduled_date', 'scheduledDate')
      .addSelect('s.completed_at', 'completedAt');
    if (opts.machineId) pmQb.andWhere('s.machine_id = :machineId', { machineId: opts.machineId });
    if (opts.divisionId) pmQb.andWhere('m.division_id = :divisionId', { divisionId: opts.divisionId });
    if (opts.sectionId) pmQb.andWhere('m.section_id = :sectionId', { sectionId: opts.sectionId });
    if (opts.departmentId) pmQb.andWhere('m.department_id = :departmentId', { departmentId: opts.departmentId });
    const pmRows = await pmQb.getRawMany();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let pmScheduled = 0;
    let pmCompletedOnTime = 0;
    let pmOverdue = 0;
    for (const r of pmRows as Array<{ status: string; scheduledDate: Date | string; completedAt: Date | string | null }>) {
      if (r.status === 'SKIPPED') continue;
      pmScheduled += 1;
      const due = new Date(r.scheduledDate);
      if (r.status === 'COMPLETED') {
        const done = r.completedAt ? new Date(r.completedAt) : null;
        const dueEnd = new Date(due);
        dueEnd.setHours(23, 59, 59, 999);
        if (done && done.getTime() <= dueEnd.getTime()) pmCompletedOnTime += 1;
      } else if (due.getTime() < today.getTime()) {
        pmOverdue += 1;
      }
    }
    const pmCompliancePercent = pmScheduled > 0 ? Math.round((pmCompletedOnTime / pmScheduled) * 100) : null;

    // ---- Maintenance cost from job card parts ----
    let maintenanceCost: number | null = null;
    if (cardIds.length) {
      const costQb = this.partRepo
        .createQueryBuilder('p')
        .where('p.jobCardId IN (:...cardIds)', { cardIds })
        .select('COALESCE(SUM(p.totalCost), 0)', 'total');
      const costRow = await costQb.getRawOne<{ total: string }>();
      const total = parseFloat(costRow?.total || '0');
      maintenanceCost = total > 0 ? Math.round(total) : null;
    }

    return {
      mttrMinutes: completedJobs > 0 ? Math.round(totalActiveRepair / completedJobs) : null,
      mtbfMinutes: mtbf.avgMin !== null ? Math.round(mtbf.avgMin) : null,
      mpbfMinutes: mpbf.avgMin !== null ? Math.round(mpbf.avgMin) : null,
      availabilityPercent,
      averageDowntimeMinutes: downtimeCards > 0 ? Math.round(totalDowntime / downtimeCards) : null,
      totalDowntimeMinutes: downtimeCards > 0 ? Math.round(totalDowntime) : null,
      plannedDowntimeMinutes: plannedDowntime > 0 ? Math.round(plannedDowntime) : null,
      unplannedDowntimeMinutes: unplannedDowntime > 0 ? Math.round(unplannedDowntime) : null,
      activeRepairMinutes: totalActiveRepair > 0 ? Math.round(totalActiveRepair) : null,
      waitingMinutes: totalWaiting > 0 ? Math.round(totalWaiting) : null,
      onHoldMinutes: totalOnHold > 0 ? Math.round(totalOnHold) : null,
      breakdownJobs: breakdownCount,
      completedJobs,
      openJobs,
      overdueJobs: null,
      pmScheduled,
      pmCompletedOnTime,
      pmCompliancePercent,
      pmOverdue,
      maintenanceCost,
      downtimeTrend,
      breakdownTrend,
      mttrTrend,
    };
  }

  async getChartData(
    companyId: string,
    machineId?: string,
    divisionId?: string,
    sectionId?: string,
    departmentId?: string,
    search?: string,
  ): Promise<any> {
    const f = this.buildDashboardFilterFragment({ machineId, divisionId, sectionId, departmentId, search });
    const mWhere = (): { sql: string; params: any } => ({ sql: f.sql, params: f.params });

    const typeBreakdown = await this.jobCardRepo
      .createQueryBuilder('jc')
      .select('jc.maintenanceType', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('jc.companyId = :companyId' + mWhere().sql, { ...mWhere().params, companyId })
      .andWhere('jc.isActive = true')
      .andWhere('jc.currentStatus NOT IN (:...done)', { done: [JobCardStatus.APPROVED, JobCardStatus.REJECTED] })
      .groupBy('jc.maintenanceType')
      .getRawMany();

    const priorityBreakdown = await this.jobCardRepo
      .createQueryBuilder('jc')
      .select('jc.priority', 'priority')
      .addSelect('COUNT(*)', 'count')
      .where('jc.companyId = :companyId' + mWhere().sql, { ...mWhere().params, companyId })
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
      .where('jc.companyId = :companyId' + mWhere().sql, { ...mWhere().params, companyId })
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
      .where('jc.companyId = :companyId' + mWhere().sql, { ...mWhere().params, companyId })
      .andWhere('jc.isActive = true')
      .groupBy('jc.currentStatus')
      .getRawMany();

    const k = await this.computeKpis({ companyId, machineId, divisionId, sectionId, departmentId, search });

    return {
      typeBreakdown,
      priorityBreakdown,
      monthlyTrend,
      statusBreakdown,
      avgDowntimeMinutes: k.averageDowntimeMinutes,
      totalDowntimeMinutes: k.totalDowntimeMinutes,
      mttrMinutes: k.mttrMinutes,
      mtbfMinutes: k.mtbfMinutes,
      mpbfMinutes: k.mpbfMinutes,
      availabilityPercent: k.availabilityPercent,
      plannedDowntimeMinutes: k.plannedDowntimeMinutes,
      unplannedDowntimeMinutes: k.unplannedDowntimeMinutes,
      activeRepairMinutes: k.activeRepairMinutes,
      waitingMinutes: k.waitingMinutes,
      onHoldMinutes: k.onHoldMinutes,
      breakdownJobs: k.breakdownJobs,
      completedJobs: k.completedJobs,
      openJobs: k.openJobs,
      overdueJobs: k.overdueJobs,
      pmScheduled: k.pmScheduled,
      pmCompletedOnTime: k.pmCompletedOnTime,
      pmCompliancePercent: k.pmCompliancePercent,
      pmOverdue: k.pmOverdue,
      maintenanceCost: k.maintenanceCost,
      downtimeTrend: k.downtimeTrend,
      breakdownTrend: k.breakdownTrend,
      mttrTrend: k.mttrTrend,
    };
  }

  async getReports(
    companyId: string,
    machineId?: string,
    divisionId?: string,
    sectionId?: string,
    departmentId?: string,
    search?: string,
  ): Promise<any> {
    const f = this.buildDashboardFilterFragment({ machineId, divisionId, sectionId, departmentId, search });
    const machineFilter = (): string => f.sql;
    const params = (prev?: any): any => ({ ...f.params, ...(prev || {}) });
    const topProblemMachines = await this.jobCardRepo
      .createQueryBuilder('jc')
      .leftJoin('jc.machine', 'machine')
      .select('machine.id', 'machineId')
      .addSelect('machine.machine_name', 'machineName')
      .addSelect('machine.machine_code', 'machineCode')
      .addSelect('COUNT(*)', 'jobCount')
      .addSelect('SUM(CASE WHEN jc.currentStatus = :approved THEN 1 ELSE 0 END)', 'approvedCount')
      .addSelect('SUM(jc.downtimeMinutes)', 'totalDowntime')
      .where('jc.companyId = :companyId' + machineFilter(), { ...params({ approved: JobCardStatus.APPROVED }), companyId })
      .andWhere('jc.isActive = true')
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
      .where('jc.companyId = :companyId' + machineFilter(), { ...params(), companyId })
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
      .where('jc.companyId = :companyId' + machineFilter(), { ...params(), companyId })
      .andWhere('jc.isActive = true')
      .andWhere('jc.currentStatus = :approved')
      .setParameters({ approved: JobCardStatus.APPROVED })
      .groupBy('machine.id')
      .addGroupBy('machine.machine_name')
      .having('COUNT(*) > 1')
      .getRawMany();

    return { topProblemMachines, downtimeByType, mtbfByMachine };
  }

  private buildDashboardSearchClause(search: string, params: Record<string, unknown>): string {
    params.search = `%${search}%`;
    return `(jc.jobCardNo ILIKE :search OR jc.complaint ILIKE :search OR EXISTS (SELECT 1 FROM machines m WHERE m.id = jc.machineId AND (m.machine_code ILIKE :search OR m.machine_number ILIKE :search OR m.machine_name ILIKE :search OR m.machine_id ILIKE :search)) OR EXISTS (SELECT 1 FROM maintenance_job_card_technicians t2 LEFT JOIN erp_users u2 ON u2.id = t2.technician_user_id WHERE t2.job_card_id = jc.id AND (u2.display_name ILIKE :search OR u2.first_name ILIKE :search OR u2.last_name ILIKE :search OR u2.email ILIKE :search)))`;
  }

  private buildDashboardFilterFragment(opts: { machineId?: string; divisionId?: string; sectionId?: string; departmentId?: string; search?: string }): { sql: string; params: Record<string, unknown> } {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (opts.machineId) {
      clauses.push('jc.machineId = :machineId');
      params.machineId = opts.machineId;
    }
    if (opts.divisionId) {
      clauses.push('jc.divisionId = :divisionId');
      params.divisionId = opts.divisionId;
    }
    if (opts.sectionId) {
      clauses.push('jc.sectionId = :sectionId');
      params.sectionId = opts.sectionId;
    }
    if (opts.departmentId) {
      clauses.push('jc.assignedDepartmentId = :departmentId');
      params.departmentId = opts.departmentId;
    }
    if (opts.search) {
      clauses.push(this.buildDashboardSearchClause(opts.search, params));
    }
    const sql = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
    return { sql, params };
  }

  private applyDashboardFilters(
    qb: import('typeorm').SelectQueryBuilder<any>,
    opts: { machineId?: string; divisionId?: string; sectionId?: string; departmentId?: string; search?: string },
  ): void {
    const f = this.buildDashboardFilterFragment(opts);
    if (f.sql) {
      qb.andWhere(f.sql.replace(/^ AND /, ''), f.params);
    }
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

  /**
   * Emit a maintenance job card notification event (created/started/closed/
   * submitted/verified/rejected/approved). Uses real record data; never throws
   * into the business flow. actorAuthUserId is the authenticated user id.
   */
  private async emitJobCardEvent(eventCode: string, id: string, actorAuthUserId?: string): Promise<void> {
    try {
      const card = await this.findOne(id);
      const context: Record<string, any> = {
        jobCardNumber: card.jobCardNo,
        title: card.complaint,
        machineCode: card.machine?.machineCode ?? card.machine?.machineNumber ?? '',
        machineName: card.machine?.name ?? card.machine?.machineNumber ?? '',
        department: card.assignedDepartment?.name ?? card.machine?.department?.name ?? '',
        priority: card.priority,
        status: card.currentStatus,
        createdByName: card.requestedByUser?.displayName ?? '',
        companyName: card.company?.legalName ?? card.company?.tradeName ?? '',
        link: `/master-data/maintenance/job-cards/${card.id}`,
      };
      await this.notificationEngine.emit({
        eventCode,
        companyId: card.companyId,
        title: `New Maintenance Job Card`,
        message: `Job Card ${card.jobCardNo} has been created for machine ${card.machine?.machineCode || ''}.`,
        entityType: 'job_card',
        entityId: card.id,
        actorAuthUserId,
        context,
      });
    } catch (error) {
      this.logger.warn(`Notification emit skipped for ${eventCode} ${id}: ${(error as Error).message}`);
    }
  }
}
