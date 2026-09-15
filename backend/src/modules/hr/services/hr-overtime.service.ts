import { Injectable, BadRequestException, NotFoundException, UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HrOvertime } from '../entities/hr-overtime.entity';
import { HrOvertimeHistory } from '../entities/hr-overtime-history.entity';
import { HrAttendance } from '../entities/hr-attendance.entity';
import { HrEmployee } from '../entities/hr-employee.entity';
import { HrShift } from '../entities/hr-shift.entity';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { CreateOvertimeDto, UpdateOvertimeDto, ApproveOvertimeDto, RejectOvertimeDto } from '../dto';
import crypto from 'crypto';

const HR_OT_BLOCKED_STATUSES = new Set(['LEAVE', 'HOLIDAY', 'WEEKEND']);

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse a PG `time` string like `17:00:00` into HH:MM. */
function timeHm(t: string | null): string | null {
  if (!t) return null;
  const m = t.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : t;
}

/**
 * Candidate overtime (display-only) = minutes between the actual check-out and
 * the shift's scheduled end on the same working date, computed deterministically
 * in UTC. Never written to hr_attendance — the approved amount lives only on
 * the overtime request.
 */
function candidateOvertimeMinutes(row: Record<string, unknown>): number | null {
  const out = row.check_out as string | null;
  const st = row.shift_start as string | null;
  const et = row.shift_end as string | null;
  if (!out || !st || !et) return null;
  const dateStr = String(row.overtime_date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const start = new Date(`${dateStr}T${st}Z`);
  const end = new Date(`${dateStr}T${et}Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  if (end <= start) end.setUTCDate(end.getUTCDate() + 1);
  const outMs = Date.parse(out);
  if (!Number.isFinite(outMs)) return null;
  const diff = Math.round((outMs - end.getTime()) / 60000);
  return diff > 0 ? diff : 0;
}

function durationMinutes(row: Record<string, unknown>): number | null {
  const inMs = row.check_in ? Date.parse(row.check_in as string) : NaN;
  const outMs = row.check_out ? Date.parse(row.check_out as string) : NaN;
  if (!Number.isFinite(inMs) || !Number.isFinite(outMs)) return null;
  return Math.max(Math.round((outMs - inMs) / 60000), 0);
}

@Injectable()
export class HrOvertimeService {
  constructor(
    @InjectRepository(HrOvertime) private readonly otRepo: Repository<HrOvertime>,
    @InjectRepository(HrOvertimeHistory) private readonly historyRepo: Repository<HrOvertimeHistory>,
    @InjectRepository(HrAttendance) private readonly attendanceRepo: Repository<HrAttendance>,
    @InjectRepository(HrEmployee) private readonly employeeRepo: Repository<HrEmployee>,
    @InjectRepository(HrShift) private readonly shiftRepo: Repository<HrShift>,
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
    if (opts.shiftId && !(await this.shiftRepo.findOne({ where: { id: opts.shiftId, companyId } })))
      throw new BadRequestException('Shift not found in the current company');
  }

  // ── options ─────────────────────────────────────────────────────────────────

  async getOvertimeOptions(authUserId: string) {
    const user = await this.resolveAuthUser(authUserId);
    const empty = {
      companyId: null as string | null,
      today: fmt(new Date()),
      divisions: [] as any[],
      sections: [] as any[],
      departments: [] as any[],
      employees: [] as any[],
      shifts: [] as any[],
      statuses: ['PENDING', 'APPROVED', 'REJECTED'],
      self: { employeeId: null as string | null, employeeCode: null as string | null, name: null as string | null },
    };
    if (!user.defaultCompanyId) return empty;

    const [divisions, sections, departments, employees, shifts] = await Promise.all([
      this.divisionRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.sectionRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.departmentRepo.find({ where: { companyId: user.defaultCompanyId }, order: { name: 'ASC' } }),
      this.employeeRepo.find({ where: { companyId: user.defaultCompanyId, isActive: true, status: 'ACTIVE' }, order: { employeeCode: 'ASC' } }),
      this.shiftRepo.find({ where: { companyId: user.defaultCompanyId }, order: { shiftName: 'ASC' } }),
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
      shifts: shifts.map((s) => ({ id: s.id, code: s.shiftCode, name: s.shiftName, startTime: timeHm(s.startTime as unknown as string), endTime: timeHm(s.endTime as unknown as string), workingHours: s.workingHours != null ? Number(s.workingHours) : null })),
      statuses: ['PENDING', 'APPROVED', 'REJECTED'],
      self,
    };
  }

  // ── list / detail ───────────────────────────────────────────────────────────

  async listOvertime(authUserId: string, options: Record<string, any> = {}) {
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
      summary: {
        pending: 0, approved: 0, rejected: 0, today: 0,
        totalRequestedHours: 0, totalApprovedHours: 0, total: 0,
        notes: { candidateOvertime: 'COMPUTED' },
      },
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

  private addDataJoins(qb: any) {
    qb.leftJoin(HrAttendance, 'a', 'a.id = r.attendanceId');
    qb.leftJoin(HrShift, 'sh', 'sh.id = r.shiftId');
  }

  private applyFilters(qb: any, companyId: string, opts: Record<string, any>, includeStatus = true) {
    qb.where('r.companyId = :companyId', { companyId });
    qb.andWhere('r.isActive = true');
    if (opts.employeeId) qb.andWhere('r.employeeId = :employeeId', { employeeId: opts.employeeId });
    if (opts.departmentId) qb.andWhere('e.departmentId = :departmentId', { departmentId: opts.departmentId });
    if (opts.divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId: opts.divisionId });
    if (opts.sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId: opts.sectionId });
    if (opts.shiftId) qb.andWhere('r.shiftId = :shiftId', { shiftId: opts.shiftId });
    if (opts.dateFrom) qb.andWhere(`TO_CHAR(r.overtimeDate, 'YYYY-MM-DD') >= :dateFrom`, { dateFrom: opts.dateFrom });
    if (opts.dateTo) qb.andWhere(`TO_CHAR(r.overtimeDate, 'YYYY-MM-DD') <= :dateTo`, { dateTo: opts.dateTo });
    if (includeStatus && opts.status) qb.andWhere('r.status = :status', { status: opts.status });
    if (opts.search) qb.andWhere('(e.firstName ILIKE :s OR e.lastName ILIKE :s OR e.employeeCode ILIKE :s)', { s: `%${opts.search}%` });
  }

  private selectBaseColumns(qb: any) {
    qb.select('r.id', 'id');
    qb.addSelect('r.employeeId', 'employee_id');
    qb.addSelect('r.attendanceId', 'attendance_id');
    qb.addSelect('r.refNo', 'ref_no');
    qb.addSelect(`TO_CHAR(r.overtimeDate, 'YYYY-MM-DD')`, 'overtime_date');
    qb.addSelect('r.requestedHours', 'requested_hours');
    qb.addSelect('r.approvedHours', 'approved_hours');
    qb.addSelect('r.reason', 'reason');
    qb.addSelect('r.remarks', 'remarks');
    qb.addSelect('r.decisionRemarks', 'decision_remarks');
    qb.addSelect('r.status', 'status');
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
    qb.addSelect('a.id', 'attendance_row_id');
    qb.addSelect('a.checkIn', 'check_in');
    qb.addSelect('a.checkOut', 'check_out');
    qb.addSelect('a.status', 'attendance_status');
    qb.addSelect('sh.id', 'shift_id');
    qb.addSelect('sh.shiftCode', 'shift_code');
    qb.addSelect('sh.shiftName', 'shift_name');
    qb.addSelect(`TO_CHAR(sh.startTime, 'HH24:MI')`, 'shift_start');
    qb.addSelect(`TO_CHAR(sh.endTime, 'HH24:MI')`, 'shift_end');
    qb.addSelect('sh.workingHours', 'shift_hours');
  }

  private async fetchRows(companyId: string, opts: Record<string, any> & { page: number; limit: number }) {
    const qb = this.otRepo.createQueryBuilder('r');
    this.selectBaseColumns(qb);
    this.addJoins(qb);
    this.addDataJoins(qb);
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
    const qb = this.otRepo.createQueryBuilder('r');
    this.addJoins(qb);
    this.applyFilters(qb, companyId, opts);
    return qb.getCount();
  }

  private async computeSummary(companyId: string, opts: Record<string, any>) {
    const qb = this.otRepo.createQueryBuilder('r');
    qb.select(`COUNT(*) FILTER (WHERE r.status = 'PENDING')`, 'pending');
    qb.addSelect(`COUNT(*) FILTER (WHERE r.status = 'APPROVED')`, 'approved');
    qb.addSelect(`COUNT(*) FILTER (WHERE r.status = 'REJECTED')`, 'rejected');
    qb.addSelect(`COALESCE(SUM(r.requestedHours), 0)`, 'requested_hours');
    qb.addSelect(`COALESCE(SUM(r.approvedHours), 0)`, 'approved_hours');
    qb.addSelect('COUNT(*)', 'total');
    this.addJoins(qb);
    this.applyFilters(qb, companyId, opts, false);
    const row = (await qb.getRawOne<Record<string, unknown>>()) ?? {};

    const today = fmt(new Date());
    const tQb = this.otRepo.createQueryBuilder('r');
    tQb.select('COUNT(*)', 'c');
    this.addJoins(tQb);
    this.applyFilters(tQb, companyId, opts, false);
    tQb.andWhere(`TO_CHAR(r.overtimeDate, 'YYYY-MM-DD') = :today`, { today });
    const tRow = (await tQb.getRawOne<Record<string, unknown>>()) ?? {};

    return {
      pending: Number(row.pending) || 0,
      approved: Number(row.approved) || 0,
      rejected: Number(row.rejected) || 0,
      today: Number(tRow.c) || 0,
      totalRequestedHours: Math.round((Number(row.requested_hours) || 0) * 100) / 100,
      totalApprovedHours: Math.round((Number(row.approved_hours) || 0) * 100) / 100,
      total: Number(row.total) || 0,
      notes: { candidateOvertime: 'COMPUTED' },
    };
  }

  async getById(authUserId: string, id: string) {
    const user = await this.resolveAuthUser(authUserId);
    if (!user.defaultCompanyId) throw new BadRequestException('No default company configured for this account');

    const qb = this.otRepo.createQueryBuilder('r');
    this.selectBaseColumns(qb);
    this.addJoins(qb);
    this.addDataJoins(qb);
    qb.leftJoin(ErpUser, 'cu', 'cu.id = r.createdBy');
    qb.leftJoin(ErpUser, 'du', 'du.id = r.decidedBy');
    qb.where('r.id = :id', { id });
    qb.andWhere('r.companyId = :companyId', { companyId: user.defaultCompanyId });
    qb.andWhere('r.isActive = true');

    const row = await qb.getRawOne<Record<string, unknown>>();
    if (!row) throw new NotFoundException('Overtime request not found');

    const history = await this.fetchHistory(user.defaultCompanyId, id);
    return { ...mapRow(row), history };
  }

  // ── history ─────────────────────────────────────────────────────────────────

  private async fetchHistory(companyId: string, overtimeId: string) {
    const qb = this.historyRepo.createQueryBuilder('h');
    qb.select('h.id', 'id');
    qb.addSelect('h.fromStatus', 'from_status');
    qb.addSelect('h.toStatus', 'to_status');
    qb.addSelect('h.requestedHours', 'requested_hours');
    qb.addSelect('h.approvedHours', 'approved_hours');
    qb.addSelect('h.remarks', 'remarks');
    qb.addSelect('h.changedFields', 'changed_fields');
    qb.addSelect(`TO_CHAR(h.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'created_at');
    qb.addSelect('u.displayName', 'created_by_name');
    qb.leftJoin(ErpUser, 'u', 'u.id = h.createdBy');
    qb.where('h.overtimeId = :overtimeId', { overtimeId });
    qb.andWhere('h.companyId = :companyId', { companyId });
    qb.orderBy('h.createdAt', 'ASC');
    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map((h) => ({
      id: String(h.id),
      fromStatus: (h.from_status as string | null) ?? null,
      toStatus: String(h.to_status),
      requestedHours: Number(h.requested_hours) || 0,
      approvedHours: h.approved_hours != null ? Number(h.approved_hours) : null,
      remarks: (h.remarks as string | null) ?? null,
      changedFields: Array.isArray(h.changed_fields) ? h.changed_fields.map(String) : [],
      createdAt: (h.created_at as string | null) ?? null,
      createdBy: (h.created_by_name as string | null) ?? null,
    }));
  }

  private async recordTransition(userId: string, companyId: string, overtime: HrOvertime, fromStatus: string | null, toStatus: string, changed: string[], remarks: string | null = null) {
    await this.historyRepo.save(this.historyRepo.create({
      companyId,
      overtimeId: overtime.id,
      fromStatus,
      toStatus,
      requestedHours: overtime.requestedHours,
      approvedHours: overtime.approvedHours,
      remarks,
      changedFields: changed,
      createdBy: userId,
    }));
  }

  // ── create ──────────────────────────────────────────────────────────────────

  async create(authUserId: string, dto: CreateOvertimeDto) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const employee = await this.resolveEmployee(user, companyId, dto.employeeId);
    if (employee.status !== 'ACTIVE') throw new BadRequestException('Cannot submit an overtime request for an inactive employee');

    const today = fmt(new Date());
    if (dto.overtimeDate > today) throw new BadRequestException('Overtime cannot be requested for a future date');

    const existing = await this.otRepo.findOne({ where: { companyId, employeeId: employee.id, overtimeDate: new Date(dto.overtimeDate + 'T00:00:00'), isActive: true, status: 'PENDING' } });
    if (existing) throw new ConflictException('An active overtime request already exists for this date');

    const att = await this.attendanceRepo.findOne({ where: { employeeId: employee.id, attendanceDate: new Date(dto.overtimeDate + 'T00:00:00') } });
    if (att && HR_OT_BLOCKED_STATUSES.has(att.status)) {
      throw new BadRequestException(`Attendance on this date is recorded as ${att.status}; do not request overtime on a non-working date`);
    }

    let shiftId = dto.shiftId ?? null;
    if (dto.shiftId) {
      const shift = await this.shiftRepo.findOne({ where: { id: dto.shiftId, companyId } });
      if (!shift) throw new BadRequestException('Shift not found in the current company');
    } else if (att?.shiftId) {
      shiftId = att.shiftId;
    }

    const refNo = 'OT-' + crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();

    const rec = this.otRepo.create({
      refNo,
      companyId,
      employeeId: employee.id,
      attendanceId: att?.id ?? null,
      overtimeDate: new Date(dto.overtimeDate + 'T00:00:00'),
      shiftId,
      requestedHours: dto.requestedHours,
      approvedHours: null,
      reason: dto.reason,
      remarks: dto.remarks ?? null,
      status: 'PENDING',
      submittedAt: new Date(),
      submittedBy: user.id,
      createdBy: user.id,
      updatedBy: user.id,
    });

    const saved = await this.otRepo.save(rec);
    await this.recordTransition(user.id, companyId, saved, null, 'PENDING', ['created']);
    return this.getById(authUserId, saved.id);
  }

  // ── update ──────────────────────────────────────────────────────────────────

  async update(authUserId: string, id: string, dto: UpdateOvertimeDto) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.otRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Overtime request not found');
    if (rec.status !== 'PENDING') throw new BadRequestException('Only pending overtime requests can be updated');
    if (rec.createdBy !== user.id) throw new ForbiddenException('Only the requester can edit this overtime request');

    if (dto.shiftId !== undefined) {
      const shift = await this.shiftRepo.findOne({ where: { id: dto.shiftId, companyId } });
      if (!shift) throw new BadRequestException('Shift not found in the current company');
      rec.shiftId = dto.shiftId;
    }
    if (dto.requestedHours !== undefined) rec.requestedHours = dto.requestedHours;
    if (dto.reason !== undefined) rec.reason = dto.reason;
    if (dto.remarks !== undefined) rec.remarks = dto.remarks;
    rec.updatedBy = user.id;
    await this.otRepo.save(rec);
    return this.getById(authUserId, rec.id);
  }

  // ── delete ──────────────────────────────────────────────────────────────────

  async delete(authUserId: string, id: string) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.otRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Overtime request not found');
    if (rec.status !== 'PENDING') throw new BadRequestException('Only pending overtime requests can be removed');

    rec.isActive = false;
    rec.updatedBy = user.id;
    await this.otRepo.save(rec);
    return { id: rec.id, deleted: true };
  }

  // ── approve / reject ────────────────────────────────────────────────────────

  async approve(authUserId: string, id: string, dto: ApproveOvertimeDto = {}) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.otRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Overtime request not found');
    if (rec.status !== 'PENDING') throw new BadRequestException('Only pending overtime requests can be approved');

    const approvedHours = dto.approvedHours != null ? dto.approvedHours : Number(rec.requestedHours);
    const changed: string[] = ['status'];
    if (Number(approvedHours) !== Number(rec.requestedHours)) changed.push('approved_hours');

    rec.status = 'APPROVED';
    rec.approvedHours = approvedHours;
    rec.decidedBy = user.id;
    rec.decidedAt = new Date();
    rec.decisionRemarks = dto.remarks ?? null;
    rec.updatedBy = user.id;
    await this.otRepo.save(rec);
    await this.recordTransition(user.id, companyId, rec, 'PENDING', 'APPROVED', changed, dto.remarks ?? null);
    return this.getById(authUserId, rec.id);
  }

  async reject(authUserId: string, id: string, dto: RejectOvertimeDto) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    const rec = await this.otRepo.findOne({ where: { id, companyId, isActive: true } });
    if (!rec) throw new NotFoundException('Overtime request not found');
    if (rec.status !== 'PENDING') throw new BadRequestException('Only pending overtime requests can be rejected');

    rec.status = 'REJECTED';
    rec.decidedBy = user.id;
    rec.decidedAt = new Date();
    rec.decisionRemarks = dto.remarks;
    rec.updatedBy = user.id;
    await this.otRepo.save(rec);
    await this.recordTransition(user.id, companyId, rec, 'PENDING', 'REJECTED', ['status'], dto.remarks);
    return this.getById(authUserId, rec.id);
  }
}

