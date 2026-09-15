import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ForbiddenException, ConflictException, Logger } from '@nestjs/common';
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
  CreateHrLeaveRequestDto, UpdateHrLeaveRequestDto, ApproveHrLeaveDto, RejectHrLeaveDto,
  CreateHrLeaveTypeDto, CreateHrShiftDto, CreateHrHolidayDto,
  CreateHrShiftRosterDto, UpdateHrShiftRosterDto, HR_ASSIGNMENT_STATUSES,
  HR_ATTENDANCE_STATUSES, HR_LEAVE_STATUSES, LOCATION_FRESHNESS_MINUTES,
} from '../dto/hr.dto';
import { HrLeaveType } from '../entities/hr-leave-type.entity';
import { HrShift } from '../entities/hr-shift.entity';
import { HrHoliday } from '../entities/hr-holiday.entity';
import { HrShiftRoster } from '../entities/hr-shift-roster.entity';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
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

export interface AttendanceRegisterQuery {
  from?: string;
  to?: string;
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  employeeId?: string;
  shiftId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ShiftRosterQuery {
  rosterDate?: string;
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  employeeId?: string;
  shiftId?: string;
  assignmentStatus?: string;
  assignment?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface LiveMapQuery {
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  employeeId?: string;
  shiftId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface LeaveRequestsQuery {
  dateFrom?: string;
  dateTo?: string;
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  employeeId?: string;
  leaveTypeId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
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
    @InjectRepository(HrShiftRoster) private readonly rosterRepo: Repository<HrShiftRoster>,
    @InjectRepository(HrEmployeeSkill) private readonly skillRepo: Repository<HrEmployeeSkill>,
    @InjectRepository(HrEmployeeTraining) private readonly trainingRepo: Repository<HrEmployeeTraining>,
    @InjectRepository(HrEmployeeDocument) private readonly docRepo: Repository<HrEmployeeDocument>,
    @InjectRepository(HrEmployeeHistory) private readonly historyRepo: Repository<HrEmployeeHistory>,
    @InjectRepository(Department) private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Division) private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Section) private readonly sectionRepo: Repository<Section>,
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

  // ---- Attendance Register (company-wide, read-only) ----
  /**
   * Company-wide attendance register for authorized HR/admin users. The
   * company is ALWAYS derived server-side from the authenticated user's
   * default company (never from client-supplied params), so a caller can never
   * read another company's attendance. Every filter id is validated to belong
   * to the user's own company (400 otherwise) and every record row is joined
   * to the same-company employee/department/division/section/shift rows.
   */
  async getAttendanceRegister(authUserId: string, options: AttendanceRegisterQuery = {}) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }

    const companyId = user.defaultCompanyId;
    const emptyBase = (reason: string | null) => ({
      asOf: formatLocalDate(new Date()),
      range: this.resolveRange(options),
      companyId: companyId ?? null,
      reason,
      summary: emptyRegisterSummary(),
      records: [],
      total: 0,
      page: Number(options.page) || 1,
      limit: Math.min(Math.max(Number(options.limit) || 50, 1), 500),
    });

    if (!companyId) return emptyBase('NO_DEFAULT_COMPANY');

    await this.assertRegisterFilterIds(companyId, options);

