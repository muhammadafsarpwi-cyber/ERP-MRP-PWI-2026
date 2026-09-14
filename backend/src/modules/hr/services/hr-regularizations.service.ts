import { Injectable, BadRequestException, NotFoundException, UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HrRegularization } from '../entities/hr-regularization.entity';
import { HrAttendanceHistory } from '../entities/hr-attendance-history.entity';
import { HrAttendance } from '../entities/hr-attendance.entity';
import { HrEmployee } from '../entities/hr-employee.entity';
import { HrLeaveRequest } from '../entities/hr-leave-request.entity';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import {
  CreateRegularizationDto, UpdateRegularizationDto, RegularizationDecisionDto,
  HR_REGULARIZATION_TYPES,
} from '../dto';
import crypto from 'crypto';

const HR_REG_BLOCKED_STATUSES = new Set(['LEAVE', 'HOLIDAY', 'WEEKEND']);
const HR_REG_BLOCKED_REQ_STATUS = new Set(['LEAVE', 'HOLIDAY', 'WEEKEND']);

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

@Injectable()
export class HrRegularizationsService {
  constructor(
    @InjectRepository(HrRegularization) private readonly regRepo: Repository<HrRegularization>,
    @InjectRepository(HrAttendanceHistory) private readonly historyRepo: Repository<HrAttendanceHistory>,
    @InjectRepository(HrAttendance) private readonly attendanceRepo: Repository<HrAttendance>,
    @InjectRepository(HrEmployee) private readonly employeeRepo: Repository<HrEmployee>,
    @InjectRepository(HrLeaveRequest) private readonly leaveRepo: Repository<HrLeaveRequest>,
    @InjectRepository(Department) private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Division) private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Section) private readonly sectionRepo: Repository<Section>,
    @InjectRepository(ErpUser) private readonly userRepo: Repository<ErpUser>,
  ) {}

  // ── auth helpers ────────────────────────────────────────────────────────────

  private async resolveAuthUser(authUserId: string) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    if (user.status !== 'ACTIVE') throw new ForbiddenException('User account is inactive');
    return user;
  }

  /** Resolve employee for the request, enforcing self-service restriction. */
  private async resolveEmployee(user: ErpUser, companyId: string, requestedEmployeeId?: string) {
    if (user.employeeId) {
      const me = await this.employeeRepo.findOne({ where: { employeeCode: user.employeeId, companyId } });
      if (!me) throw new ForbiddenException('Your account is not linked to an employee in the current company');
      if (requestedEmployeeId && requestedEmployeeId !== me.id) {
        throw new ForbiddenException('Self-service users are restricted to their own attendance record');
      }
      return me;
    }
    if (!requestedEmployeeId) throw new BadRequestException('employeeId is required');
    const emp = await this.employeeRepo.findOne({ where: { id: requestedEmployeeId, companyId } });
    if (!emp) throw new BadRequestException('Employee not found in the current company');
    return emp;
  }

  private async assertFilterIds(companyId: string, opts: Record<string, any>) {
    if (opts.employeeId && !(await this.employeeRepo.findOne({ where: { id: opts.employeeId, companyId } })))
      throw new BadRequestException('Employee not found in the current company');
    if (opts.departmentId && !(await this.departmentRepo.findOne({ where: { id: opts.departmentId, companyId } })))
      throw new BadRequestException('Department not found in the current company');
    if (opts.divisionId && !(await this.divisionRepo.findOne({ where: { id: opts.divisionId, companyId } })))
      throw new BadRequestException('Division not found in the current company');
    if (opts.sectionId && !(await this.sectionRepo.findOne({ where: { id: opts.sectionId, companyId } })))
      throw new BadRequestException('Section not found in the current company');
  }

  // ── options ─────────────────────────────────────────────────────────────────

  async getRegularizationOptions(authUserId: string) {
    const user = await this.resolveAuthUser(authUserId);
    const empty = {
      companyId: null as string | null,
      today: fmt(new Date()),
      divisions: [] as any[],
      sections: [] as any[],
      departments: [] as any[],
      employees: [] as any[],
      statuses: ['SUBMITTED', 'APPROVED', 'REJECTED'],
      types: HR_REGULARIZATION_TYPES,
      self: { employeeId: null as string | null, employeeCode: null as string | null, name: null as string | null },
    };
    if (!user.defaultCompanyId) return empty;

    const [divisions, sections, departments, employees] = await Promise.all([
      this.divisionRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.sectionRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.departmentRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.employeeRepo.find({ where: { companyId: user.defaultCompanyId, isActive: true, status: 'ACTIVE' }, order: { employeeCode: 'ASC' } }),
    ]);

    let self = { employeeId: null as string | null, employeeCode: null as string | null, name: null as string | null };
    if (user.employeeId) {
      const me = employees.find((e) => e.employeeCode === user.employeeId);
      if (me) self = { employeeId: me.id, employeeCode: me.employeeCode, name: `${me.firstName} ${me.lastName ?? ''}`.trim() };
    }

    return {
      companyId: user.defaultCompanyId,
      today: fmt(new Date()),
      divisions: divisions.map((d) => ({ id: d.id, code: d.divisionCode, name: d.name })),
      sections: sections.map((s) => ({ id: s.id, code: s.sectionCode, name: s.name, divisionId: s.divisionId })),
      departments: departments.map((d) => ({ id: d.id, code: d.departmentCode, name: d.name, divisionId: d.divisionId, sectionId: d.sectionId })),
      employees: employees.map((e) => ({ id: e.id, employeeCode: e.employeeCode, firstName: e.firstName, lastName: e.lastName ?? null, departmentId: e.departmentId ?? null })),
      statuses: ['SUBMITTED', 'APPROVED', 'REJECTED'],
      types: HR_REGULARIZATION_TYPES,
      self,
    };
  }

  // ── list / detail ───────────────────────────────────────────────────────────

  async listRegularizations(authUserId: string, options: Record<string, any> = {}) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) return this.emptyBase('NO_DEFAULT_COMPANY', options);

    const page = Number(options.page) || 1;
    const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 500);
    if (options.dateFrom && options.dateTo && options.dateFrom > options.dateTo)
      throw new BadRequestException('From date must not be after to date');
    await this.assertFilterIds(companyId, options);

    const [records, total, summary] = await Promise.all([
      this.fetchRows(companyId, { ...options, page, limit }),
      this.countRows(companyId, options),
      this.computeSummary(companyId, options),
    ]);

    return {
      asOf: fmt(new Date()),
      range: { dateFrom: options.dateFrom ?? null, dateTo: options.dateTo ?? null },
      companyId,
      reason: null as string | null,
      summary,
      records,
      total,
      page,
      limit,
    };
  }

  private emptyBase(reason: string, opts: Record<string, any> = {}) {
    return {
      asOf: fmt(new Date()),
      range: { dateFrom: opts.dateFrom ?? null, dateTo: opts.dateTo ?? null },
      companyId: null as string | null,
      reason,
      summary: { submitted: 0, approved: 0, rejected: 0, today: 0, total: 0, notes: { onLeaveToday: 'ATTENDANCE' } },
      records: [],
      total: 0,
      page: Number(opts.page) || 1,
      limit: Math.min(Math.max(Number(opts.limit) || 10, 1), 500),
    };
  }

  private addJoins(qb: any) {
    qb.leftJoin(HrEmployee, 'e', 'e.id = r.employeeId AND e.companyId = r.companyId');
    qb.leftJoin(Department, 'd', 'd.id = e.departmentId AND d.companyId = r.companyId');
    qb.leftJoin(Division, 'div', 'div.id = d.divisionId AND div.companyId = r.companyId');
    qb.leftJoin(Section, 'sec', 'sec.id = d.sectionId AND sec.companyId = r.companyId');
  }

  private applyFilters(qb: any, companyId: string, opts: Record<string, any>, includeStatus = true) {
    qb.where('r.companyId = :companyId', { companyId });
    qb.andWhere('r.isActive = true');
    if (opts.employeeId) qb.andWhere('r.employeeId = :employeeId', { employeeId: opts.employeeId });
    if (opts.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: opts.departmentId });
    if (opts.divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId: opts.divisionId });
    if (opts.sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId: opts.sectionId });
    if (opts.type) qb.andWhere('r.correctionType = :correctionType', { correctionType: opts.type });
    if (opts.dateFrom) qb.andWhere(`TO_CHAR(r.attendanceDate, 'YYYY-MM-DD') >= :dateFrom`, { dateFrom: opts.dateFrom });
    if (opts.dateTo) qb.andWhere(`TO_CHAR(r.attendanceDate, 'YYYY-MM-DD') <= :dateTo`, { dateTo: opts.dateTo });
    if (includeStatus && opts.status) qb.andWhere('r.status = :status', { status: opts.status });
    if (opts.search) qb.andWhere('(e.firstName ILIKE :s OR e.lastName ILIKE :s OR e.employeeCode ILIKE :s)', { s: `%${opts.search}%` });
  }

  private async fetchRows(companyId: string, opts: Record<string, any> & { page: number; limit: number }) {
    const qb = this.regRepo.createQueryBuilder('r');
    qb.select('r.id', 'id');
    qb.addSelect('r.employeeId', 'employee_id');
    qb.addSelect('r.attendanceId', 'attendance_id');
    qb.addSelect('r.requestNo', 'request_no');
    qb.addSelect(`TO_CHAR(r.attendanceDate, 'YYYY-MM-DD')`, 'attendance_date');
    qb.addSelect('r.correctionType', 'correction_type');
    qb.addSelect('r.reason', 'reason');
    qb.addSelect('r.status', 'status');
    qb.addSelect('r.currentCheckIn', 'current_check_in');
    qb.addSelect('r.currentCheckOut', 'current_check_out');
    qb.addSelect('r.currentStatus', 'current_status');
    qb.addSelect('r.requestedCheckIn', 'requested_check_in');
    qb.addSelect('r.requestedCheckOut', 'requested_check_out');
    qb.addSelect('r.requestedStatus', 'requested_status');
    qb.addSelect('r.approvedCheckIn', 'approved_check_in');
    qb.addSelect('r.approvedCheckOut', 'approved_check_out');
    qb.addSelect('r.approvedStatus', 'approved_status');
    qb.addSelect('r.remarks', 'remarks');
    qb.addSelect('r.decisionRemarks', 'decision_remarks');
    qb.addSelect(`TO_CHAR(r.submittedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'submitted_at');
    qb.addSelect(`TO_CHAR(r.decidedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'decided_at');
    qb.addSelect(`TO_CHAR(r.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'created_at');
    qb.addSelect(`TO_CHAR(r.updatedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'updated_at');
    qb.addSelect('e.employeeCode', 'employee_code');
    qb.addSelect('e.firstName', 'first_name');
    qb.addSelect('e.lastName', 'last_name');
    qb.addSelect('e.jobTitle', 'job_title');
    qb.addSelect('e.status', 'employee_status');
    qb.addSelect('d.id', 'department_id');
    qb.addSelect('d.name', 'department_name');
    qb.addSelect('div.id', 'division_id');
    qb.addSelect('div.name', 'division_name');
    qb.addSelect('sec.id', 'section_id');
    qb.addSelect('sec.name', 'section_name');
    qb.addSelect('cu.displayName', 'created_by_name');
    qb.addSelect('du.displayName', 'decided_by_name');
    this.addJoins(qb);
    qb.leftJoin(ErpUser, 'cu', 'cu.id = r.createdBy');
    qb.leftJoin(ErpUser, 'du', 'du.id = r.decidedBy');
    this.applyFilters(qb, companyId, opts);
    qb.orderBy('r.submittedAt', 'DESC');
    qb.addOrderBy('e.employeeCode', 'ASC');
    qb.offset((opts.page - 1) * opts.limit).limit(opts.limit);
    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map(mapRow);
  }

  private async countRows(companyId: string, opts: Record<string, any>): Promise<number> {
    const qb = this.regRepo.createQueryBuilder('r');
    this.addJoins(qb);
    this.applyFilters(qb, companyId, opts);
    return qb.getCount();
  }

  private async computeSummary(companyId: string, opts: Record<string, any>) {
    const qb = this.regRepo.createQueryBuilder('r');
    qb.select(`COUNT(*) FILTER (WHERE r.status = 'SUBMITTED')`, 'submitted');
    qb.addSelect(`COUNT(*) FILTER (WHERE r.status = 'APPROVED')`, 'approved');
    qb.addSelect(`COUNT(*) FILTER (WHERE r.status = 'REJECTED')`, 'rejected');
    qb.addSelect('COUNT(*)', 'total');
    this.addJoins(qb);
    this.applyFilters(qb, companyId, opts, false);
    const row = (await qb.getRawOne<Record<string, unknown>>()) ?? {};

    const today = fmt(new Date());
    const tQb = this.regRepo.createQueryBuilder('r');
    tQb.select('COUNT(*)', 'c');
    this.addJoins(tQb);
    this.applyFilters(tQb, companyId, opts, false);
    tQb.andWhere(`TO_CHAR(r.attendanceDate, 'YYYY-MM-DD') = :today`, { today });
    const tRow = (await tQb.getRawOne<Record<string, unknown>>()) ?? {};

    return {
      submitted: Number(row.submitted) || 0,
      approved: Number(row.approved) || 0,
      rejected: Number(row.rejected) || 0,
      today: Number(tRow.c) || 0,
      total: Number(row.total) || 0,
      notes: { onLeaveToday: 'ATTENDANCE' },
    };
  }

  async getById(authUserId: string, id: string) {
    const user = await this.resolveAuthUser(authUserId);
    if (!user.defaultCompanyId) throw new BadRequestException('No default company configured for this account');

    const qb = this.regRepo.createQueryBuilder('r');
    qb.select('r.id', 'id');
    qb.addSelect('r.employeeId', 'employee_id');
    qb.addSelect('r.attendanceId', 'attendance_id');
    qb.addSelect('r.requestNo', 'request_no');
    qb.addSelect(`TO_CHAR(r.attendanceDate, 'YYYY-MM-DD')`, 'attendance_date');
    qb.addSelect('r.correctionType', 'correction_type');
    qb.addSelect('r.reason', 'reason');
    qb.addSelect('r.status', 'status');
    qb.addSelect('r.currentCheckIn', 'current_check_in');
    qb.addSelect('r.currentCheckOut', 'current_check_out');
    qb.addSelect('r.currentStatus', 'current_status');
    qb.addSelect('r.requestedCheckIn', 'requested_check_in');
    qb.addSelect('r.requestedCheckOut', 'requested_check_out');
    qb.addSelect('r.requestedStatus', 'requested_status');
    qb.addSelect('r.approvedCheckIn', 'approved_check_in');
    qb.addSelect('r.approvedCheckOut', 'approved_check_out');
    qb.addSelect('r.approvedStatus', 'approved_status');
    qb.addSelect('r.remarks', 'remarks');
    qb.addSelect('r.decisionRemarks', 'decision_remarks');
    qb.addSelect(`TO_CHAR(r.submittedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'submitted_at');
    qb.addSelect(`TO_CHAR(r.decidedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'decided_at');
    qb.addSelect(`TO_CHAR(r.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'created_at');
    qb.addSelect(`TO_CHAR(r.updatedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'updated_at');
    qb.addSelect('e.employeeCode', 'employee_code');
    qb.addSelect('e.firstName', 'first_name');
    qb.addSelect('e.lastName', 'last_name');
    qb.addSelect('e.jobTitle', 'job_title');
    qb.addSelect('e.status', 'employee_status');
    qb.addSelect('d.id', 'department_id');
    qb.addSelect('d.name', 'department_name');
    qb.addSelect('div.id', 'division_id');
    qb.addSelect('div.name', 'division_name');
    qb.addSelect('sec.id', 'section_id');
    qb.addSelect('sec.name', 'section_name');
    qb.addSelect('cu.displayName', 'created_by_name');
    qb.addSelect('du.displayName', 'decided_by_name');
    this.addJoins(qb);
    qb.leftJoin(ErpUser, 'cu', 'cu.id = r.createdBy');
    qb.leftJoin(ErpUser, 'du', 'du.id = r.decidedBy');
    qb.where('r.id = :id', { id });
    qb.andWhere('r.companyId = :companyId', { companyId: user.defaultCompanyId });
    qb.andWhere('r.isActive = true');

    const row = await qb.getRawOne<Record<string, unknown>>();
    if (!row) throw new NotFoundException('Regularization request not found');

    // current attendance truth (fresher than what the request recorded)
    const att = await this.attendanceRepo.findOne({ where: { employeeId: row.employee_id as string, attendanceDate: new Date(row.attendance_date as string + 'T00:00:00') } });

    return {
      ...mapRow(row),
      currentAttendance: att ? {
        checkIn: att.checkIn ? att.checkIn.toISOString() : null,
        checkOut: att.checkOut ? att.checkOut.toISOString() : null,
        status: att.status,
        shiftId: att.shiftId,
      } : null,
    };
  }

  // ── create ──────────────────────────────────────────────────────────────────

  async create(authUserId: string, dto: CreateRegularizationDto) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const employee = await this.resolveEmployee(user, companyId, dto.employeeId);
    if (employee.status !== 'ACTIVE') throw new BadRequestException('Cannot submit a regularization for an inactive employee');

    // date validation
    const today = fmt(new Date());
    if (dto.attendanceDate > today) throw new BadRequestException('Regularization cannot be requested for a future date');

    // duplicate protection (DB unique partial index enforces this too)
    const existing = await this.regRepo.findOne({ where: { companyId, employeeId: employee.id, attendanceDate: new Date(dto.attendanceDate + 'T00:00:00'), isActive: true, status: 'SUBMITTED' } });
    if (existing) throw new ConflictException('An active regularization request already exists for this date');

    // current attendance snapshot
    const att = await this.attendanceRepo.findOne({ where: { employeeId: employee.id, attendanceDate: new Date(dto.attendanceDate + 'T00:00:00') } });

    // conflict: approved-attendance-status or approved-leave blocking
    if (att && HR_REG_BLOCKED_STATUSES.has(att.status)) {
      throw new BadRequestException(`Attendance on this date is recorded as ${att.status}; use the appropriate module instead`);
    }
    const approvedLeave = await this.leaveRepo.createQueryBuilder('l')
      .where('l.companyId = :c AND l.employeeId = :e AND l.isActive = true AND l.status = :s AND TO_CHAR(l.startDate,\'YYYY-MM-DD\') <= :d AND TO_CHAR(l.endDate,\'YYYY-MM-DD\') >= :d', { c: companyId, e: employee.id, s: 'APPROVED', d: dto.attendanceDate })
      .getOne();
    if (approvedLeave) throw new BadRequestException('Date is covered by an approved leave');

    // type-driven field validation
    this.validateRequestFields(dto, dto.attendanceDate);

    const requestNo = 'RGZ-' + crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();

    const rec = this.regRepo.create({
      requestNo,
      companyId,
      employeeId: employee.id,
      attendanceId: att?.id ?? null,
      attendanceDate: new Date(dto.attendanceDate + 'T00:00:00'),
      correctionType: dto.correctionType,
      reason: dto.reason,
      currentCheckIn: att?.checkIn ?? null,
      currentCheckOut: att?.checkOut ?? null,
      currentStatus: att?.status ?? null,
      requestedCheckIn: dto.requestedCheckIn ? new Date(dto.requestedCheckIn) : null,
      requestedCheckOut: dto.requestedCheckOut ? new Date(dto.requestedCheckOut) : null,
      requestedStatus: dto.requestedStatus ?? null,
      remarks: dto.remarks ?? null,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      submittedBy: user.id,
      createdBy: user.id,
      updatedBy: user.id,
    });

    const saved = await this.regRepo.save(rec);
    // return with full detail
    return this.getById(authUserId, saved.id);
  }

  // ── update ──────────────────────────────────────────────────────────────────

  async update(authUserId: string, id: string, dto: UpdateRegularizationDto) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.regRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Regularization request not found');
    if (rec.status !== 'SUBMITTED') throw new BadRequestException('Only submitted regularizations can be updated');
    if (rec.createdBy !== user.id) throw new ForbiddenException('Only the requester can edit this regularization');

    // merge new values on top of existing
    const mergedCorrectionType = dto.correctionType ?? rec.correctionType;
    const mergedReason = dto.reason ?? rec.reason;
    const mergedCheckIn = dto.requestedCheckIn ? new Date(dto.requestedCheckIn) : rec.requestedCheckIn;
    const mergedCheckOut = dto.requestedCheckOut ? new Date(dto.requestedCheckOut) : rec.requestedCheckOut;
    const mergedStatus = dto.requestedStatus ?? rec.requestedStatus;
    const mergedRemarks = dto.remarks !== undefined ? dto.remarks : rec.remarks;

    const mergedDto = { correctionType: mergedCorrectionType, reason: mergedReason, requestedCheckIn: mergedCheckIn?.toISOString(), requestedCheckOut: mergedCheckOut?.toISOString(), requestedStatus: mergedStatus, remarks: mergedRemarks } as any;
    this.validateRequestFields(mergedDto, fmt(new Date(rec.attendanceDate)));

    // re-check leave conflict (still valid)
    const attDateStr = fmt(new Date(rec.attendanceDate));
    const approvedLeave = await this.leaveRepo.createQueryBuilder('l')
      .where('l.companyId = :c AND l.employeeId = :e AND l.isActive = true AND l.status = :s AND TO_CHAR(l.startDate,\'YYYY-MM-DD\') <= :d AND TO_CHAR(l.endDate,\'YYYY-MM-DD\') >= :d', { c: companyId, e: rec.employeeId, s: 'APPROVED', d: attDateStr })
      .getOne();
    if (approvedLeave) throw new BadRequestException('Date is covered by an approved leave');

    rec.correctionType = mergedCorrectionType;
    rec.reason = mergedReason;
    rec.requestedCheckIn = mergedCheckIn;
    rec.requestedCheckOut = mergedCheckOut;
    rec.requestedStatus = mergedStatus;
    rec.remarks = mergedRemarks;
    rec.updatedBy = user.id;
    await this.regRepo.save(rec);
    return this.getById(authUserId, rec.id);
  }

  // ── delete ──────────────────────────────────────────────────────────────────

  async delete(authUserId: string, id: string) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.regRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Regularization request not found');
    if (rec.status !== 'SUBMITTED') throw new BadRequestException('Only submitted regularizations can be removed');

    rec.isActive = false;
    rec.updatedBy = user.id;
    await this.regRepo.save(rec);
    return { id: rec.id, deleted: true };
  }

  // ── approve ─────────────────────────────────────────────────────────────────

  async approve(authUserId: string, id: string, dto: RegularizationDecisionDto = {}) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.regRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Regularization request not found');
    if (rec.status !== 'SUBMITTED') throw new BadRequestException('Only submitted regularizations can be approved');

    // re-check conflicts at decision time
    const attDateStr = fmt(new Date(rec.attendanceDate));
    const approvedLeave = await this.leaveRepo.createQueryBuilder('l')
      .where('l.companyId = :c AND l.employeeId = :e AND l.isActive = true AND l.status = :s AND TO_CHAR(l.startDate,\'YYYY-MM-DD\') <= :d AND TO_CHAR(l.endDate,\'YYYY-MM-DD\') >= :d', { c: companyId, e: rec.employeeId, s: 'APPROVED', d: attDateStr })
      .getOne();
    if (approvedLeave) throw new BadRequestException('Date is covered by an approved leave — cannot apply regularization');

    // find or create attendance
    let att = await this.attendanceRepo.findOne({ where: { employeeId: rec.employeeId, attendanceDate: new Date(attDateStr + 'T00:00:00') } });
    const isInsert = !att;
    if (isInsert) {
      att = await this.attendanceRepo.save(this.attendanceRepo.create({
        companyId,
        employeeId: rec.employeeId,
        attendanceDate: new Date(attDateStr + 'T00:00:00'),
        shiftId: null,
        status: rec.requestedStatus ?? 'PRESENT',
        checkIn: rec.requestedCheckIn ?? null,
        checkOut: rec.requestedCheckOut ?? null,
        createdBy: user.id,
        updatedBy: user.id,
      }));
    }
    const target = att as HrAttendance;

    // snapshot BEFORE update
    const snapshot: Record<string, unknown> = {
      id: target.id,
      companyId: target.companyId,
      employeeId: target.employeeId,
      attendanceDate: attDateStr,
      shiftId: target.shiftId,
      checkIn: target.checkIn ? target.checkIn.toISOString() : null,
      checkOut: target.checkOut ? target.checkOut.toISOString() : null,
      status: target.status,
      overtimeMinutes: target.overtimeMinutes,
      remarks: target.remarks,
    };

    // apply correction
    const changed: string[] = [];
    if (rec.correctionType === 'CHECK_IN' || rec.correctionType === 'CHECK_IN_OUT') {
      if (target.checkIn?.toISOString() !== rec.requestedCheckIn?.toISOString()) changed.push('check_in');
      target.checkIn = rec.requestedCheckIn ?? target.checkIn;
    }
    if (rec.correctionType === 'CHECK_OUT' || rec.correctionType === 'CHECK_IN_OUT') {
      if (target.checkOut?.toISOString() !== rec.requestedCheckOut?.toISOString()) changed.push('check_out');
      target.checkOut = rec.requestedCheckOut ?? target.checkOut;
    }
    if (rec.correctionType === 'STATUS') {
      if (target.status !== rec.requestedStatus) changed.push('status');
      target.status = rec.requestedStatus ?? target.status;
    }
    target.updatedBy = user.id;
    await this.attendanceRepo.save(target);

    await this.historyRepo.save(this.historyRepo.create({
      companyId,
      attendanceId: target.id,
      regularizationId: rec.id,
      operation: isInsert ? 'INSERT' : 'UPDATE',
      snapshot,
      changedFields: changed,
      createdBy: user.id,
    }));

    rec.status = 'APPROVED';
    rec.approvedCheckIn = target.checkIn;
    rec.approvedCheckOut = target.checkOut;
    rec.approvedStatus = target.status;
    rec.decidedBy = user.id;
    rec.decidedAt = new Date();
    rec.decisionRemarks = dto.remarks ?? null;
    rec.updatedBy = user.id;
    await this.regRepo.save(rec);
    return this.getById(authUserId, rec.id);
  }

  // ── reject ──────────────────────────────────────────────────────────────────

  async reject(authUserId: string, id: string, dto: RegularizationDecisionDto = {}) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.regRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Regularization request not found');
    if (rec.status !== 'SUBMITTED') throw new BadRequestException('Only submitted regularizations can be rejected');

    rec.status = 'REJECTED';
    rec.decidedBy = user.id;
    rec.decidedAt = new Date();
    rec.decisionRemarks = dto.remarks ?? null;
    rec.updatedBy = user.id;
    await this.regRepo.save(rec);
    return this.getById(authUserId, rec.id);
  }

  // ── validation helpers ──────────────────────────────────────────────────────

  private validateRequestFields(dto: { correctionType: string; requestedCheckIn?: string; requestedCheckOut?: string; requestedStatus?: string }, attendanceDateStr: string) {
    const t = dto.correctionType;
    if (!HR_REGULARIZATION_TYPES.includes(t)) throw new BadRequestException('Invalid correctionType');

    if (t === 'CHECK_IN' && !dto.requestedCheckIn) throw new BadRequestException('requestedCheckIn is required for CHECK_IN correction');
    if (t === 'CHECK_OUT' && !dto.requestedCheckOut) throw new BadRequestException('requestedCheckOut is required for CHECK_OUT correction');
    if (t === 'CHECK_IN_OUT' && (!dto.requestedCheckIn || !dto.requestedCheckOut)) throw new BadRequestException('requestedCheckIn and requestedCheckOut are required for CHECK_IN_OUT correction');
    if (t === 'STATUS' && !dto.requestedStatus) throw new BadRequestException('requestedStatus is required for STATUS correction');

    if (dto.requestedStatus && HR_REG_BLOCKED_REQ_STATUS.has(dto.requestedStatus)) throw new BadRequestException(`Cannot request status ${dto.requestedStatus} via regularization`);

    if (dto.requestedCheckIn) {
      const d = fmt(new Date(dto.requestedCheckIn));
      if (d !== attendanceDateStr) throw new BadRequestException('requestedCheckIn must be on the attendance date');
    }
    if (dto.requestedCheckOut) {
      const d = fmt(new Date(dto.requestedCheckOut));
      if (d !== attendanceDateStr) throw new BadRequestException('requestedCheckOut must be on the attendance date');
    }
    if (dto.requestedCheckIn && dto.requestedCheckOut) {
      if (new Date(dto.requestedCheckIn) >= new Date(dto.requestedCheckOut)) throw new BadRequestException('Requested check-in must be before check-out');
    }
  }
}

