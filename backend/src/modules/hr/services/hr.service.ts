import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { HrDesignation } from '../entities/hr-designation.entity';
import { HrEmployee } from '../entities/hr-employee.entity';
import { HrAttendance } from '../entities/hr-attendance.entity';
import { HrLeaveRequest } from '../entities/hr-leave-request.entity';
import { HrEmployeeSkill } from '../entities/hr-employee-skill.entity';
import { HrEmployeeTraining } from '../entities/hr-employee-training.entity';
import { HrEmployeeDocument } from '../entities/hr-employee-document.entity';
import { HrEmployeeHistory } from '../entities/hr-employee-history.entity';
import {
  CreateHrDesignationDto, CreateHrEmployeeDto, CreateHrAttendanceDto,
  CreateHrLeaveRequestDto, CreateHrLeaveTypeDto, CreateHrShiftDto, CreateHrHolidayDto,
} from '../dto/hr.dto';
import { HrLeaveType } from '../entities/hr-leave-type.entity';
import { HrShift } from '../entities/hr-shift.entity';
import { HrHoliday } from '../entities/hr-holiday.entity';
import { Department } from '../../organization/entities/department.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { BarcodeService } from '../../barcode/services/barcode.service';
import { BarcodeEntityType } from '../../barcode/entities/barcode.entity';

export interface MyAttendanceQuery {
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  status?: string;
  shiftId?: string;
}

@Injectable()
export class HrService {
  constructor(
    @InjectRepository(HrDesignation) private readonly designationRepo: Repository<HrDesignation>,
    @InjectRepository(HrEmployee) private readonly employeeRepo: Repository<HrEmployee>,
    @InjectRepository(HrAttendance) private readonly attendanceRepo: Repository<HrAttendance>,
    @InjectRepository(HrLeaveRequest) private readonly leaveRepo: Repository<HrLeaveRequest>,
    @InjectRepository(HrLeaveType) private readonly leaveTypeRepo: Repository<HrLeaveType>,
    @InjectRepository(HrShift) private readonly shiftRepo: Repository<HrShift>,
    @InjectRepository(HrHoliday) private readonly holidayRepo: Repository<HrHoliday>,
    @InjectRepository(HrEmployeeSkill) private readonly skillRepo: Repository<HrEmployeeSkill>,
    @InjectRepository(HrEmployeeTraining) private readonly trainingRepo: Repository<HrEmployeeTraining>,
    @InjectRepository(HrEmployeeDocument) private readonly docRepo: Repository<HrEmployeeDocument>,
    @InjectRepository(HrEmployeeHistory) private readonly historyRepo: Repository<HrEmployeeHistory>,
    @InjectRepository(Department) private readonly departmentRepo: Repository<Department>,
    @InjectRepository(ErpUser) private readonly userRepo: Repository<ErpUser>,
    private readonly barcodeService: BarcodeService,
  ) {}
  private readonly logger = new Logger(HrService.name);