    const { from, to } = this.resolveRange(options);
    const page = Number(options.page) || 1;
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 500);

    const [records, total, summary] = await Promise.all([
      this.fetchRegisterRecords(companyId, { ...options, from, to, page, limit }),
      this.countRegisterRecords(companyId, { ...options, from, to }),
      this.summarizeRegister(companyId, { ...options, from, to }),
    ]);

    return {
      asOf: formatLocalDate(new Date()),
      range: { from, to },
      companyId,
      reason: null,
      summary,
      records,
      total,
      page,
      limit,
    };
  }

  /** Filter dropdown metadata for the register — all scoped to the user's own company. */
  async getAttendanceRegisterOptions(authUserId: string) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }
    if (!user.defaultCompanyId) {
      return { companyId: null, divisions: [], sections: [], departments: [], shifts: [], statuses: HR_ATTENDANCE_STATUSES };
    }

    const [divisions, sections, departments, shifts] = await Promise.all([
      this.divisionRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.sectionRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.departmentRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.shiftRepo.find({ where: { companyId: user.defaultCompanyId }, order: { shiftCode: 'ASC' } }),
    ]);

    return {
      companyId: user.defaultCompanyId,
      divisions: divisions.map((d) => ({ id: d.id, code: d.divisionCode, name: d.name })),
      sections: sections.map((s) => ({ id: s.id, code: s.sectionCode, name: s.name, divisionId: s.divisionId })),
      departments: departments.map((d) => ({
        id: d.id, code: d.departmentCode, name: d.name,
        divisionId: d.divisionId, sectionId: d.sectionId,
      })),
      shifts: shifts.map((s) => ({ id: s.id, code: s.shiftCode, name: s.shiftName })),
      statuses: HR_ATTENDANCE_STATUSES,
    };
  }

  private async assertRegisterFilterIds(companyId: string, opts: AttendanceRegisterQuery) {
    if (opts.employeeId && !(await this.employeeRepo.findOne({ where: { id: opts.employeeId, companyId } }))) {
      throw new BadRequestException('Employee not found in the current company');
    }
    if (opts.departmentId && !(await this.departmentRepo.findOne({ where: { id: opts.departmentId, companyId } }))) {
      throw new BadRequestException('Department not found in the current company');
    }
    if (opts.divisionId && !(await this.divisionRepo.findOne({ where: { id: opts.divisionId, companyId } }))) {
      throw new BadRequestException('Division not found in the current company');
    }
    if (opts.sectionId && !(await this.sectionRepo.findOne({ where: { id: opts.sectionId, companyId } }))) {
      throw new BadRequestException('Section not found in the current company');
    }
    if (opts.shiftId && !(await this.shiftRepo.findOne({ where: { id: opts.shiftId, companyId } }))) {
      throw new BadRequestException('Shift not found in the current company');
    }
  }

  /**
   * Shared filter predicate for the register's records / count / summary
   * queries. Every predicate is additionally scoped to the authenticated
   * company so a cross-company record can never match.
   */
  private applyRegisterFilters(qb: any, companyId: string, opts: AttendanceRegisterQuery & { from: string; to: string }) {
    qb.where('a.companyId = :companyId', { companyId });
    qb.andWhere('a.attendanceDate BETWEEN :from AND :to', { from: opts.from, to: opts.to });
    if (opts.employeeId) qb.andWhere('a.employeeId = :employeeId', { employeeId: opts.employeeId });
    if (opts.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: opts.departmentId });
    if (opts.divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId: opts.divisionId });
    if (opts.sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId: opts.sectionId });
    if (opts.shiftId) qb.andWhere('a.shiftId = :shiftId', { shiftId: opts.shiftId });
    if (opts.status === 'LATE') {
      // LATE is a derived status (check-in after the shift start), not a stored value.
      qb.andWhere(
        `a.status = 'PRESENT' AND a.checkIn IS NOT NULL AND s."start_time" IS NOT NULL ` +
          `AND (a.checkIn AT TIME ZONE 'UTC')::time > s."start_time"::time`,
      );
    } else if (opts.status) {
      qb.andWhere('a.status = :status', { status: opts.status });
    }
    if (opts.search) {
      qb.andWhere(
        '(e.firstName ILIKE :s OR e.lastName ILIKE :s OR e.employeeCode ILIKE :s OR e.email ILIKE :s)',
        { s: `%${opts.search}%` },
      );
    }
  }

  private async fetchRegisterRecords(
    companyId: string,
    opts: AttendanceRegisterQuery & { from: string; to: string; page: number; limit: number },
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
    qb.addSelect('e.id', 'employee_id');
    qb.addSelect('e.employeeCode', 'employee_code');
    qb.addSelect('e.firstName', 'first_name');
    qb.addSelect('e.lastName', 'last_name');
    qb.addSelect('e.email', 'email');
    qb.addSelect('e.jobTitle', 'job_title');
    qb.addSelect('e.employmentType', 'employment_type');
    qb.addSelect('e.status', 'employee_status');
    qb.addSelect('des.id', 'designation_id');
    qb.addSelect('des.designationCode', 'designation_code');
    qb.addSelect('des.designationName', 'designation_name');
    qb.addSelect('d.id', 'department_id');
    qb.addSelect('d.name', 'department_name');
    qb.addSelect('div.id', 'division_id');
    qb.addSelect('div.name', 'division_name');
    qb.addSelect('sec.id', 'section_id');
    qb.addSelect('sec.name', 'section_name');
    qb.addSelect('s.shiftCode', 'shift_code');
    qb.addSelect('s.shiftName', 'shift_name');
    qb.addSelect('s.startTime', 'shift_start_time');
    qb.addSelect('s.endTime', 'shift_end_time');
    qb.addSelect(
      `CASE WHEN a.status = 'PRESENT' AND a.checkIn IS NOT NULL AND s.startTime IS NOT NULL AND (a.checkIn AT TIME ZONE 'UTC')::time > s."start_time"::time ` +
        `THEN (ROUND(EXTRACT(EPOCH FROM ((a.checkIn AT TIME ZONE 'UTC')::time - s."start_time"::time)) / 60))::int ELSE NULL END`,
      'late_minutes',
    );
    qb.leftJoin(HrEmployee, 'e', 'e.id = a.employeeId AND e.companyId = a.companyId');
    qb.leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = a.companyId');
    qb.leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = a.companyId');
    qb.leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = a.companyId');
    qb.leftJoin(HrShift, 's', 's.id = a.shiftId AND s.companyId = a.companyId');
    qb.leftJoin(HrDesignation, 'des', 'des.id = e.designationId AND des.companyId = a.companyId');
    qb.leftJoin(HrShift, 's', 's.id = a.shiftId AND s.companyId = a.companyId');
    this.applyRegisterFilters(qb, companyId, opts);
    qb.orderBy('a.attendanceDate', 'DESC');
    qb.addOrderBy('e.employeeCode', 'ASC');
    qb.addOrderBy('a.checkIn', 'DESC');
    qb.offset((opts.page - 1) * opts.limit).limit(opts.limit);

    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map(mapRegisterRow);
  }

  private async countRegisterRecords(
    companyId: string,
    opts: AttendanceRegisterQuery & { from: string; to: string },
  ): Promise<number> {
    const qb = this.attendanceRepo.createQueryBuilder('a');
    qb.leftJoin(HrEmployee, 'e', 'e.id = a.employeeId AND e.companyId = a.companyId');
    qb.leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = a.companyId');
    qb.leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = a.companyId');
    qb.leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = a.companyId');
    qb.leftJoin(HrShift, 's', 's.id = a.shiftId AND s.companyId = a.companyId');
    this.applyRegisterFilters(qb, companyId, opts);
    return qb.getCount();
  }

  private async summarizeRegister(
    companyId: string,
    opts: AttendanceRegisterQuery & { from: string; to: string },
  ) {
    const qb = this.attendanceRepo.createQueryBuilder('a');
    qb.select('COUNT(*)', 'total');
    qb.addSelect(`COUNT(*) FILTER (WHERE a.status = 'PRESENT')`, 'present');
    qb.addSelect(`COUNT(*) FILTER (WHERE a.status = 'ABSENT')`, 'absent');
    qb.addSelect(`COUNT(*) FILTER (WHERE a.status = 'LEAVE')`, 'on_leave');
    qb.addSelect(`COUNT(*) FILTER (WHERE a.status = 'HALF_DAY')`, 'half_day');
    qb.addSelect(`COUNT(*) FILTER (WHERE a.status = 'HOLIDAY')`, 'holiday');
    qb.addSelect(`COUNT(*) FILTER (WHERE a.status = 'WEEKEND')`, 'weekend');
    qb.addSelect('COUNT(DISTINCT a.employeeId)', 'employees_covered');
    qb.addSelect(
      `COUNT(*) FILTER (WHERE a.status = 'PRESENT' AND a.checkIn IS NOT NULL AND s.startTime IS NOT NULL AND (a.checkIn AT TIME ZONE 'UTC')::time > s."start_time"::time)`,
      'late',
    );
    qb.leftJoin(HrShift, 's', 's.id = a.shiftId AND s.companyId = a.companyId');
    qb.leftJoin(HrEmployee, 'e', 'e.id = a.employeeId AND e.companyId = a.companyId');
    qb.leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = a.companyId');
    this.applyRegisterFilters(qb, companyId, opts);

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
      employeesCovered: Number(row.employees_covered) || 0,
      notes: { late: 'DERIVED' },
    };
  }

  // ---- Shift Roster ----
  /**
   * Filter dropdown metadata for the Shift Roster — all scoped to the user's
   * own default company. Also returns the active employee list used by the
   * assignment picker and the unassigned-tab derivation.
   */
  async getShiftRosterOptions(authUserId: string) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }
    if (!user.defaultCompanyId) {
      return { companyId: null, today: formatLocalDate(new Date()), divisions: [], sections: [], departments: [], shifts: [], employees: [], assignmentStatuses: HR_ASSIGNMENT_STATUSES };
    }

    const [divisions, sections, departments, shifts, employees] = await Promise.all([
      this.divisionRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.sectionRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.departmentRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.shiftRepo.find({ where: { companyId: user.defaultCompanyId }, order: { shiftCode: 'ASC' } }),
      this.employeeRepo.find({ where: { companyId: user.defaultCompanyId, isActive: true, status: 'ACTIVE' }, order: { employeeCode: 'ASC' } }),
    ]);

    return {
      companyId: user.defaultCompanyId,
      today: formatLocalDate(new Date()),
      divisions: divisions.map((d) => ({ id: d.id, code: d.divisionCode, name: d.name })),
      sections: sections.map((s) => ({ id: s.id, code: s.sectionCode, name: s.name, divisionId: s.divisionId })),
      departments: departments.map((d) => ({
        id: d.id, code: d.departmentCode, name: d.name,
        divisionId: d.divisionId, sectionId: d.sectionId,
      })),
      shifts: shifts.map((s) => ({
        id: s.id, code: s.shiftCode, name: s.shiftName,
        startTime: s.startTime ?? null, endTime: s.endTime ?? null,
        workingHours: s.workingHours != null ? Number(s.workingHours) : null,
      })),
      employees: employees.map((e) => ({
        id: e.id, employeeCode: e.employeeCode, firstName: e.firstName, lastName: e.lastName ?? null, departmentId: e.departmentId ?? null,
      })),
      assignmentStatuses: HR_ASSIGNMENT_STATUSES,
    };
  }

  /**
   * Company-wide daily Shift Roster (read). The company is ALWAYS derived
   * server-side from the authenticated user's default company — never from
   * client-supplied params. Every filter id is validated against the user's own
   * company (400 otherwise). The UNASSIGNED view lists active employees without
   * an active roster assignment on the date; all other views list real roster
   * rows joined to their employee/org/shift/attendance detail. KPI numbers are
   * real counts scoped to the same org filters.
   */
  async getShiftRoster(authUserId: string, options: ShiftRosterQuery = {}) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }

    const companyId = user.defaultCompanyId;
    const emptyBase = (reason: string | null) => ({
      asOf: formatLocalDate(new Date()),
      rosterDate: options.rosterDate || formatLocalDate(new Date()),
      companyId: companyId ?? null,
      reason,
      summary: emptyRosterSummary(),
      shiftBreakdown: [],
      records: [],
      total: 0,
      page: Number(options.page) || 1,
      limit: Math.min(Math.max(Number(options.limit) || 10, 1), 200),
    });

    if (!companyId) return emptyBase('NO_DEFAULT_COMPANY');

    await this.assertRosterFilterIds(companyId, options);

    const rosterDate = options.rosterDate || formatLocalDate(new Date());
    const page = Number(options.page) || 1;
    const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 200);

    const [records, total, overview] = await Promise.all([
      this.fetchRosterRecords(companyId, rosterDate, { ...options, rosterDate, page, limit }),
      this.countRosterRecords(companyId, rosterDate, options),
      this.computeRosterOverview(companyId, rosterDate, options),
    ]);

    return {
      asOf: formatLocalDate(new Date()),
      rosterDate,
      companyId,
      reason: null,
      summary: overview.summary,
      shiftBreakdown: overview.shiftBreakdown,
      records,
      total,
      page,
      limit,
    };
  }

  private async assertRosterFilterIds(companyId: string, opts: ShiftRosterQuery) {
    if (opts.employeeId && !(await this.employeeRepo.findOne({ where: { id: opts.employeeId, companyId } }))) {
      throw new BadRequestException('Employee not found in the current company');
    }
    if (opts.departmentId && !(await this.departmentRepo.findOne({ where: { id: opts.departmentId, companyId } }))) {
      throw new BadRequestException('Department not found in the current company');
    }
    if (opts.divisionId && !(await this.divisionRepo.findOne({ where: { id: opts.divisionId, companyId } }))) {
      throw new BadRequestException('Division not found in the current company');
    }
    if (opts.sectionId && !(await this.sectionRepo.findOne({ where: { id: opts.sectionId, companyId } }))) {
      throw new BadRequestException('Section not found in the current company');
    }
    if (opts.shiftId && !(await this.shiftRepo.findOne({ where: { id: opts.shiftId, companyId } }))) {
      throw new BadRequestException('Shift not found in the current company');
    }
  }

  private async fetchRosterRecords(
    companyId: string,
    rosterDate: string,
    opts: ShiftRosterQuery & { rosterDate: string; page: number; limit: number },
  ) {
    if (opts.assignment === 'unassigned') {
      return this.fetchUnassignedEmployees(companyId, rosterDate, opts);
    }

    const qb = this.rosterRepo.createQueryBuilder('r');
    qb.select('r.id', 'id');
    qb.addSelect(`TO_CHAR(r.rosterDate, 'YYYY-MM-DD')`, 'roster_date');
    qb.addSelect('r.assignmentStatus', 'assignment_status');
    qb.addSelect('r.remarks', 'remarks');
    qb.addSelect('e.id', 'employee_id');
    qb.addSelect('e.employeeCode', 'employee_code');
    qb.addSelect('e.firstName', 'first_name');
    qb.addSelect('e.lastName', 'last_name');
    qb.addSelect('e.jobTitle', 'job_title');
    qb.addSelect('e.status', 'employee_status');
    qb.addSelect('des.id', 'designation_id');
    qb.addSelect('des.designationCode', 'designation_code');
    qb.addSelect('des.designationName', 'designation_name');
    qb.addSelect('d.id', 'department_id');
    qb.addSelect('d.name', 'department_name');
    qb.addSelect('div.id', 'division_id');
    qb.addSelect('div.name', 'division_name');
    qb.addSelect('sec.id', 'section_id');
    qb.addSelect('sec.name', 'section_name');
    qb.addSelect('s.id', 'shift_id');
    qb.addSelect('s.shiftCode', 'shift_code');
    qb.addSelect('s.shiftName', 'shift_name');
    qb.addSelect('s.startTime', 'shift_start_time');
    qb.addSelect('s.endTime', 'shift_end_time');
    qb.addSelect('a.id', 'attendance_id');
    qb.addSelect('a.status', 'attendance_status');
    qb.leftJoin(HrEmployee, 'e', 'e.id = r.employeeId AND e.companyId = r.companyId');
    qb.leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = r.companyId');
    qb.leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = r.companyId');
    qb.leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = r.companyId');
    qb.leftJoin(HrDesignation, 'des', 'des.id = e.designationId AND des.companyId = r.companyId');
    qb.leftJoin(HrShift, 's', 's.id = r.shiftId AND s.companyId = r.companyId');
    qb.leftJoin(HrAttendance, 'a', 'a.employeeId = r.employeeId AND a.companyId = r.companyId AND a.attendanceDate = r.rosterDate');
    this.applyRosterFilters(qb, companyId, rosterDate, opts);
    qb.orderBy('e.employeeCode', 'ASC');
    qb.offset((opts.page - 1) * opts.limit).limit(opts.limit);

    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map((row) => mapRosterRow(row));
  }

  private async fetchUnassignedEmployees(
    companyId: string,
    rosterDate: string,
    opts: ShiftRosterQuery & { page: number; limit: number },
  ) {
    const qb = this.employeeRepo.createQueryBuilder('e');
    qb.select('e.id', 'employee_id');
    qb.addSelect('e.employeeCode', 'employee_code');
    qb.addSelect('e.firstName', 'first_name');
    qb.addSelect('e.lastName', 'last_name');
    qb.addSelect('e.jobTitle', 'job_title');
    qb.addSelect('e.status', 'employee_status');
    qb.addSelect('des.id', 'designation_id');
    qb.addSelect('des.designationCode', 'designation_code');
    qb.addSelect('des.designationName', 'designation_name');
    qb.addSelect('d.id', 'department_id');
    qb.addSelect('d.name', 'department_name');
    qb.addSelect('div.id', 'division_id');
    qb.addSelect('div.name', 'division_name');
    qb.addSelect('sec.id', 'section_id');
    qb.addSelect('sec.name', 'section_name');
    qb.addSelect('a.id', 'attendance_id');
    qb.addSelect('a.status', 'attendance_status');
    qb.addSelect('NULL', 'id');
    qb.addSelect('NULL', 'roster_date');
    qb.addSelect('NULL', 'assignment_status');
    qb.addSelect('NULL', 'remarks');
    qb.addSelect('NULL', 'shift_id');
    qb.addSelect('NULL', 'shift_code');
    qb.addSelect('NULL', 'shift_name');
    qb.addSelect('NULL', 'shift_start_time');
    qb.addSelect('NULL', 'shift_end_time');
    qb.leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = e.companyId');
    qb.leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = e.companyId');
    qb.leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = e.companyId');
    qb.leftJoin(HrDesignation, 'des', 'des.id = e.designationId AND des.companyId = e.companyId');
    qb.leftJoin(HrAttendance, 'a', 'a.employeeId = e.id AND a.companyId = e.companyId AND a.attendanceDate = :rosterDateA');
    qb.setParameter('rosterDateA', rosterDate);
    qb.where('e.companyId = :companyId', { companyId });
    qb.andWhere('e.isActive = true');
    qb.andWhere('e.status = :empStatus', { empStatus: 'ACTIVE' });
    if (opts.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: opts.departmentId });
    if (opts.divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId: opts.divisionId });
    if (opts.sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId: opts.sectionId });
    if (opts.employeeId) qb.andWhere('e.id = :employeeId', { employeeId: opts.employeeId });
    if (opts.search) {
      qb.andWhere('(e.firstName ILIKE :s OR e.lastName ILIKE :s OR e.employeeCode ILIKE :s)', { s: `%${opts.search}%` });
    }
    qb.andWhere(
      `NOT EXISTS (SELECT 1 FROM hr_shift_roster r2 ` +
        `WHERE r2.company_id = e.company_id AND r2.employee_id = e.id AND r2.roster_date = :rosterDateB AND r2.is_active = true)`,
    );
    qb.setParameter('rosterDateB', rosterDate);
    qb.orderBy('e.employeeCode', 'ASC');
    qb.offset((opts.page - 1) * opts.limit).limit(opts.limit);

    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map((row) => mapUnassignedRow(row));
  }

  private async countRosterRecords(companyId: string, rosterDate: string, opts: ShiftRosterQuery): Promise<number> {
    if (opts.assignment === 'unassigned') {
      const qb = this.employeeRepo.createQueryBuilder('e');
      qb.leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = e.companyId');
      qb.leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = e.companyId');
      qb.leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = e.companyId');
      qb.where('e.companyId = :companyId', { companyId });
      qb.andWhere('e.isActive = true');
      qb.andWhere('e.status = :empStatus', { empStatus: 'ACTIVE' });
      if (opts.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: opts.departmentId });
      if (opts.divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId: opts.divisionId });
      if (opts.sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId: opts.sectionId });
      if (opts.employeeId) qb.andWhere('e.id = :employeeId', { employeeId: opts.employeeId });
      if (opts.search) {
        qb.andWhere('(e.firstName ILIKE :s OR e.lastName ILIKE :s OR e.employeeCode ILIKE :s)', { s: `%${opts.search}%` });
      }
      qb.andWhere(
        `NOT EXISTS (SELECT 1 FROM hr_shift_roster r2 ` +
          `WHERE r2.company_id = e.company_id AND r2.employee_id = e.id AND r2.roster_date = :rosterDate AND r2.is_active = true)`,
      );
      qb.setParameter('rosterDate', rosterDate);
      return qb.getCount();
    }

    const qb = this.rosterRepo.createQueryBuilder('r');
    qb.leftJoin(HrEmployee, 'e', 'e.id = r.employeeId AND e.companyId = r.companyId');
    qb.leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = r.companyId');
    qb.leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = r.companyId');
    qb.leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = r.companyId');
    qb.leftJoin(HrShift, 's', 's.id = r.shiftId AND s.companyId = r.companyId');
    this.applyRosterFilters(qb, companyId, rosterDate, opts);
    return qb.getCount();
  }

  /**
   * Shared filter predicate for the roster's record + count queries (assigned
   * view). Everything is additionally scoped to the authenticated company.
   */
  private applyRosterFilters(qb: any, companyId: string, rosterDate: string, opts: ShiftRosterQuery) {
    qb.where('r.companyId = :companyId', { companyId });
    qb.andWhere('r.isActive = true');
    qb.andWhere('r.rosterDate = :rosterDate', { rosterDate });
    if (opts.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: opts.departmentId });
    if (opts.divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId: opts.divisionId });
    if (opts.sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId: opts.sectionId });
    if (opts.employeeId) qb.andWhere('r.employeeId = :employeeId', { employeeId: opts.employeeId });
    if (opts.shiftId) qb.andWhere('r.shiftId = :shiftId', { shiftId: opts.shiftId });
    if (opts.assignmentStatus) qb.andWhere('r.assignmentStatus = :assignmentStatus', { assignmentStatus: opts.assignmentStatus });
    if (opts.search) {
      qb.andWhere('(e.firstName ILIKE :s OR e.lastName ILIKE :s OR e.employeeCode ILIKE :s)', { s: `%${opts.search}%` });
    }
  }

  private async computeRosterOverview(
    companyId: string,
    rosterDate: string,
    opts: ShiftRosterQuery,
  ): Promise<{ summary: any; shiftBreakdown: any[] }> {
    const [totalEmployees, assigned, assignedEmployees, activeShifts, shiftCounts] = await Promise.all([
      this.countOrgScopedEmployees(companyId, opts),
      this.countOrgScopedRosterRows(companyId, rosterDate, opts),
      this.countOrgScopedDistinctEmployees(companyId, rosterDate, opts),
      this.shiftRepo.find({ where: { companyId, status: 'ACTIVE' }, order: { shiftCode: 'ASC' } }),
      this.orgScopedShiftCounts(companyId, rosterDate, opts),
    ]);

    const shiftMap = new Map<string, number>();
    for (const row of shiftCounts) shiftMap.set(String(row.shift_id), Number(row.assigned) || 0);

    const unassigned = Math.max(totalEmployees - assignedEmployees, 0);

    return {
      summary: {
        totalEmployees,
        assigned,
        unassigned,
        activeShifts: activeShifts.length,
        assignedEmployeeCount: assignedEmployees,
        notes: { unassigned: 'DERIVED' },
      },
      shiftBreakdown: activeShifts.map((s) => ({
        id: s.id,
        code: s.shiftCode,
        name: s.shiftName,
        assigned: shiftMap.get(s.id) ?? 0,
      })),
    };
  }

  private async countOrgScopedEmployees(companyId: string, opts: ShiftRosterQuery): Promise<number> {
    const qb = this.employeeRepo.createQueryBuilder('e')
      .select('COUNT(*)', 'c')
      .leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = e.companyId')
      .leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = e.companyId')
      .leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = e.companyId')
      .where('e.companyId = :companyId', { companyId })
      .andWhere('e.isActive = true')
      .andWhere('e.status = :empStatus', { empStatus: 'ACTIVE' });
    if (opts.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: opts.departmentId });
    if (opts.divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId: opts.divisionId });
    if (opts.sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId: opts.sectionId });
    const row = (await qb.getRawOne<Record<string, unknown>>()) ?? {};
    return Number(row.c) || 0;
  }

  private async countOrgScopedRosterRows(companyId: string, rosterDate: string, opts: ShiftRosterQuery): Promise<number> {
    const qb = this.rosterRepo.createQueryBuilder('r')
      .select('COUNT(*)', 'c')
      .leftJoin(HrEmployee, 'e', 'e.id = r.employeeId AND e.companyId = r.companyId')
      .leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = r.companyId')
      .leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = r.companyId')
      .leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = r.companyId')
      .where('r.companyId = :companyId', { companyId })
      .andWhere('r.isActive = true')
      .andWhere('r.rosterDate = :rosterDate', { rosterDate });
    if (opts.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: opts.departmentId });
    if (opts.divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId: opts.divisionId });
    if (opts.sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId: opts.sectionId });
    const row = (await qb.getRawOne<Record<string, unknown>>()) ?? {};
    return Number(row.c) || 0;
  }

  private async countOrgScopedDistinctEmployees(companyId: string, rosterDate: string, opts: ShiftRosterQuery): Promise<number> {
    const qb = this.rosterRepo.createQueryBuilder('r')
      .select('COUNT(DISTINCT r.employeeId)', 'c')
      .leftJoin(HrEmployee, 'e', 'e.id = r.employeeId AND e.companyId = r.companyId')
      .leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = r.companyId')
      .leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = r.companyId')
      .leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = r.companyId')
      .where('r.companyId = :companyId', { companyId })
      .andWhere('r.isActive = true')
      .andWhere('r.rosterDate = :rosterDate', { rosterDate });
    if (opts.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: opts.departmentId });
    if (opts.divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId: opts.divisionId });
    if (opts.sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId: opts.sectionId });
    const row = (await qb.getRawOne<Record<string, unknown>>()) ?? {};
    return Number(row.c) || 0;
  }

  /** Active roster rows grouped by shift (org-scoped) — used to cross real shifts with their counts. */
  private async orgScopedShiftCounts(companyId: string, rosterDate: string, opts: ShiftRosterQuery): Promise<Array<{ shift_id: string; assigned: string }>> {
    const qb = this.rosterRepo.createQueryBuilder('r')
      .select('r.shiftId', 'shift_id')
      .addSelect('COUNT(*)', 'assigned')
      .leftJoin(HrEmployee, 'e', 'e.id = r.employeeId AND e.companyId = r.companyId')
      .leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = r.companyId')
      .leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = r.companyId')
      .leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = r.companyId')
      .where('r.companyId = :companyId', { companyId })
      .andWhere('r.isActive = true')
      .andWhere('r.rosterDate = :rosterDate', { rosterDate })
      .groupBy('r.shiftId');
    if (opts.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: opts.departmentId });
    if (opts.divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId: opts.divisionId });
    if (opts.sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId: opts.sectionId });
    return qb.getRawMany<{ shift_id: string; assigned: string }>();
  }

  /** Single-roster-record read by id (view modal), same auth + isolation rules. */
  async getShiftRosterById(authUserId: string, id: string) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const qb = this.rosterRepo.createQueryBuilder('r');
    qb.select('r.id', 'id');
    qb.addSelect(`TO_CHAR(r.rosterDate, 'YYYY-MM-DD')`, 'roster_date');
    qb.addSelect('r.assignmentStatus', 'assignment_status');
    qb.addSelect('r.remarks', 'remarks');
    qb.addSelect('e.id', 'employee_id');
    qb.addSelect('e.employeeCode', 'employee_code');
    qb.addSelect('e.firstName', 'first_name');
    qb.addSelect('e.lastName', 'last_name');
    qb.addSelect('e.jobTitle', 'job_title');
    qb.addSelect('e.status', 'employee_status');
    qb.addSelect('des.id', 'designation_id');
    qb.addSelect('des.designationCode', 'designation_code');
    qb.addSelect('des.designationName', 'designation_name');
    qb.addSelect('d.id', 'department_id');
    qb.addSelect('d.name', 'department_name');
    qb.addSelect('div.id', 'division_id');
    qb.addSelect('div.name', 'division_name');
    qb.addSelect('sec.id', 'section_id');
    qb.addSelect('sec.name', 'section_name');
    qb.addSelect('s.id', 'shift_id');
    qb.addSelect('s.shiftCode', 'shift_code');
    qb.addSelect('s.shiftName', 'shift_name');
    qb.addSelect('s.startTime', 'shift_start_time');
    qb.addSelect('s.endTime', 'shift_end_time');
    qb.addSelect('a.id', 'attendance_id');
    qb.addSelect('a.status', 'attendance_status');
    qb.addSelect(`TO_CHAR(r.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'created_at');
    qb.addSelect(`TO_CHAR(r.updatedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'updated_at');
    qb.addSelect('cu.displayName', 'created_by_name');
    qb.addSelect('uu.displayName', 'updated_by_name');
    qb.leftJoin(HrEmployee, 'e', 'e.id = r.employeeId AND e.companyId = r.companyId');
    qb.leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = r.companyId');
    qb.leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = r.companyId');
    qb.leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = r.companyId');
    qb.leftJoin(HrDesignation, 'des', 'des.id = e.designationId AND des.companyId = r.companyId');
    qb.leftJoin(HrShift, 's', 's.id = r.shiftId AND s.companyId = r.companyId');
    qb.leftJoin(HrAttendance, 'a', 'a.employeeId = r.employeeId AND a.companyId = r.companyId AND a.attendanceDate = r.rosterDate');
    qb.leftJoin(ErpUser, 'cu', 'cu.id = r.createdBy');
    qb.leftJoin(ErpUser, 'uu', 'uu.id = r.updatedBy');
    qb.where('r.id = :id', { id });
    qb.andWhere('r.companyId = :companyId', { companyId });
    qb.andWhere('r.isActive = true');

    const row = await qb.getRawOne<Record<string, unknown>>();
    if (!row) throw new NotFoundException('Shift roster assignment not found');
    return mapRosterRow(row, true);
  }

  // ---- Shift Roster mutations ----
  async createShiftRoster(authUserId: string, dto: CreateHrShiftRosterDto) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const employee = await this.employeeRepo.findOne({ where: { id: dto.employeeId, companyId } });
    if (!employee) throw new BadRequestException('Employee not found in the current company');
    if (employee.status !== 'ACTIVE' || !employee.isActive) {
      throw new BadRequestException('Cannot assign an inactive employee');
    }
    const shift = await this.shiftRepo.findOne({ where: { id: dto.shiftId, companyId } });
    if (!shift) throw new BadRequestException('Shift not found in the current company');

    const assignmentStatus = dto.assignmentStatus || 'ASSIGNED';
    const dateKey = new Date(dto.rosterDate) as any;
    const existing = await this.rosterRepo.findOne({ where: { companyId, employeeId: dto.employeeId, shiftId: dto.shiftId, rosterDate: dateKey } });
    if (existing) {
      if (existing.isActive) {
        throw new BadRequestException('This employee is already assigned to this shift on the selected date');
      }
      existing.isActive = true;
      existing.assignmentStatus = assignmentStatus;
      existing.remarks = dto.remarks ?? existing.remarks;
      existing.updatedBy = user.id;
      return this.rosterRepo.save(existing);
    }

    return this.rosterRepo.save(this.rosterRepo.create({
      companyId,
      employeeId: dto.employeeId,
      shiftId: dto.shiftId,
      rosterDate: dateKey,
      assignmentStatus,
      remarks: dto.remarks ?? null,
      createdBy: user.id,
      updatedBy: user.id,
      isActive: true,
    }));
  }

  async updateShiftRoster(authUserId: string, id: string, dto: UpdateHrShiftRosterDto) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.rosterRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Shift roster assignment not found');

    const employeeId = dto.employeeId ?? rec.employeeId;
    const shiftId = dto.shiftId ?? rec.shiftId;
    const rosterDate = dto.rosterDate ?? formatLocalDate(rec.rosterDate instanceof Date ? rec.rosterDate : new Date(rec.rosterDate));

    if (dto.employeeId) {
      const employee = await this.employeeRepo.findOne({ where: { id: dto.employeeId, companyId } });
      if (!employee) throw new BadRequestException('Employee not found in the current company');
      if (employee.status !== 'ACTIVE' || !employee.isActive) {
        throw new BadRequestException('Cannot assign an inactive employee');
      }
    }
    if (dto.shiftId) {
      const shift = await this.shiftRepo.findOne({ where: { id: dto.shiftId, companyId } });
      if (!shift) throw new BadRequestException('Shift not found in the current company');
    }

    const dup = await this.rosterRepo.findOne({ where: { companyId, employeeId, shiftId, rosterDate: new Date(rosterDate) as any } });
    if (dup && dup.id !== id && dup.isActive) {
      throw new BadRequestException('An active assignment already exists for this employee, shift and date');
    }

    if (dto.employeeId) rec.employeeId = dto.employeeId;
    if (dto.shiftId) rec.shiftId = dto.shiftId;
    if (dto.rosterDate) rec.rosterDate = new Date(dto.rosterDate) as any;
    if (dto.assignmentStatus) rec.assignmentStatus = dto.assignmentStatus;
    if (dto.remarks !== undefined) rec.remarks = dto.remarks;
    rec.updatedBy = user.id;
    return this.rosterRepo.save(rec);
  }

  async softDeleteShiftRoster(authUserId: string, id: string) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.rosterRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Shift roster assignment not found');

    rec.isActive = false;
    rec.updatedBy = user.id;
    return this.rosterRepo.save(rec);
  }
  async listDesignations(companyId: string) {
    return this.designationRepo.find({ where: { companyId }, order: { designationCode: 'ASC' } });
  }

  async createDesignation(dto: CreateHrDesignationDto) {
    const exists = await this.designationRepo.findOne({ where: { companyId: dto.companyId, designationCode: dto.designationCode } });
    if (exists) throw new BadRequestException('Designation code already exists');
    return this.designationRepo.save(this.designationRepo.create(dto));
  }

  // ---- Live Map (workforce presence / location) ----
  /**
   * Filter dropdown metadata for the Live Map — all scoped to the user's own
   * default company (same convention as the register/roster options).
   */
  async getLiveMapOptions(authUserId: string) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }
    if (!user.defaultCompanyId) {
      return {
        companyId: null,
        divisions: [], sections: [], departments: [], shifts: [], employees: [],
        attendanceStatuses: HR_ATTENDANCE_STATUSES,
      };
    }

    const [divisions, sections, departments, shifts, employees] = await Promise.all([
      this.divisionRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.sectionRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.departmentRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.shiftRepo.find({ where: { companyId: user.defaultCompanyId }, order: { shiftCode: 'ASC' } }),
      this.employeeRepo.find({ where: { companyId: user.defaultCompanyId, isActive: true, status: 'ACTIVE' }, order: { employeeCode: 'ASC' } }),
    ]);

    return {
      companyId: user.defaultCompanyId,
      divisions: divisions.map((d) => ({ id: d.id, code: d.divisionCode, name: d.name })),
      sections: sections.map((s) => ({ id: s.id, code: s.sectionCode, name: s.name, divisionId: s.divisionId })),
      departments: departments.map((d) => ({
        id: d.id, code: d.departmentCode, name: d.name,
        divisionId: d.divisionId, sectionId: d.sectionId,
      })),
      shifts: shifts.map((s) => ({
        id: s.id, code: s.shiftCode, name: s.shiftName,
        startTime: s.startTime ?? null, endTime: s.endTime ?? null,
      })),
      employees: employees.map((e) => ({
        id: e.id, employeeCode: e.employeeCode, firstName: e.firstName, lastName: e.lastName ?? null,
      })),
      attendanceStatuses: HR_ATTENDANCE_STATUSES,
    };
  }

  /**
   * Live Map data — current workforce presence + location.
   *
   * REAL-DATA POLICY: the HR schema has NO geo-location / GPS / device /
   * attendance-location source (verified repo-wide). The location counters are
   * therefore truthful: live/recent/stale = 0 and every employee is NO_LOCATION
   * (no coordinates are ever fabricated). What the page does surface from real
   * company-scoped data is: the active employees, their org tree, their today's
   * attendance presence (present-now / present-today / absent / leave / off-record
   * derived from hr_attendance), and their today's shift (attendance shift, else
   * the active roster plan). The company is always resolved server-side.
   */
  async getLiveMap(authUserId: string, options: LiveMapQuery = {}) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }

    const companyId = user.defaultCompanyId;
    const nowIso = new Date().toISOString();
    const page = Number(options.page) || 1;
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 500);
    const emptyBase = (reason: string | null) => ({
      asOf: nowIso,
      companyId: companyId ?? null,
      reason,
      location: liveMapLocationInfo(),
      summary: emptyLiveMapSummary(),
      employees: [],
      total: 0,
      page,
      limit,
    });

    if (!companyId) return emptyBase('NO_DEFAULT_COMPANY');

    await this.assertLiveMapFilterIds(companyId, options);

    const today = formatLocalDate(new Date());
    const [candidates, attendanceByEmployee, rosterShiftByEmployee] = await Promise.all([
      this.fetchLiveMapEmployees(companyId, options),
      this.fetchLiveMapAttendance(companyId, today),
      this.fetchLiveMapRosterShifts(companyId, today),
    ]);

    const merged = candidates.map((row) =>
      mapLiveMapEmployee(row, attendanceByEmployee, rosterShiftByEmployee, today, nowIso),
    );
    const filtered = merged.filter((m) => matchesLiveMapFilters(m, options));
    const total = filtered.length;
    const employees = filtered.slice((page - 1) * limit, page * limit);
    const summary = computeLiveMapSummary(filtered);

    return {
      asOf: nowIso,
      companyId,
      reason: null,
      location: liveMapLocationInfo(),
      summary,
      employees,
      total,
      page,
      limit,
    };
  }

  private async assertLiveMapFilterIds(companyId: string, opts: LiveMapQuery) {
    if (opts.employeeId && !(await this.employeeRepo.findOne({ where: { id: opts.employeeId, companyId } }))) {
      throw new BadRequestException('Employee not found in the current company');
    }
    if (opts.departmentId && !(await this.departmentRepo.findOne({ where: { id: opts.departmentId, companyId } }))) {
      throw new BadRequestException('Department not found in the current company');
    }
    if (opts.divisionId && !(await this.divisionRepo.findOne({ where: { id: opts.divisionId, companyId } }))) {
      throw new BadRequestException('Division not found in the current company');
    }
    if (opts.sectionId && !(await this.sectionRepo.findOne({ where: { id: opts.sectionId, companyId } }))) {
      throw new BadRequestException('Section not found in the current company');
    }
    if (opts.shiftId && !(await this.shiftRepo.findOne({ where: { id: opts.shiftId, companyId } }))) {
      throw new BadRequestException('Shift not found in the current company');
    }
  }

  /** Active employees (org/employee/search filtered, ordered by code). */
  private async fetchLiveMapEmployees(companyId: string, opts: LiveMapQuery) {
    const qb = this.employeeRepo.createQueryBuilder('e');
    qb.select('e.id', 'employee_id');
    qb.addSelect('e.employeeCode', 'employee_code');
    qb.addSelect('e.firstName', 'first_name');
    qb.addSelect('e.lastName', 'last_name');
    qb.addSelect('e.jobTitle', 'job_title');
    qb.addSelect('e.status', 'employee_status');
    qb.addSelect('e.designationId', 'designation_id');
    qb.addSelect('des.designationCode', 'designation_code');
    qb.addSelect('des.designationName', 'designation_name');
    qb.addSelect('d.id', 'department_id');
    qb.addSelect('d.name', 'department_name');
    qb.addSelect('div.id', 'division_id');
    qb.addSelect('div.name', 'division_name');
    qb.addSelect('sec.id', 'section_id');
    qb.addSelect('sec.name', 'section_name');
    qb.leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = e.companyId');
    qb.leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = e.companyId');
    qb.leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = e.companyId');
    qb.leftJoin(HrDesignation, 'des', 'des.id = e.designationId AND des.companyId = e.companyId');
    qb.where('e.companyId = :companyId', { companyId });
    qb.andWhere('e.status = :empStatus', { empStatus: 'ACTIVE' });
    qb.andWhere('e.isActive = :isActive', { isActive: true });
    if (opts.employeeId) qb.andWhere('e.id = :employeeId', { employeeId: opts.employeeId });
    if (opts.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: opts.departmentId });
    if (opts.divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId: opts.divisionId });
    if (opts.sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId: opts.sectionId });
    if (opts.search) {
      qb.andWhere(
        '(e.firstName ILIKE :s OR e.lastName ILIKE :s OR e.employeeCode ILIKE :s)',
        { s: `%${opts.search}%` },
      );
    }
    qb.orderBy('e.employeeCode', 'ASC');
    return qb.getRawMany<Record<string, unknown>>();
  }

  /** Today's attendance rows (company-scoped) — one row per employee per day. */
  private async fetchLiveMapAttendance(companyId: string, today: string) {
    const qb = this.attendanceRepo.createQueryBuilder('a');
    qb.select('a.employeeId', 'employee_id');
    qb.addSelect('a.status', 'status');
    qb.addSelect('a.checkIn', 'check_in');
    qb.addSelect('a.checkOut', 'check_out');
    qb.addSelect('a.shiftId', 'shift_id');
    qb.addSelect('s.shiftCode', 'shift_code');
    qb.addSelect('s.shiftName', 'shift_name');
    qb.addSelect('s.startTime', 'shift_start_time');
    qb.addSelect('s.endTime', 'shift_end_time');
    qb.leftJoin(HrShift, 's', 's.id = a.shiftId AND s.companyId = a.companyId');
    qb.where('a.companyId = :companyId', { companyId });
    qb.andWhere('a.attendanceDate = :today', { today });
    qb.orderBy('a.employeeId', 'ASC');
    const rows = await qb.getRawMany<Record<string, unknown>>();
    const map = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (row.employee_id) map.set(String(row.employee_id), row);
    }
    return map;
  }

  /**
   * Today's planned shifts — one primary roster entry per employee (ASSIGNED
   * preferred, newest last-updated first). Used as the shift source when the
   * employee has not yet clocked in today.
   */
  private async fetchLiveMapRosterShifts(companyId: string, today: string) {
    const rows: Array<Record<string, unknown>> = await this.rosterRepo.query(
      `SELECT DISTINCT ON (r.employee_id)
              r.employee_id AS employee_id,
              s.id AS shift_id,
              s.shift_code AS shift_code,
              s.shift_name AS shift_name,
              s.start_time AS shift_start_time,
              s.end_time AS shift_end_time
       FROM hr_shift_roster r
       JOIN hr_shifts s ON s.id = r.shift_id AND s.company_id = r.company_id
       WHERE r.company_id = $1 AND r.roster_date = $2 AND r.is_active = true
       ORDER BY r.employee_id, CASE WHEN r.assignment_status = 'ASSIGNED' THEN 0 ELSE 1 END, r.updated_at DESC`,
      [companyId, today],
    );
    const map = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (row.employee_id) map.set(String(row.employee_id), row);
    }
    return map;
  }

  // ---- Employees ----
  async getEmployeeLookup(authUserId?: string, departmentId?: string) {
    try {
      let companyId: string | null = null;
      if (authUserId) {
        try {
          const user = await this.userRepo.findOne({ where: [{ authUserId }, { id: authUserId }] });
          if (user?.defaultCompanyId) {
            companyId = user.defaultCompanyId;
          }
        } catch {}
      }
      if (!companyId) {
        try {
          const sampleEmp = await this.employeeRepo.findOne({ where: { status: 'ACTIVE' }, select: ['id', 'companyId'] });
          if (sampleEmp?.companyId) {
            companyId = sampleEmp.companyId;
          }
        } catch {}
      }
      if (!companyId) {
        companyId = '7725aa04-a270-4314-9e82-90949cbe7791';
      }

      const cleanDeptId = (departmentId && departmentId !== 'undefined' && departmentId !== 'null' && departmentId.trim().length > 0)
        ? departmentId.trim()
        : null;

      // 1. Primary path: QueryBuilder with left joins
      try {
        const qb = this.employeeRepo.createQueryBuilder('e')
          .leftJoinAndSelect('e.designation', 'desig')
          .leftJoinAndSelect('e.department', 'dept')
          .where('e.status = :status', { status: 'ACTIVE' });

        if (companyId) {
          qb.andWhere('e.company_id = :companyId', { companyId });
        }
        if (cleanDeptId) {
          qb.andWhere('(e.department_id = :dept OR e.department_id IS NULL)', { dept: cleanDeptId });
        }
        qb.orderBy('e.employee_code', 'ASC');
        const employees = await qb.getMany();

        if (employees.length > 0) {
          return employees.map((e) => ({
            id: e.id,
            employeeCode: e.employeeCode,
            firstName: e.firstName,
            lastName: e.lastName ?? null,
            departmentId: e.departmentId ?? null,
            departmentName: e.department?.name ?? null,
            jobTitle: e.jobTitle || e.designation?.designationName || null,
            status: e.status,
          }));
        }
      } catch (qbErr: any) {
        this.logger.warn(`QueryBuilder employee lookup failed: ${qbErr.message}, trying raw SQL fallback`);
      }

      // 2. Direct raw SQL fallback (100% immune to TypeORM metadata or relation issues)
      const params: any[] = [];
      let whereClause = "WHERE e.status = 'ACTIVE'";
      if (companyId) {
        params.push(companyId);
        whereClause += ` AND e.company_id = $${params.length}`;
      }
      if (cleanDeptId) {
        params.push(cleanDeptId);
        whereClause += ` AND (e.department_id = $${params.length} OR e.department_id IS NULL)`;
      }

      const rawSql = `
        SELECT e.id, e.employee_code AS "employeeCode", e.first_name AS "firstName",
               e.last_name AS "lastName", e.department_id AS "departmentId",
               COALESCE(e.job_title, d.designation_name) AS "jobTitle",
               dept.name AS "departmentName", e.status
        FROM hr_employees e
        LEFT JOIN hr_designations d ON d.id = e.designation_id
        LEFT JOIN departments dept ON dept.id = e.department_id
        ${whereClause}
        ORDER BY e.employee_code ASC
      `;
      const rawRows = await this.employeeRepo.query(rawSql, params);
      return Array.isArray(rawRows) ? rawRows : [];
    } catch (err: any) {
      this.logger.error(`getEmployeeLookup fatal error: ${err.message}`, err.stack);
      return [];
    }
  }

  async listEmployees(companyId: string, query: { page?: number; limit?: number; search?: string; status?: string; departmentId?: string; designationId?: string; divisionId?: string; sectionId?: string }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const qb = this.employeeRepo.createQueryBuilder('e');
    if (companyId) {
      qb.where('e.company_id = :companyId', { companyId });
    }
    if (query.search) qb.andWhere('(e.first_name ILIKE :s OR e.last_name ILIKE :s OR e.employee_code ILIKE :s OR e.email ILIKE :s)', { s: `%${query.search}%` });
    if (query.status) qb.andWhere('e.status = :st', { st: query.status });
    if (query.departmentId) qb.andWhere('e.department_id = :dept', { dept: query.departmentId });
    if (query.designationId) qb.andWhere('e.designation_id = :des', { des: query.designationId });
    if (query.divisionId) {
      qb.innerJoin(Department, 'd_div', 'd_div.id = e.department_id')
        .andWhere('d_div.division_id = :divId', { divId: query.divisionId });
    }
    if (query.sectionId) {
      qb.innerJoin(Department, 'd_sec', 'd_sec.id = e.department_id')
        .andWhere('d_sec.section_id = :secId', { secId: query.sectionId });
    }
    qb.orderBy('e.employee_code', 'ASC');
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    const ids = data.map((e) => e.id);
    const withRelations = ids.length
      ? await this.employeeRepo.find({
          where: { id: In(ids) },
          relations: ['designation', 'department', 'department.division', 'department.section'],
        })
      : [];
    const rMap = new Map(withRelations.map((e) => [e.id, e]));
    data.forEach((e) => {
      const full = rMap.get(e.id);
      (e as any).designation = full?.designation ?? null;
      (e as any).department = full?.department ?? null;
      (e as any).designationName = full?.designation?.designationName ?? (e as any).jobTitle ?? null;
      (e as any).departmentName = full?.department?.name ?? null;
      (e as any).divisionName = full?.department?.division?.name ?? null;
      (e as any).sectionName = full?.department?.section?.name ?? null;
    });
    return { data, total, page, limit };
  }

  async findEmployee(id: string) {
    const emp = await this.employeeRepo.findOne({
      where: { id },
      relations: ['designation', 'department', 'department.division', 'department.section', 'manager', 'skills', 'training', 'documents', 'histories'],
    });
    if (!emp) throw new NotFoundException('Employee not found');
    (emp as any).departmentName = emp.department?.name ?? null;
    (emp as any).designationName = emp.designation?.designationName ?? emp.jobTitle ?? null;
    (emp as any).divisionName = emp.department?.division?.name ?? null;
    (emp as any).sectionName = emp.department?.section?.name ?? null;
    return emp;
  }

  async deleteEmployee(id: string) {
    const emp = await this.employeeRepo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');
    emp.status = emp.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    return this.employeeRepo.save(emp);
  }

  async createEmployee(dto: CreateHrEmployeeDto) {
    let emp = await this.employeeRepo.findOne({ where: { companyId: dto.companyId, employeeCode: dto.employeeCode } });
    if (emp) {
      if (dto.firstName) emp.firstName = dto.firstName;
      if (dto.lastName !== undefined) emp.lastName = dto.lastName;
      if (dto.email !== undefined) emp.email = dto.email;
      if (dto.phone !== undefined) emp.phone = dto.phone;
      if (dto.cnic !== undefined) emp.cnic = dto.cnic;
      if (dto.departmentId !== undefined) emp.departmentId = dto.departmentId;
      if (dto.designationId !== undefined) emp.designationId = dto.designationId;
      if (dto.jobTitle !== undefined) emp.jobTitle = dto.jobTitle;
      if (dto.employmentType) emp.employmentType = dto.employmentType;
      if (dto.status) emp.status = dto.status;
      if (dto.address !== undefined) emp.address = dto.address;
      if (dto.dateOfBirth) emp.dateOfBirth = new Date(dto.dateOfBirth);
      if (dto.joinDate) emp.joinDate = new Date(dto.joinDate);
      await this.employeeRepo.save(emp);
      return this.findEmployee(emp.id);
    }

    emp = this.employeeRepo.create({
      ...dto,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
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

    return this.findEmployee(saved.id);
  }

  async bulkImportEmployees(companyId: string, rows: Array<any>) {
    const results = {
      total: rows.length,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [] as Array<{ row: number; code: string; message: string }>,
    };

    const [departments, designations] = await Promise.all([
      this.departmentRepo.find({ where: { companyId } }),
      this.designationRepo.find({ where: { companyId } }),
    ]);

    const normalize = (str?: string) => (str || '').toLowerCase().replace(/[\s&_.-]+/g, '').trim();

    const findDepartment = (deptName?: string) => {
      if (!deptName) return null;
      const n = normalize(deptName);
      if (n === 'spril' || n === 'spiral') return departments.find((d) => normalize(d.name) === 'spiral');
      if (n === 'cuttingpacking' || n === 'cuttingandpacking' || n === 'packing') {
        return departments.find((d) => normalize(d.name) === 'cuttingpacking') || departments.find((d) => normalize(d.name) === 'packing');
      }
      return departments.find((d) => normalize(d.name) === n) || departments.find((d) => normalize(d.name).includes(n)) || null;
    };

    const findOrCreateDesignation = async (desigName?: string) => {
      if (!desigName || !desigName.trim()) return null;
      const clean = desigName.trim();
      const n = normalize(clean);
      let found = designations.find((d) => normalize(d.designationName) === n);
      if (!found) {
        const code = `DES-${(clean.slice(0, 4).toUpperCase().replace(/[^A-Z]/g, '') + Math.floor(Math.random() * 900 + 100))}`;
        found = this.designationRepo.create({
          companyId,
          designationCode: code,
          designationName: clean,
        });
        found = await this.designationRepo.save(found);
        designations.push(found);
      }
      return found;
    };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const code = String(r.employeeCode || r.code || r.EmployeeID || r.employeeId || '').trim();
      if (!code) {
        results.failed++;
        results.errors.push({ row: i + 1, code: '', message: 'Missing employee code / ID' });
        continue;
      }
      const rawName = String(r.employeeName || r.name || r.firstName || r.EmployeeName || '').trim();
      const parts = rawName ? rawName.split(' ') : [];
      const firstName = r.firstName ? String(r.firstName).trim() : (parts[0] || undefined);
      const lastName = r.lastName !== undefined ? String(r.lastName).trim() : (parts.slice(1).join(' ') || undefined);

      const dept = findDepartment(r.departmentName || r.department || r.Department);
      const desig = await findOrCreateDesignation(r.designationName || r.designation || r.jobTitle || r.Designation);
      const cnic = String(r.cnic || r.CNIC || r.nationalId || r.national_id || r.NationalID || r.idCard || r.IdCard || r.nic || r.NIC || '').trim() || undefined;
      const rawDob = r.dateOfBirth || r.date_of_birth || r.DateOfBirth || r.dob || r.DOB || r.birthDate || r.BirthDate;
      const dob = rawDob ? new Date(rawDob) : undefined;
      const address = (r.address || r.Address || r.city || r.City) ? String(r.address || r.Address || r.city || r.City).trim() : undefined;

      try {
        let emp = await this.employeeRepo.findOne({ where: { companyId, employeeCode: code } });
        const isUpdate = Boolean(emp);

        if (!emp) {
          emp = this.employeeRepo.create({
            companyId,
            employeeCode: code,
            firstName: firstName || code,
            lastName: lastName || null,
            status: r.status || 'ACTIVE',
          });
        } else {
          // Selective partial update: only change name if a non-empty name was explicitly provided
          if (firstName && firstName !== code) emp.firstName = firstName;
          if (lastName !== undefined && lastName !== '') emp.lastName = lastName;
          if (r.status) emp.status = r.status;
        }

        if (dept) emp.departmentId = dept.id;
        if (desig) emp.designationId = desig.id;
        if (r.designation || r.jobTitle) emp.jobTitle = r.designation || r.jobTitle;
        if (r.email) emp.email = String(r.email).trim();
        if (r.phone) emp.phone = String(r.phone).trim();
        if (cnic) emp.cnic = cnic;
        if (address) emp.address = address;
        if (dob && !isNaN(dob.getTime())) emp.dateOfBirth = dob;
        if (r.employmentType) emp.employmentType = r.employmentType;
        if (r.joinDate) emp.joinDate = new Date(r.joinDate);

        const saved = await this.employeeRepo.save(emp);

        try {
          await this.barcodeService.ensureBarcodeForEntity(
            companyId,
            BarcodeEntityType.EMPLOYEE,
            saved.id,
            saved.employeeCode,
            `${saved.firstName} ${saved.lastName || ''}`.trim(),
          );
        } catch (_) {}

        if (isUpdate) results.updated++;
        else results.created++;
      } catch (err: any) {
        results.failed++;
        results.errors.push({ row: i + 1, code, message: err?.message || 'Database error' });
      }
    }

    return results;
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
    return this.findEmployee(saved.id);
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

  // ---- Leave Management ----
  /** Resolves + validates the authenticated ERP user (shared by the leave endpoints). */
  private async resolveAuthUser(authUserId: string) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    }
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('User account is inactive');
    }
    return user;
  }

  /**
   * Filter dropdown metadata for Leave Management — all scoped to the user's
   * own default company (the HR module convention). Also resolves the
   * authenticated user's own employee linkage (`self`) so the create form can
   * pre-fill a self-service request.
   */
  async getLeaveRequestOptions(authUserId: string) {
    const user = await this.resolveAuthUser(authUserId);
    const empty = {
      companyId: null,
      today: formatLocalDate(new Date()),
      divisions: [], sections: [], departments: [], employees: [], leaveTypes: [],
      statuses: HR_LEAVE_STATUSES,
      self: { employeeId: null, employeeCode: null, name: null },
    };
    if (!user.defaultCompanyId) return empty;

    const [divisions, sections, departments, employees, leaveTypes] = await Promise.all([
      this.divisionRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.sectionRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.departmentRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.employeeRepo.find({ where: { companyId: user.defaultCompanyId, isActive: true, status: 'ACTIVE' }, order: { employeeCode: 'ASC' } }),
      this.leaveTypeRepo.find({ where: { companyId: user.defaultCompanyId }, order: { leaveCode: 'ASC' } }),
    ]);

    let self: { employeeId: string | null; employeeCode: string | null; name: string | null } = { employeeId: null, employeeCode: null, name: null };
    if (user.employeeId) {
      const me = employees.find((e) => e.employeeCode === user.employeeId);
      if (me) self = { employeeId: me.id, employeeCode: me.employeeCode, name: `${me.firstName} ${me.lastName ?? ''}`.trim() };
    }

    return {
      companyId: user.defaultCompanyId,
      today: formatLocalDate(new Date()),
      divisions: divisions.map((d) => ({ id: d.id, code: d.divisionCode, name: d.name })),
      sections: sections.map((s) => ({ id: s.id, code: s.sectionCode, name: s.name, divisionId: s.divisionId })),
      departments: departments.map((d) => ({
        id: d.id, code: d.departmentCode, name: d.name,
        divisionId: d.divisionId, sectionId: d.sectionId,
      })),
      employees: employees.map((e) => ({
        id: e.id, employeeCode: e.employeeCode, firstName: e.firstName, lastName: e.lastName ?? null,
        departmentId: e.departmentId ?? null,
      })),
      leaveTypes: leaveTypes.map((t) => ({
        id: t.id, code: t.leaveCode, name: t.leaveName, daysPerYear: t.daysPerYear, isPaid: t.isPaid, status: t.status,
      })),
      statuses: HR_LEAVE_STATUSES,
      self,
    };
  }

  /** Validates every leave filter id against the authenticated user's own company. */
  private async assertLeaveFilterIds(companyId: string, opts: LeaveRequestsQuery) {
    if (opts.employeeId && !(await this.employeeRepo.findOne({ where: { id: opts.employeeId, companyId } }))) {
      throw new BadRequestException('Employee not found in the current company');
    }
    if (opts.departmentId && !(await this.departmentRepo.findOne({ where: { id: opts.departmentId, companyId } }))) {
      throw new BadRequestException('Department not found in the current company');
    }
    if (opts.divisionId && !(await this.divisionRepo.findOne({ where: { id: opts.divisionId, companyId } }))) {
      throw new BadRequestException('Division not found in the current company');
    }
    if (opts.sectionId && !(await this.sectionRepo.findOne({ where: { id: opts.sectionId, companyId } }))) {
      throw new BadRequestException('Section not found in the current company');
    }
    if (opts.leaveTypeId && !(await this.leaveTypeRepo.findOne({ where: { id: opts.leaveTypeId, companyId } }))) {
      throw new BadRequestException('Leave type not found in the current company');
    }
  }

  /** Adds the shared leave-query joins (employee/org/designation/leave-type) to a query builder. */
  private addLeaveQueryJoins(qb: any) {
    qb.leftJoin(HrEmployee, 'e', 'e.id = l.employeeId AND e.companyId = l.companyId');
    qb.leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = l.companyId');
    qb.leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = l.companyId');
    qb.leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = l.companyId');
    qb.leftJoin(HrDesignation, 'des', 'des.id = e.designationId AND des.companyId = l.companyId');
    qb.leftJoin(HrLeaveType, 'lt', 'lt.id = l.leaveTypeId AND lt.companyId = l.companyId');
  }

  /**
   * Shared leave filter predicate — always scoped to the authenticated user's
   * company, only active rows, optional overlap-as-a-range (`dateFrom`/`dateTo`),
   * org cascade, leave type, status and employee search. `includeStatus` is
   * switched off when computing the summary so the KPI cards reflect the whole
   * scoped set rather than the currently selected status tab.
   */
  private applyLeaveQueryFilters(qb: any, companyId: string, opts: LeaveRequestsQuery, includeStatus = true) {
    qb.where('l.companyId = :companyId', { companyId });
    qb.andWhere('l.isActive = true');
    if (opts.employeeId) qb.andWhere('l.employeeId = :employeeId', { employeeId: opts.employeeId });
    if (opts.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: opts.departmentId });
    if (opts.divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId: opts.divisionId });
    if (opts.sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId: opts.sectionId });
    if (opts.leaveTypeId) qb.andWhere('l.leaveTypeId = :leaveTypeId', { leaveTypeId: opts.leaveTypeId });
    if (opts.dateFrom && opts.dateTo) {
      qb.andWhere('l.startDate <= :dateTo AND l.endDate >= :dateFrom', { dateFrom: opts.dateFrom, dateTo: opts.dateTo });
    } else if (opts.dateFrom) {
      qb.andWhere('l.endDate >= :dateFrom', { dateFrom: opts.dateFrom });
    } else if (opts.dateTo) {
      qb.andWhere('l.startDate <= :dateTo', { dateTo: opts.dateTo });
    }
    if (includeStatus && opts.status) qb.andWhere('l.status = :status', { status: opts.status });
    if (opts.search) {
      qb.andWhere('(e.firstName ILIKE :s OR e.lastName ILIKE :s OR e.employeeCode ILIKE :s)', { s: `%${opts.search}%` });
    }
  }

  /**
   * Leave Request list with org/date/search/status filters, pagination and a
   * real summary. The company is always derived server-side.
   */
  async listLeaveRequests(authUserId: string, options: LeaveRequestsQuery = {}) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    const page = Number(options.page) || 1;
    const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 500);
    const emptyBase = (reason: string | null) => ({
      asOf: formatLocalDate(new Date()),
      range: { dateFrom: options.dateFrom ?? null, dateTo: options.dateTo ?? null },
      companyId: companyId ?? null,
      reason,
      summary: emptyLeaveSummary(),
      records: [],
      total: 0,
      page,
      limit,
    });

    if (!companyId) return emptyBase('NO_DEFAULT_COMPANY');

    await this.assertLeaveFilterIds(companyId, options);
    if (options.dateFrom && options.dateTo && options.dateFrom > options.dateTo) {
      throw new BadRequestException('From date must not be after to date');
    }

    const [records, total, summary, onLeaveToday] = await Promise.all([
      this.fetchLeaveRequestRows(companyId, { ...options, page, limit }),
      this.countLeaveRequestRows(companyId, options),
      this.computeLeaveSummary(companyId, options),
      this.countLeaveAttendanceToday(companyId, options),
    ]);

    return {
      asOf: formatLocalDate(new Date()),
      range: { dateFrom: options.dateFrom ?? null, dateTo: options.dateTo ?? null },
      companyId,
      reason: null,
      summary: { ...summary, onLeaveToday },
      records,
      total,
      page,
      limit,
    };
  }

  private async fetchLeaveRequestRows(
    companyId: string,
    opts: LeaveRequestsQuery & { page: number; limit: number },
  ) {
    const qb = this.leaveRepo.createQueryBuilder('l');
    qb.select('l.id', 'id');
    qb.addSelect('l.employeeId', 'employee_id');
    qb.addSelect('l.leaveTypeId', 'leave_type_id');
    qb.addSelect(`TO_CHAR(l.startDate, 'YYYY-MM-DD')`, 'start_date');
    qb.addSelect(`TO_CHAR(l.endDate, 'YYYY-MM-DD')`, 'end_date');
    qb.addSelect('l.days', 'days');
    qb.addSelect('l.reason', 'reason');
    qb.addSelect('l.remarks', 'remarks');
    qb.addSelect('l.status', 'status');
    qb.addSelect('e.employeeCode', 'employee_code');
    qb.addSelect('e.firstName', 'first_name');
    qb.addSelect('e.lastName', 'last_name');
    qb.addSelect('e.status', 'employee_status');
    qb.addSelect('des.id', 'designation_id');
    qb.addSelect('des.designationCode', 'designation_code');
    qb.addSelect('des.designationName', 'designation_name');
    qb.addSelect('d.id', 'department_id');
    qb.addSelect('d.name', 'department_name');
    qb.addSelect('div.id', 'division_id');
    qb.addSelect('div.name', 'division_name');
    qb.addSelect('sec.id', 'section_id');
    qb.addSelect('sec.name', 'section_name');
    qb.addSelect('lt.leaveCode', 'leave_type_code');
    qb.addSelect('lt.leaveName', 'leave_type_name');
    qb.addSelect(`TO_CHAR(l.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'created_at');
    qb.addSelect(`TO_CHAR(l.updatedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'updated_at');
    qb.addSelect(`TO_CHAR(l.approvedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'approved_at');
    qb.addSelect('cu.displayName', 'created_by_name');
    qb.addSelect('uu.displayName', 'updated_by_name');
    qb.addSelect('au.displayName', 'approved_by_name');
    this.addLeaveQueryJoins(qb);
    qb.leftJoin(ErpUser, 'cu', 'cu.id = l.createdBy');
    qb.leftJoin(ErpUser, 'uu', 'uu.id = l.updatedBy');
    qb.leftJoin(ErpUser, 'au', 'au.id = l.approvedBy');
    this.applyLeaveQueryFilters(qb, companyId, opts);
    qb.orderBy('l.createdAt', 'DESC');
    qb.addOrderBy('e.employeeCode', 'ASC');
    qb.offset((opts.page - 1) * opts.limit).limit(opts.limit);

    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map((row) => mapLeaveRequestRow(row));
  }

  private async countLeaveRequestRows(companyId: string, opts: LeaveRequestsQuery): Promise<number> {
    const qb = this.leaveRepo.createQueryBuilder('l');
    this.addLeaveQueryJoins(qb);
    this.applyLeaveQueryFilters(qb, companyId, opts);
    return qb.getCount();
  }

  /** Real status-count summary over the scoped set (org + date + search), ignoring the status tab. */
  private async computeLeaveSummary(companyId: string, opts: LeaveRequestsQuery) {
    const qb = this.leaveRepo.createQueryBuilder('l');
    qb.select(`COUNT(*) FILTER (WHERE l.status = 'PENDING')`, 'pending');
    qb.addSelect(`COUNT(*) FILTER (WHERE l.status = 'APPROVED')`, 'approved');
    qb.addSelect(`COUNT(*) FILTER (WHERE l.status = 'REJECTED')`, 'rejected');
    qb.addSelect(`COUNT(*) FILTER (WHERE l.status = 'CANCELLED')`, 'cancelled');
    qb.addSelect('COUNT(*)', 'total');
    this.addLeaveQueryJoins(qb);
    this.applyLeaveQueryFilters(qb, companyId, opts, false);
    const row = (await qb.getRawOne<Record<string, unknown>>()) ?? {};
    return {
      pending: Number(row.pending) || 0,
      approved: Number(row.approved) || 0,
      rejected: Number(row.rejected) || 0,
      cancelled: Number(row.cancelled) || 0,
      total: Number(row.total) || 0,
      notes: { onLeaveToday: 'ATTENDANCE' },
    };
  }

  /** Number of employees on LEAVE today (from real hr_attendance) within the same org scope. */
  private async countLeaveAttendanceToday(companyId: string, opts: LeaveRequestsQuery): Promise<number> {
    const qb = this.attendanceRepo.createQueryBuilder('a')
      .select('COUNT(*)', 'c')
      .leftJoin(HrEmployee, 'e', 'e.id = a.employeeId AND e.companyId = a.companyId')
      .leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = a.companyId')
      .leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = a.companyId')
      .leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = a.companyId')
      .where('a.companyId = :companyId', { companyId })
      .andWhere('a.attendanceDate = :today', { today: formatLocalDate(new Date()) })
      .andWhere('a.status = :leave', { leave: 'LEAVE' });
    if (opts.employeeId) qb.andWhere('a.employeeId = :employeeId', { employeeId: opts.employeeId });
    if (opts.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: opts.departmentId });
    if (opts.divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId: opts.divisionId });
    if (opts.sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId: opts.sectionId });
    const row = (await qb.getRawOne<Record<string, unknown>>()) ?? {};
    return Number(row.c) || 0;
  }

  /** Single leave request (view modal) — same auth + company isolation rules. */
  async getLeaveRequestById(authUserId: string, id: string) {
    const user = await this.resolveAuthUser(authUserId);
    if (!user.defaultCompanyId) throw new BadRequestException('No default company configured for this account');

    const qb = this.leaveRepo.createQueryBuilder('l');
    qb.select('l.id', 'id');
    qb.addSelect('l.employeeId', 'employee_id');
    qb.addSelect('l.leaveTypeId', 'leave_type_id');
    qb.addSelect(`TO_CHAR(l.startDate, 'YYYY-MM-DD')`, 'start_date');
    qb.addSelect(`TO_CHAR(l.endDate, 'YYYY-MM-DD')`, 'end_date');
    qb.addSelect('l.days', 'days');
    qb.addSelect('l.reason', 'reason');
    qb.addSelect('l.remarks', 'remarks');
    qb.addSelect('l.status', 'status');
    qb.addSelect('e.employeeCode', 'employee_code');
    qb.addSelect('e.firstName', 'first_name');
    qb.addSelect('e.lastName', 'last_name');
    qb.addSelect('e.jobTitle', 'job_title');
    qb.addSelect('e.status', 'employee_status');
    qb.addSelect('des.id', 'designation_id');
    qb.addSelect('des.designationCode', 'designation_code');
    qb.addSelect('des.designationName', 'designation_name');
    qb.addSelect('d.id', 'department_id');
    qb.addSelect('d.name', 'department_name');
    qb.addSelect('div.id', 'division_id');
    qb.addSelect('div.name', 'division_name');
    qb.addSelect('sec.id', 'section_id');
    qb.addSelect('sec.name', 'section_name');
    qb.addSelect('lt.leaveCode', 'leave_type_code');
    qb.addSelect('lt.leaveName', 'leave_type_name');
    qb.addSelect('lt.daysPerYear', 'leave_type_days_per_year');
    qb.addSelect('lt.isPaid', 'leave_type_is_paid');
    qb.addSelect(`TO_CHAR(l.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'created_at');
    qb.addSelect(`TO_CHAR(l.updatedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'updated_at');
    qb.addSelect(`TO_CHAR(l.approvedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'approved_at');
    qb.addSelect('cu.displayName', 'created_by_name');
    qb.addSelect('uu.displayName', 'updated_by_name');
    qb.addSelect('au.displayName', 'approved_by_name');
    this.addLeaveQueryJoins(qb);
    qb.leftJoin(ErpUser, 'cu', 'cu.id = l.createdBy');
    qb.leftJoin(ErpUser, 'uu', 'uu.id = l.updatedBy');
    qb.leftJoin(ErpUser, 'au', 'au.id = l.approvedBy');
    qb.where('l.id = :id', { id });
    qb.andWhere('l.companyId = :companyId', { companyId: user.defaultCompanyId });
    qb.andWhere('l.isActive = true');

    const row = await qb.getRawOne<Record<string, unknown>>();
    if (!row) throw new NotFoundException('Leave request not found');
    return mapLeaveRequestRow(row, true);
  }

  /** Creates a leave request — company/employee always resolved + validated server-side. */
  async createLeaveRequest(authUserId: string, dto: CreateHrLeaveRequestDto) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    let employeeId = dto.employeeId;
    if (!employeeId) {
      if (!user.employeeId) {
        throw new BadRequestException('Your account is not linked to an employee; specify an employee to request leave for');
      }
      const me = await this.employeeRepo.findOne({ where: { employeeCode: user.employeeId, companyId } });
      if (!me) throw new BadRequestException('Your account is not linked to an employee in the current company');
      employeeId = me.id;
    }
    const employee = await this.employeeRepo.findOne({ where: { id: employeeId, companyId } });
    if (!employee) throw new BadRequestException('Employee not found in the current company');
    if (employee.status !== 'ACTIVE' || !employee.isActive) {
      throw new BadRequestException('Cannot request leave for an inactive employee');
    }
    const leaveType = await this.leaveTypeRepo.findOne({ where: { id: dto.leaveTypeId, companyId } });
    if (!leaveType) throw new BadRequestException('Leave type not found in the current company');

    const { start, end, days } = this.validateLeaveDates(dto.startDate, dto.endDate);
    await this.assertNoOverlappingLeave(companyId, employeeId, dto.startDate, dto.endDate);

    const rec = this.leaveRepo.create({
      companyId,
      employeeId,
      leaveTypeId: dto.leaveTypeId,
      startDate: start as any,
      endDate: end as any,
      days,
      reason: dto.reason ?? null,
      status: 'PENDING',
      createdBy: user.id,
      updatedBy: user.id,
    });
    return this.leaveRepo.save(rec);
  }

  /** Updates a still-pending leave request (dates/type/reason), enforcing the same rules. */
  async updateLeaveRequest(authUserId: string, id: string, dto: UpdateHrLeaveRequestDto) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.leaveRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Leave request not found');
    if (rec.status !== 'PENDING') throw new BadRequestException('Only pending requests can be updated');

    const startDate = dto.startDate ?? this.toDateString(rec.startDate);
    const endDate = dto.endDate ?? this.toDateString(rec.endDate);
    this.validateLeaveDates(startDate, endDate);

    if (dto.leaveTypeId) {
      const lt = await this.leaveTypeRepo.findOne({ where: { id: dto.leaveTypeId, companyId } });
      if (!lt) throw new BadRequestException('Leave type not found in the current company');
      rec.leaveTypeId = dto.leaveTypeId;
    }
    if (dto.reason !== undefined) rec.reason = dto.reason ?? null;
    if (dto.startDate) rec.startDate = this.parseLocalDate(dto.startDate) as any;
    if (dto.endDate) rec.endDate = this.parseLocalDate(dto.endDate) as any;
    if (dto.startDate || dto.endDate) {
      const { days } = this.validateLeaveDates(startDate, endDate);
      rec.days = days;
    }
    rec.updatedBy = user.id;
    await this.assertNoOverlappingLeave(companyId, rec.employeeId, startDate, endDate, id);
    return this.leaveRepo.save(rec);
  }

  /** Soft-deletes a leave request (is_active=false) so no history is ever lost. */
  async deleteLeaveRequest(authUserId: string, id: string) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.leaveRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Leave request not found');
    rec.isActive = false;
    rec.updatedBy = user.id;
    return this.leaveRepo.save(rec);
  }

  /** Approves a pending leave request (decision fields + overlap re-check before approval). */
  async approveLeave(authUserId: string, id: string, dto: ApproveHrLeaveDto = {}) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.leaveRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Leave request not found');
    if (rec.status !== 'PENDING') throw new BadRequestException('Only pending requests can be approved');

    await this.assertNoOverlappingLeave(companyId, rec.employeeId, this.toDateString(rec.startDate), this.toDateString(rec.endDate), id);

    rec.status = 'APPROVED';
    rec.approvedBy = user.id;
    rec.approvedAt = new Date();
    if (dto.remarks !== undefined) rec.remarks = dto.remarks ?? null;
    rec.updatedBy = user.id;
    return this.leaveRepo.save(rec);
  }

  /** Rejects a pending leave request (decision fields + optional remarks). */
  async rejectLeave(authUserId: string, id: string, dto: RejectHrLeaveDto = {}) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.leaveRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Leave request not found');
    if (rec.status !== 'PENDING') throw new BadRequestException('Only pending requests can be rejected');

    rec.status = 'REJECTED';
    rec.approvedBy = user.id;
    rec.approvedAt = new Date();
    if (dto.remarks !== undefined) rec.remarks = dto.remarks ?? null;
    rec.updatedBy = user.id;
    return this.leaveRepo.save(rec);
  }

  /** Cancels a still-pending leave request. */
  async cancelLeave(authUserId: string, id: string) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.leaveRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Leave request not found');
    if (rec.status !== 'PENDING') throw new BadRequestException('Only pending requests can be cancelled');

    rec.status = 'CANCELLED';
    rec.updatedBy = user.id;
    return this.leaveRepo.save(rec);
  }

  /** Parses + validates a leave date window; returns local Date objects and calendar days. */
  private validateLeaveDates(startDate: string, endDate: string): { start: Date; end: Date; days: number } {
    if (!startDate || !endDate) throw new BadRequestException('Start and end dates are required');
    const start = this.parseLocalDate(startDate);
    const end = this.parseLocalDate(endDate);
    if (end < start) throw new BadRequestException('End date must not be before start date');
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    if (days < 1) throw new BadRequestException('Leave must last at least one day');
    return { start, end, days };
  }

  /** Local (UTC) Date from a YYYY-MM-DD string so date-only math is stable. */
  private parseLocalDate(value: string): Date {
    const d = new Date(`${value}T00:00:00`);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid date');
    return d;
  }

  private toDateString(d: Date | string): string {
    if (typeof d === 'string') return d.slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Backend-enforced overlap protection: another ACTIVE PENDING/APPROVED leave
   * for the same employee whose range overlaps [startDate, endDate] ⇒ 409, so a
   * duplicate or conflicting leave can never be created/updated/approved.
   */
  private async assertNoOverlappingLeave(companyId: string, employeeId: string, startDate: string, endDate: string, excludeId?: string) {
    const qb = this.leaveRepo.createQueryBuilder('l');
    qb.select('l.id', 'id');
    qb.addSelect('lt.leaveName', 'leave_name');
    qb.addSelect(`TO_CHAR(l.startDate, 'YYYY-MM-DD')`, 'start_date');
    qb.addSelect(`TO_CHAR(l.endDate, 'YYYY-MM-DD')`, 'end_date');
    qb.addSelect('l.status', 'status');
    qb.leftJoin(HrLeaveType, 'lt', 'lt.id = l.leaveTypeId AND lt.companyId = l.companyId');
    qb.where('l.companyId = :companyId', { companyId });
    qb.andWhere('l.employeeId = :employeeId', { employeeId });
    qb.andWhere('l.isActive = true');
    qb.andWhere("l.status IN ('PENDING', 'APPROVED')");
    qb.andWhere('l.startDate <= :endDate', { endDate });
    qb.andWhere('l.endDate >= :startDate', { startDate });
    if (excludeId) qb.andWhere('l.id != :excludeId', { excludeId });
    const conflict = await qb.getRawOne<Record<string, unknown>>();
    if (conflict) {
      throw new ConflictException(
        `Overlapping leave already ${String(conflict.status).toLowerCase()} for this employee: ` +
          `${String(conflict.leave_name ?? '')} on ${String(conflict.start_date)} to ${String(conflict.end_date)}`,
      );
    }
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

/** Zeroed register summary — used for the truthful empty (unprovisioned) payload. */
function emptyRegisterSummary() {
  return {
    total: 0, present: 0, late: 0, absent: 0, onLeave: 0, halfDay: 0, holiday: 0, weekend: 0,
    employeesCovered: 0, notes: { late: 'DERIVED' },
  };
}

/** Zeroed shift-roster summary — used for the truthful empty (unprovisioned) payload. */
function emptyRosterSummary() {
  return {
    totalEmployees: 0, assigned: 0, unassigned: 0, activeShifts: 0,
    assignedEmployeeCount: 0, notes: { unassigned: 'DERIVED' },
  };
}

/** Maps the shared employee/org/designation columns of a roster row. */
function mapRosterEmployee(row: Record<string, unknown>) {
  return {
    id: String(row.employee_id),
    employeeCode: (row.employee_code as string | null) ?? null,
    firstName: (row.first_name as string | null) ?? '',
    lastName: (row.last_name as string | null) ?? '',
    jobTitle: (row.job_title as string | null) ?? null,
    status: (row.employee_status as string | null) ?? null,
    designation: row.designation_code
      ? {
          id: (row.designation_id as string | null) ?? null,
          code: String(row.designation_code),
          name: String(row.designation_name ?? row.designation_code),
        }
      : null,
    department: row.department_id
      ? {
          id: String(row.department_id),
          name: String(row.department_name ?? ''),
          division: row.division_id ? { id: String(row.division_id), name: String(row.division_name ?? '') } : null,
          section: row.section_id ? { id: String(row.section_id), name: String(row.section_name ?? '') } : null,
        }
      : null,
  };
}

/** Maps a raw assigned-roster row into a stable response object. */
function mapRosterRow(row: Record<string, unknown>, includeAudit = false) {
  return {
    id: String(row.id),
    rosterDate: String(row.roster_date),
    assignmentStatus: (row.assignment_status as string | null) ?? 'ASSIGNED',
    remarks: (row.remarks as string | null) ?? null,
    employee: mapRosterEmployee(row),
    shift: row.shift_id
      ? {
          id: String(row.shift_id),
          code: (row.shift_code as string | null) ?? null,
          name: (row.shift_name as string | null) ?? null,
          startTime: (row.shift_start_time as string | null) ?? null,
          endTime: (row.shift_end_time as string | null) ?? null,
        }
      : null,
    attendance: row.attendance_id
      ? {
          id: String(row.attendance_id),
          status: String(row.attendance_status),
        }
      : null,
    audit: includeAudit
      ? {
          createdAt: (row.created_at as string | null) ?? null,
          updatedAt: (row.updated_at as string | null) ?? null,
          createdBy: (row.created_by_name as string | null) ?? null,
          updatedBy: (row.updated_by_name as string | null) ?? null,
        }
      : null,
  };
}

/** Maps a raw unassigned-employee row (no roster assignment) into the same response shape. */
function mapUnassignedRow(row: Record<string, unknown>) {
  return {
    id: null,
    rosterDate: null,
    assignmentStatus: null,
    remarks: null,
    employee: mapRosterEmployee(row),
    shift: null,
    attendance: row.attendance_id
      ? {
          id: String(row.attendance_id),
          status: String(row.attendance_status),
        }
      : null,
  };
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

/** Maps a raw register row (employee/org/shift/middleware joined) into a stable response object. */
function mapRegisterRow(row: Record<string, unknown>) {
  const duration = (() => {
    const inT = row.check_in as string | null;
    const outT = row.check_out as string | null;
    if (inT && outT) {
      const mins = Math.round((Date.parse(outT) - Date.parse(inT)) / 60000);
      return Number.isFinite(mins) && mins >= 0 ? mins : null;
    }
    return null;
  })();
  const lateMinutes = row.late_minutes != null ? Number(row.late_minutes) : null;

  return {
    id: String(row.id),
    date: String(row.attendance_date),
    status: String(row.status),
    employee: {
      id: String(row.employee_id),
      employeeCode: (row.employee_code as string | null) ?? null,
      firstName: (row.first_name as string | null) ?? '',
      lastName: (row.last_name as string | null) ?? '',
      email: (row.email as string | null) ?? null,
      jobTitle: (row.job_title as string | null) ?? null,
      employmentType: (row.employment_type as string | null) ?? null,
      status: (row.employee_status as string | null) ?? null,
      designation: row.designation_code
        ? {
            id: (row.designation_id as string | null) ?? null,
            code: String(row.designation_code),
            name: String(row.designation_name ?? row.designation_code),
          }
        : null,
      department: row.department_id
        ? {
            id: String(row.department_id),
            name: String(row.department_name ?? ''),
            division: row.division_id ? { id: String(row.division_id), name: String(row.division_name ?? '') } : null,
            section: row.section_id ? { id: String(row.section_id), name: String(row.section_name ?? '') } : null,
          }
        : null,
    },
    checkIn: (row.check_in as string | null) ?? null,
    checkOut: (row.check_out as string | null) ?? null,
    durationMinutes: duration,
    lateMinutes,
    late: lateMinutes !== null && lateMinutes > 0,
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

/** Maps a raw leave-request row (employee/org/leave-type/audit joined) into a stable response object. */
function mapLeaveRequestRow(row: Record<string, unknown>, includeAudit = false) {
  return {
    id: String(row.id),
    status: String(row.status),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    days: row.days != null ? Number(row.days) : null,
    reason: (row.reason as string | null) ?? null,
    remarks: (row.remarks as string | null) ?? null,
    employee: {
      id: String(row.employee_id),
      employeeCode: (row.employee_code as string | null) ?? null,
      firstName: (row.first_name as string | null) ?? '',
      lastName: (row.last_name as string | null) ?? '',
      status: (row.employee_status as string | null) ?? null,
      designation: row.designation_code
        ? {
            id: (row.designation_id as string | null) ?? null,
            code: String(row.designation_code),
            name: String(row.designation_name ?? row.designation_code),
          }
        : null,
      department: row.department_id
        ? {
            id: String(row.department_id),
            name: String(row.department_name ?? ''),
            division: row.division_id ? { id: String(row.division_id), name: String(row.division_name ?? '') } : null,
            section: row.section_id ? { id: String(row.section_id), name: String(row.section_name ?? '') } : null,
          }
        : null,
    },
    leaveType: row.leave_type_id
      ? {
          id: String(row.leave_type_id),
          code: (row.leave_type_code as string | null) ?? null,
          name: (row.leave_type_name as string | null) ?? null,
          daysPerYear: row.leave_type_days_per_year != null ? Number(row.leave_type_days_per_year) : null,
          isPaid: row.leave_type_is_paid != null ? Boolean(row.leave_type_is_paid) : null,
        }
      : null,
    audit: includeAudit
      ? {
          createdAt: (row.created_at as string | null) ?? null,
          updatedAt: (row.updated_at as string | null) ?? null,
          approvedAt: (row.approved_at as string | null) ?? null,
          createdBy: (row.created_by_name as string | null) ?? null,
          updatedBy: (row.updated_by_name as string | null) ?? null,
          approvedBy: (row.approved_by_name as string | null) ?? null,
        }
      : null,
  };
}

/** Zeroed leave summary — used for the truthful empty (unprovisioned) payload. */
function emptyLeaveSummary() {
  return {
    pending: 0,
    approved: 0,
    rejected: 0,
    cancelled: 0,
    total: 0,
    onLeaveToday: 0,
    notes: { onLeaveToday: 'ATTENDANCE' },
  };
}

export type LocationFreshnessStatus = 'LIVE' | 'RECENT' | 'STALE' | 'NO_LOCATION';

/**
 * Classifies how fresh a "last known location update" is. When there is no
 * location timestamp (the current ERP state — no geo source exists) the only
 * truthful answer is NO_LOCATION. LIVE/RECENT/STALE thresholds come from
 * LOCATION_FRESHNESS_MINUTES and are surfaced to clients.
 */
export function classifyLocationStatus(
  lastUpdatedIso: string | null | undefined,
  nowIso: string,
  thresholds: { LIVE_MAX_MINUTES: number; RECENT_MAX_MINUTES: number } = LOCATION_FRESHNESS_MINUTES,
): LocationFreshnessStatus {
  if (!lastUpdatedIso) return 'NO_LOCATION';
  const ts = Date.parse(lastUpdatedIso);
  if (!Number.isFinite(ts)) return 'NO_LOCATION';
  const ageMinutes = (Date.parse(nowIso) - ts) / 60000;
  if (ageMinutes <= thresholds.LIVE_MAX_MINUTES) return 'LIVE';
  if (ageMinutes <= thresholds.RECENT_MAX_MINUTES) return 'RECENT';
  return 'STALE';
}

/** Truthful location-source descriptor — no geo provider is configured anywhere. */
function liveMapLocationInfo() {
  return {
    provider: null,
    providerConfigured: false,
    note:
      'No attendance/device location source is configured in this ERP instance. ' +
      'Employees can appear on the map when a real GPS/attendance location is captured.',
    freshnessMinutes: { ...LOCATION_FRESHNESS_MINUTES },
  };
}

/** Zeroed live-map summary — used for the truthful empty (unprovisioned) payload. */
function emptyLiveMapSummary() {
  return {
    location: { live: 0, recent: 0, stale: 0, noLocation: 0 },
    presence: { presentNow: 0, presentToday: 0, absent: 0, onLeave: 0, halfDay: 0, holiday: 0, weekend: 0, noRecord: 0 },
    total: 0,
    notes: { live: 'DERIVED', noLocation: 'NO_GEO_SOURCE', presentNow: 'DERIVED' },
  };
}

export interface LiveMapMergedEmployee {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  jobTitle: string | null;
  employeeStatus: string | null;
  designation: { code: string; name: string } | null;
  department: {
    id: string;
    name: string;
    division: { id: string; name: string } | null;
    section: { id: string; name: string } | null;
  } | null;
  shift: { id: string; code: string | null; name: string | null; startTime: string | null; endTime: string | null } | null;
  shiftSource: 'attendance' | 'roster' | null;
  attendance: { date: string; status: string; checkIn: string | null; checkOut: string | null; presentNow: boolean } | null;
  location: {
    status: 'NO_LOCATION';
    lastUpdated: string | null;
    latitude: number | null;
    longitude: number | null;
    source: string | null;
  };
}

/** Merges an employee row with its today's attendance + roster shift. */
function mapLiveMapEmployee(
  row: Record<string, unknown>,
  attendanceByEmployee: Map<string, Record<string, unknown>>,
  rosterShiftByEmployee: Map<string, Record<string, unknown>>,
  today: string,
  nowIso: string,
): LiveMapMergedEmployee {
  const employeeId = String(row.employee_id);
  const att = attendanceByEmployee.get(employeeId);
  const rosterShift = rosterShiftByEmployee.get(employeeId);
  const attShiftId = (att?.shift_id as string | null) ?? null;

  let shift: LiveMapMergedEmployee['shift'] = null;
  let shiftSource: LiveMapMergedEmployee['shiftSource'] = null;
  if (attShiftId) {
    shift = {
      id: String(attShiftId),
      code: (att?.shift_code as string | null) ?? null,
      name: (att?.shift_name as string | null) ?? null,
      startTime: (att?.shift_start_time as string | null) ?? null,
      endTime: (att?.shift_end_time as string | null) ?? null,
    };
    shiftSource = 'attendance';
  } else if (rosterShift?.shift_id) {
    shift = {
      id: String(rosterShift.shift_id),
      code: (rosterShift.shift_code as string | null) ?? null,
      name: (rosterShift.shift_name as string | null) ?? null,
      startTime: (rosterShift.shift_start_time as string | null) ?? null,
      endTime: (rosterShift.shift_end_time as string | null) ?? null,
    };
    shiftSource = 'roster';
  }

  const status = (att?.status as string | null) ?? null;
  const checkIn = (att?.check_in as string | null) ?? null;
  const checkOut = (att?.check_out as string | null) ?? null;
  const presentNow =
    status === 'PRESENT' && Boolean(checkIn) && !checkOut && checkIn !== null && Date.parse(checkIn) <= Date.parse(nowIso);

  return {
    employeeId,
    employeeCode: String(row.employee_code ?? ''),
    employeeName: [`${row.first_name ?? ''}`, `${row.last_name ?? ''}`].filter(Boolean).join(' ').trim(),
    jobTitle: (row.job_title as string | null) ?? null,
    employeeStatus: (row.employee_status as string | null) ?? null,
    designation: row.designation_code
      ? { code: String(row.designation_code), name: String(row.designation_name ?? row.designation_code) }
      : null,
    department: row.department_id
      ? {
          id: String(row.department_id),
          name: String(row.department_name ?? ''),
          division: row.division_id ? { id: String(row.division_id), name: String(row.division_name ?? '') } : null,
          section: row.section_id ? { id: String(row.section_id), name: String(row.section_name ?? '') } : null,
        }
      : null,
    shift,
    shiftSource,
    attendance: att
      ? { date: today, status: String(status ?? 'UNKNOWN'), checkIn, checkOut, presentNow }
      : null,
    location: {
      status: 'NO_LOCATION',
      lastUpdated: null,
      latitude: null,
      longitude: null,
      source: null,
    },
  };
}

/** Applies the shift/status filters that operate on the merged today's data. */
function matchesLiveMapFilters(m: LiveMapMergedEmployee, opts: LiveMapQuery): boolean {
  if (opts.shiftId && m.shift?.id !== opts.shiftId) return false;
  if (opts.status && m.attendance?.status !== opts.status) return false;
  return true;
}

/** Real location + presence counts over the filtered employee set. */
function computeLiveMapSummary(employees: LiveMapMergedEmployee[]) {
  const location = { live: 0, recent: 0, stale: 0, noLocation: employees.length };
  const presence = {
    presentNow: 0,
    presentToday: 0,
    absent: 0,
    onLeave: 0,
    halfDay: 0,
    holiday: 0,
    weekend: 0,
    noRecord: 0,
  };
  for (const e of employees) {
    if (!e.attendance) {
      presence.noRecord += 1;
      continue;
    }
    if (e.attendance.presentNow) presence.presentNow += 1;
    switch (e.attendance.status) {
      case 'PRESENT':
        presence.presentToday += 1;
        break;
      case 'ABSENT':
        presence.absent += 1;
        break;
      case 'LEAVE':
        presence.onLeave += 1;
        break;
      case 'HALF_DAY':
        presence.halfDay += 1;
        break;
      case 'HOLIDAY':
        presence.holiday += 1;
        break;
      case 'WEEKEND':
        presence.weekend += 1;
        break;
      default:
        presence.noRecord += 1;
    }
  }
  return {
    location,
    presence,
    total: employees.length,
    notes: { live: 'DERIVED', noLocation: 'NO_GEO_SOURCE', presentNow: 'DERIVED' },
  };
}