// ── row mapper ────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? row.r_id),
    requestNo: String(row.request_no),
    attendanceDate: String(row.attendance_date),
    correctionType: String(row.correction_type),
    reason: String(row.reason),
    status: String(row.status),
    currentCheckIn: (row.current_check_in as string | null) ?? null,
    currentCheckOut: (row.current_check_out as string | null) ?? null,
    currentStatus: (row.current_status as string | null) ?? null,
    requestedCheckIn: (row.requested_check_in as string | null) ?? null,
    requestedCheckOut: (row.requested_check_out as string | null) ?? null,
    requestedStatus: (row.requested_status as string | null) ?? null,
    approvedCheckIn: (row.approved_check_in as string | null) ?? null,
    approvedCheckOut: (row.approved_check_out as string | null) ?? null,
    approvedStatus: (row.approved_status as string | null) ?? null,
    remarks: (row.remarks as string | null) ?? null,
    decisionRemarks: (row.decision_remarks as string | null) ?? null,
    submittedAt: (row.submitted_at as string | null) ?? null,
    decidedAt: (row.decided_at as string | null) ?? null,
    employee: {
      id: String(row.employee_id ?? ''),
      employeeCode: (row.employee_code as string | null) ?? null,
      firstName: (row.first_name as string | null) ?? '',
      lastName: (row.last_name as string | null) ?? '',
      jobTitle: (row.job_title as string | null) ?? null,
      status: (row.employee_status as string | null) ?? null,
      department: row.department_id
        ? {
            id: String(row.department_id),
            name: String(row.department_name ?? ''),
            division: row.division_id ? { id: String(row.division_id), name: String(row.division_name ?? '') } : null,
            section: row.section_id ? { id: String(row.section_id), name: String(row.section_name ?? '') } : null,
          }
        : null,
    },
    audit: {
      createdAt: (row.created_at as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? null,
      createdBy: (row.created_by_name as string | null) ?? null,
      decidedBy: (row.decided_by_name as string | null) ?? null,
    },
  };
}