  // ---- Self-service "My Attendance ----
  /**
   * Resolves the authenticated user's OWN attendance. The employee is always
   * derived server-side from the JWT subject (auth_user_id) → erp_users.employee_id
   * → hr_employees.employee_code within the user's default company. No client
   * supplied employeeId or companyId is honoured, so a user can never query
   * another employee's records.
   */
  async getMyAttendance(authUserId: string, options: MyAttendanceQuery = {}) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }

    const companyId = user.defaultCompanyId;
    const emptyBase = () => ({
      asOf: formatLocalDate(new Date()),
      range: this.resolveRange(options),
      linked: Boolean(user.employeeId),
      reason: user.employeeId ? (companyId ? 'EMPLOYEE_NOT_FOUND' : 'NO_DEFAULT_COMPANY') : 'ACCOUNT_NOT_LINKED',
      employee: null,
      today: null,
      summary: { total: 0, present: 0, late: 0, absent: 0, onLeave: 0, halfDay: 0, holiday: 0, weekend: 0, notes: { late: 'DERIVED' } },
      records: [],
      total: 0,
      page: Number(options.page) || 1,
      limit: Number(options.limit) || 200,
    });

    if (!user.employeeId) return emptyBase();
    if (!companyId) return emptyBase();

    const employee = await this.employeeRepo.findOne({
      where: { employeeCode: user.employeeId, companyId: companyId as string },
      relations: ['designation'],
    });
    if (!employee) return emptyBase();

    let dept: Department | null = null;
    if (employee.departmentId) {
      dept = await this.departmentRepo.findOne({
        where: { id: employee.departmentId },
        relations: ['division', 'section'],
      });
    }

    const { from, to } = this.resolveRange(options);
    const page = Number(options.page) || 1;
    const limit = Math.min(Math.max(Number(options.limit) || 200, 1), 500);

    const [records, total, summary, today] = await Promise.all([
      this.fetchMyAttendanceRecords(companyId, employee.id, { from, to, status: options.status, shiftId: options.shiftId, page, limit }),
      this.countMyAttendanceRecords(companyId, employee.id, { from, to, status: options.status, shiftId: options.shiftId }),
      this.summarizeMyAttendance(companyId, employee.id, { from, to }),
      this.findMyAttendanceOn(companyId, employee.id, formatLocalDate(new Date())),
    ]);

    return {
      asOf: formatLocalDate(new Date()),
      range: { from, to },
      linked: true,
      reason: null,
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        jobTitle: employee.jobTitle,
        employmentType: employee.employmentType,
        joinDate: employee.joinDate ? formatLocalDate(employee.joinDate) : null,
        status: employee.status,
        designation: employee.designation
          ? { id: employee.designation.id, designationCode: employee.designation.designationCode, designationName: employee.designation.designationName }
          : null,
        department: dept
          ? {
              id: dept.id,
              name: dept.name,
              division: dept.division ? { id: dept.division.id, name: dept.division.name } : null,
              section: dept.section ? { id: dept.section.id, name: dept.section.name } : null,
            }
          : null,
      },
      today,
      summary,
      records,
      total,
      page,
      limit,
    };
  }

  private resolveRange(options: MyAttendanceQuery): { from: string; to: string } {
    const now = new Date();
    const to = options.to || formatLocalDate(now);
    let from = options.from;
    if (!from) {
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      from = `${y}-${String(m).padStart(2, '0')}-01`;
    }
    if (from > to) {
      throw new BadRequestException('From date must not be after to date');
    }
    return { from, to };
  }

  private async fetchMyAttendanceRecords(
    companyId: string,
    employeeId: string,
    opts: { from: string; to: string; status?: string; shiftId?: string; page: number; limit: number },
  ) {
    const qb = this.attendanceRepo.createQueryBuilder('a');
    qb.select('a.id', 'id');
    qb.addSelect(`TO_CHAR(a.attendanceDate, 'YYYY-MM-DD')`, 'attendance_date');
    qb.addSelect('a.status', 'status');
    qb.addSelect('a.shiftId', 'shift_id');
    qb.addSelect('a.checkIn', 'check_in');
    qb.addSelect('a.checkOut', 'check_out');
    qb.addSelect('a.overtimeMinutes', 'overtime_minutes');
    qb.addSelect('a.remarks', 'remarks');
    qb.addSelect('s.shiftCode', 'shift_code');
    qb.addSelect('s.shiftName', 'shift_name');
    qb.addSelect('s.startTime', 'shift_start_time');
    qb.addSelect('s.endTime', 'shift_end_time');
    qb.leftJoin(HrShift, 's', 's.id = a.shiftId AND s.companyId = a.companyId');
    qb.where('a.companyId = :companyId', { companyId });
    qb.andWhere('a.employeeId = :employeeId', { employeeId });
    qb.andWhere('a.attendanceDate BETWEEN :from AND :to', { from: opts.from, to: opts.to });
    if (opts.status) qb.andWhere('a.status = :status', { status: opts.status });
    if (opts.shiftId) qb.andWhere('a.shiftId = :shiftId', { shiftId: opts.shiftId });
    qb.orderBy('a.attendanceDate', 'DESC');
    qb.addOrderBy('a.checkIn', 'DESC');
    qb.skip((opts.page - 1) * opts.limit).take(opts.limit);

    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map(mapAttendanceRow);
  }

  private async countMyAttendanceRecords(
    companyId: string,
    employeeId: string,
    opts: { from: string; to: string; status?: string; shiftId?: string },
  ): Promise<number> {
    const qb = this.attendanceRepo.createQueryBuilder('a');
    qb.where('a.companyId = :companyId', { companyId });
    qb.andWhere('a.employeeId = :employeeId', { employeeId });
    qb.andWhere('a.attendanceDate BETWEEN :from AND :to', { from: opts.from, to: opts.to });
    if (opts.status) qb.andWhere('a.status = :status', { status: opts.status });
    if (opts.shiftId) qb.andWhere('a.shiftId = :shiftId', { shiftId: opts.shiftId });
    return qb.getCount();
  }

  private async summarizeMyAttendance(
    companyId: string,
    employeeId: string,
    opts: { from: string; to: string },
  ) {
    const qb = this.attendanceRepo.createQueryBuilder('a');
    qb.select('COUNT(*)', 'total');
    qb.addSelect(`COUNT(*) FILTER (WHERE a.status = 'PRESENT')`, 'present');
    qb.addSelect(`COUNT(*) FILTER (WHERE a.status = 'ABSENT')`, 'absent');
    qb.addSelect(`COUNT(*) FILTER (WHERE a.status = 'LEAVE')`, 'on_leave');
    qb.addSelect(`COUNT(*) FILTER (WHERE a.status = 'HALF_DAY')`, 'half_day');
    qb.addSelect(`COUNT(*) FILTER (WHERE a.status = 'HOLIDAY')`, 'holiday');
    qb.addSelect(`COUNT(*) FILTER (WHERE a.status = 'WEEKEND')`, 'weekend');
    qb.addSelect(
      `COUNT(*) FILTER (WHERE a.status = 'PRESENT' AND a.checkIn IS NOT NULL AND s.startTime IS NOT NULL AND (a.checkIn AT TIME ZONE 'UTC')::time > s."start_time"::time)`,
      'late',
    );
    qb.leftJoin(HrShift, 's', 's.id = a.shiftId AND s.companyId = a.companyId');
    qb.where('a.companyId = :companyId', { companyId });
    qb.andWhere('a.employeeId = :employeeId', { employeeId });
    qb.andWhere('a.attendanceDate BETWEEN :from AND :to', { from: opts.from, to: opts.to });

    const row = (await qb.getRawOne<Record<string, unknown>>()) ?? {};
    return {
      total: Number(row.total) || 0,
      present: Number(row.present) || 0,
      late: Number(row.late) || 0,
      absent: Number(row.absent) || 0,
      onLeave: Number(row.on_leave) || 0,
      halfDay: Number(row.half_day) || 0,
      holiday: Number(row.holiday) || 0,
      weekend: Number(row.weekend) || 0,
      notes: { late: 'DERIVED' },
    };
  }

  private async findMyAttendanceOn(companyId: string, employeeId: string, date: string) {
    const rows = await this.fetchMyAttendanceRecords(companyId, employeeId, {
      from: date, to: date, page: 1, limit: 1,
    });
    return rows[0] ?? null;
  }

  // ---- Designations ----
  async listDesignations(companyId: string) {
    return this.designationRepo.find({ where: { companyId }, order: { designationCode: 'ASC' } });
  }

  async createDesignation(dto: CreateHrDesignationDto) {
    const exists = await this.designationRepo.findOne({ where: { companyId: dto.companyId, designationCode: dto.designationCode } });
    if (exists) throw new BadRequestException('Designation code already exists');
    return this.designationRepo.save(this.designationRepo.create(dto));
  }

  // ---- Employees ----
  async listEmployees(companyId: string, query: { page?: number; limit?: number; search?: string; status?: string; departmentId?: string; designationId?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const qb = this.employeeRepo.createQueryBuilder('e')
      .where('e.company_id = :companyId', { companyId });
    if (query.search) qb.andWhere('(e.first_name ILIKE :s OR e.last_name ILIKE :s OR e.employee_code ILIKE :s OR e.email ILIKE :s)', { s: `%${query.search}%` });
    if (query.status) qb.andWhere('e.status = :st', { st: query.status });
    if (query.departmentId) qb.andWhere('e.department_id = :dept', { dept: query.departmentId });
    if (query.designationId) qb.andWhere('e.designation_id = :des', { des: query.designationId });
    qb.orderBy('e.employee_code', 'ASC');
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    // load designation names in a second pass to avoid join+pagination metadata issues
    const ids = data.map((e) => e.id);
    const withDesignations = ids.length
      ? await this.employeeRepo.find({ where: { id: In(ids) }, relations: ['designation'] })
      : [];
    const dMap = new Map(withDesignations.map((e) => [e.id, e.designation]));
    data.forEach((e) => { (e as any).designation = dMap.get(e.id) ?? null; });
    return { data, total, page, limit };
  }

  async findEmployee(id: string) {
    const emp = await this.employeeRepo.findOne({
      where: { id },
      relations: ['designation', 'manager', 'skills', 'training', 'documents', 'histories'],
    });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  async createEmployee(dto: CreateHrEmployeeDto) {
    const exists = await this.employeeRepo.findOne({ where: { companyId: dto.companyId, employeeCode: dto.employeeCode } });
    if (exists) throw new BadRequestException('Employee code already exists');
    const emp = this.employeeRepo.create({
      ...dto, dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
      joinDate: dto.joinDate ? new Date(dto.joinDate) : null,
    });
    const saved = await this.employeeRepo.save(emp);

    // Auto-create centralized barcode registry entry
    try {
      await this.barcodeService.ensureBarcodeForEntity(
        saved.companyId,
        BarcodeEntityType.EMPLOYEE,
        saved.id,
        saved.employeeCode,
        `${saved.firstName} ${saved.lastName || ''}`.trim(),
      );
    } catch (err) {
      this.logger.warn(`Failed to create centralized barcode for employee ${saved.id}: ${err}`);
    }

    return saved;
  }

  async updateEmployee(id: string, dto: Partial<CreateHrEmployeeDto> & { status?: string }) {
    const emp = await this.employeeRepo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');
    const changes: { fromValue?: string; toValue?: string }[] = [];
    if (dto.status && dto.status !== emp.status) changes.push({ fromValue: emp.status, toValue: dto.status });
    if (dto.designationId && dto.designationId !== emp.designationId) changes.push({ fromValue: emp.designationId ?? undefined, toValue: dto.designationId });
    Object.assign(emp, dto);
    if (dto.dateOfBirth) emp.dateOfBirth = new Date(dto.dateOfBirth);
    if (dto.joinDate) emp.joinDate = new Date(dto.joinDate);
    const saved = await this.employeeRepo.save(emp);
    for (const c of changes) {
      await this.historyRepo.save(this.historyRepo.create({
        employeeId: id, changeType: 'STATUS_CHANGE', fromValue: c.fromValue ?? null, toValue: c.toValue ?? null,
        changeDate: new Date(), remarks: 'Updated via employee edit',
      }));
    }
    return saved;
  }

  // ---- Attendance ----
  async listAttendance(companyId: string, query: { page?: number; limit?: number; employeeId?: string; from?: string; to?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const qb = this.attendanceRepo.createQueryBuilder('a')
      .where('a.company_id = :companyId', { companyId });
    if (query.employeeId) qb.andWhere('a.employee_id = :eid', { eid: query.employeeId });
    if (query.from) qb.andWhere('a.attendance_date >= :from', { from: query.from });
    if (query.to) qb.andWhere('a.attendance_date <= :to', { to: query.to });
    qb.orderBy('a.attendance_date', 'DESC');
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    // load employee names in a second pass
    const ids = data.map((a) => a.employeeId);
    const employees = ids.length ? await this.employeeRepo.find({ where: { id: In(ids) } }) : [];
    const eMap = new Map(employees.map((e) => [e.id, e]));
    data.forEach((a) => { (a as any).employee = eMap.get(a.employeeId) ?? null; });
    return { data, total, page, limit };
  }

  async recordAttendance(dto: CreateHrAttendanceDto) {
    const exists = await this.attendanceRepo.findOne({ where: { employeeId: dto.employeeId, attendanceDate: new Date(dto.attendanceDate) as any } });
    if (exists) throw new BadRequestException('Attendance already recorded for this date');
    const rec = this.attendanceRepo.create({
      ...dto, attendanceDate: new Date(dto.attendanceDate) as any,
      checkIn: dto.checkIn ? new Date(dto.checkIn) : null, checkOut: dto.checkOut ? new Date(dto.checkOut) : null,
    });
    return this.attendanceRepo.save(rec);
  }

  // ---- Leave ----
  async listLeaveTypes(companyId: string) {
    return this.leaveTypeRepo.find({ where: { companyId }, order: { leaveCode: 'ASC' } });
  }

  async createLeaveType(dto: CreateHrLeaveTypeDto) {
    const exists = await this.leaveTypeRepo.findOne({ where: { companyId: dto.companyId, leaveCode: dto.leaveCode } });
    if (exists) throw new BadRequestException('Leave type already exists');
    return this.leaveTypeRepo.save(this.leaveTypeRepo.create(dto));
  }

  async listLeaveRequests(companyId: string, query: { page?: number; limit?: number; employeeId?: string; status?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const qb = this.leaveRepo.createQueryBuilder('l')
      .leftJoinAndSelect('l.employee', 'e')
      .where('l.company_id = :companyId', { companyId });
    if (query.employeeId) qb.andWhere('l.employee_id = :eid', { eid: query.employeeId });
    if (query.status) qb.andWhere('l.status = :st', { st: query.status });
    qb.orderBy('l.createdAt', 'DESC');
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { data, total, page, limit };
  }

  async createLeaveRequest(dto: CreateHrLeaveRequestDto) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) throw new BadRequestException('End date before start date');
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    return this.leaveRepo.save(this.leaveRepo.create({
      ...dto, startDate: start as any, endDate: end as any, days, status: 'PENDING',
    }));
  }

  async approveLeave(id: string, approvedBy?: string) {
    const rec = await this.leaveRepo.findOne({ where: { id } });
    if (!rec) throw new NotFoundException('Leave request not found');
    if (rec.status !== 'PENDING') throw new BadRequestException('Only pending requests can be approved');
    rec.status = 'APPROVED';
    rec.approvedBy = approvedBy ?? null;
    rec.approvedAt = new Date();
    return this.leaveRepo.save(rec);
  }

  // ---- Shifts ----
  async listShifts(companyId: string) {
    return this.shiftRepo.find({ where: { companyId }, order: { shiftCode: 'ASC' } });
  }

  async createShift(dto: CreateHrShiftDto) {
    const exists = await this.shiftRepo.findOne({ where: { companyId: dto.companyId, shiftCode: dto.shiftCode } });
    if (exists) throw new BadRequestException('Shift already exists');
    return this.shiftRepo.save(this.shiftRepo.create(dto));
  }

  // ---- Holidays ----
  async listHolidays(companyId: string) {
    return this.holidayRepo.find({ where: { companyId }, order: { holidayDate: 'ASC' } });
  }

  async createHoliday(dto: CreateHrHolidayDto) {
    return this.holidayRepo.save(this.holidayRepo.create({ ...dto, holidayDate: new Date(dto.holidayDate) as any }));
  }

  // ---- Employee sub-records ----
  async addSkill(employeeId: string, dto: { skillName: string; skillLevel?: string; yearsExperience?: number }) {
    return this.skillRepo.save(this.skillRepo.create({ employeeId, ...dto }));
  }

  async addTraining(employeeId: string, dto: { trainingName: string; provider?: string; trainingDate?: string }) {
    return this.trainingRepo.save(this.trainingRepo.create({ employeeId, ...dto, trainingDate: dto.trainingDate ? new Date(dto.trainingDate) : null }));
  }

  async addDocument(employeeId: string, dto: { documentName?: string; documentType?: string; fileUrl?: string }) {
    return this.docRepo.save(this.docRepo.create({ employeeId, ...dto }));
  }

  async listHistories(employeeId: string) {
    return this.historyRepo.find({ where: { employeeId }, order: { changeDate: 'DESC' } });
  }
}

/** Local date (YYYY-MM-DD) using the server's calendar — matches the dashboard convention. */
function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Maps a raw my-attendance row (shift-joined) into a stable response object. */
function mapAttendanceRow(row: Record<string, unknown>) {
  const duration = (() => {
    const inT = row.check_in as string | null;
    const outT = row.check_out as string | null;
    if (inT && outT) {
      const mins = Math.round((Date.parse(outT) - Date.parse(inT)) / 60000);
      return Number.isFinite(mins) && mins >= 0 ? mins : null;
    }
    return null;
  })();

  return {
    id: String(row.id),
    date: String(row.attendance_date),
    status: String(row.status),
    checkIn: (row.check_in as string | null) ?? null,
    checkOut: (row.check_out as string | null) ?? null,
    durationMinutes: duration,
    overtimeMinutes: Number(row.overtime_minutes) || 0,
    remarks: (row.remarks as string | null) ?? null,
    shift: row.shift_id
      ? {
          id: String(row.shift_id),
          code: (row.shift_code as string | null) ?? null,
          name: (row.shift_name as string | null) ?? null,
          startTime: (row.shift_start_time as string | null) ?? null,
          endTime: (row.shift_end_time as string | null) ?? null,
        }
      : null,
  };
}