// ── row mapper ────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>) {
  const shiftTime = (t: unknown): string | null => (t == null ? null : timeHm(String(t)));
  return {
    id: String(row.id ?? row.r_id),
    refNo: String(row.ref_no),
    overtimeDate: String(row.overtime_date),
    requestedHours: Number(row.requested_hours) || 0,
    approvedHours: row.approved_hours != null ? Number(row.approved_hours) : null,
    reason: String(row.reason),
    remarks: (row.remarks as string | null) ?? null,
    decisionRemarks: (row.decision_remarks as string | null) ?? null,
    status: String(row.status),
    shift: row.shift_id
      ? {
          id: String(row.shift_id),
          code: (row.shift_code as string | null) ?? null,
          name: (row.shift_name as string | null) ?? null,
          startTime: shiftTime(row.shift_start),
          endTime: shiftTime(row.shift_end),
          workingHours: row.shift_hours != null ? Number(row.shift_hours) : null,
        }
      : null,
    attendance: row.attendance_row_id
      ? {
          id: String(row.attendance_row_id),
          checkIn: (row.check_in as string | null) ?? null,
          checkOut: (row.check_out as string | null) ?? null,
          status: (row.attendance_status as string | null) ?? null,
          durationMinutes: durationMinutes(row),
          candidateOvertimeMinutes: candidateOvertimeMinutes(row),
        }
      : null,
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
      submittedAt: (row.submitted_at as string | null) ?? null,
      decidedAt: (row.decided_at as string | null) ?? null,
      submittedBy: (row.created_by_name as string | null) ?? null,
      decidedBy: (row.decided_by_name as string | null) ?? null,
      createdAt: (row.created_at as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? null,
    },
  };
}