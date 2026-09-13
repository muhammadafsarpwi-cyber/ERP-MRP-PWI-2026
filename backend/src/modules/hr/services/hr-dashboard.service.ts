import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HrEmployee } from '../entities/hr-employee.entity';
import { HrAttendance } from '../entities/hr-attendance.entity';
import { HrLeaveRequest } from '../entities/hr-leave-request.entity';
import { HrShift } from '../entities/hr-shift.entity';
import { Department } from '../../organization/entities/department.entity';

export interface HrDashboardOptions {
  /** As-of date in YYYY-MM-DD (defaults to today). */
  date?: string;
  /** Attendance trend window in days (default 30, clamped to 7..90). */
  days?: number;
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
}

export interface HrDepartmentBucket {
  departmentId: string | null;
  name: string;
  count: number;
}

export interface HrTrendDay {
  /** YYYY-MM-DD */
  date: string;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
}

export interface HrDashboardData {
  asOf: string;
  periodStart: string;
  periodEnd: string;
  kpi: {
    totalEmployees: number;
    activeEmployees: number;
    presentToday: number;
    lateToday: number;
    absentToday: number;
    onLeaveToday: number;
    pendingApprovals: number;
    outOfZone: number;
    documentsExpiring: number;
  };
  notes: {
    lateToday: 'DERIVED';
    outOfZone: 'UNSUPPORTED';
    documentsExpiring: 'UNSUPPORTED';
  };
  attendanceTrend: HrTrendDay[];
  employeesByDepartment: HrDepartmentBucket[];
}

interface TrendAggRow {
  attendance_date: string;
  status: string;
  count: string;
  late_count: string;
}

const ATTENDANCE_PRESENT = 'PRESENT';
const ATTENDANCE_ABSENT = 'ABSENT';
const ATTENDANCE_LEAVE = 'LEAVE';
const LEAVE_PENDING = 'PENDING';

function parseAsOfDate(value: string | undefined): Date {
  if (!value) return new Date();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date();
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

@Injectable()
export class HrDashboardService {
  constructor(
    @InjectRepository(HrEmployee)
    private readonly employeeRepo: Repository<HrEmployee>,
    @InjectRepository(HrAttendance)
    private readonly attendanceRepo: Repository<HrAttendance>,
    @InjectRepository(HrLeaveRequest)
    private readonly leaveRequestRepo: Repository<HrLeaveRequest>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
  ) {}

  /**
   * Resolves the stock attendance aggregation for the dashboard. Every card is
   * derived from REAL data — no synthetic/random values. Metrics with no data
   * source (Out-of-Zone geofencing, expiring documents) are surfaced as 0 with
   * an explicit `notes` entry documenting the missing source rather than a
   * fabricated number.
   */
  async getDashboardData(companyId: string, options: HrDashboardOptions = {}): Promise<HrDashboardData> {
    const asOf = parseAsOfDate(options.date);
    const days = Math.min(Math.max(Number(options.days) || 30, 7), 90);
    const from = addDays(asOf, -(days - 1));
    const asOfStr = formatDate(asOf);
    const fromStr = formatDate(from);

    // Employee scope honoring the Division → Section → Department hierarchy.
    // null = no org filter (whole company); [] = filter matched no employees.
    const scopedIds = await this.getScopedEmployeeIds(companyId, options);

    const [totalEmployees, activeEmployees] = await Promise.all([
      this.countEmployees(companyId, scopedIds, undefined),
      this.countEmployees(companyId, scopedIds, 'ACTIVE'),
    ]);

    const trendRaw = await this.getTrendRaw(companyId, scopedIds, fromStr, asOfStr);

    const dayMap = this.buildDayMap(trendRaw);

    const attendanceTrend: HrTrendDay[] = [];
    for (let i = 0; i < days; i++) {
      const key = formatDate(addDays(from, i));
      const bucket = dayMap[key];
      attendanceTrend.push({
        date: key,
        present: bucket?.present ?? 0,
        late: bucket?.late ?? 0,
        absent: bucket?.absent ?? 0,
        onLeave: bucket?.leave ?? 0,
      });
    }

    const today = dayMap[asOfStr];

    const pendingApprovals = await this.countPendingLeaveRequests(companyId, scopedIds);

    const employeesByDepartment = await this.getEmployeesByDepartment(companyId, options);

    return {
      asOf: asOfStr,
      periodStart: fromStr,
      periodEnd: asOfStr,
      kpi: {
        totalEmployees,
        activeEmployees,
        presentToday: today?.present ?? 0,
        lateToday: today?.late ?? 0,
        absentToday: today?.absent ?? 0,
        onLeaveToday: today?.leave ?? 0,
        pendingApprovals,
        // No geo-location tracking exists in the current HR module.
        outOfZone: 0,
        // hr_employee_documents has no expiry/issued-date columns.
        documentsExpiring: 0,
      },
      notes: {
        lateToday: 'DERIVED',
        outOfZone: 'UNSUPPORTED',
        documentsExpiring: 'UNSUPPORTED',
      },
      attendanceTrend,
      employeesByDepartment,
    };
  }

  /**
   * Employee IDs restricted to the selected org branch. Returns null when no
   * hierarchy filter is applied (whole company scope) and [] when the filter
   * matches no employees.
   */
  private async getScopedEmployeeIds(
    companyId: string,
    options: HrDashboardOptions,
  ): Promise<string[] | null> {
    const { divisionId, sectionId, departmentId } = options;
    if (!divisionId && !sectionId && !departmentId) return null;

    const qb = this.employeeRepo.createQueryBuilder('e');
    qb.select('e.id', 'id').where('e.companyId = :companyId', { companyId });

    if (departmentId) {
      qb.andWhere('e.departmentId = :departmentId', { departmentId });
    } else {
      qb.leftJoin(Department, 'd', 'd.id = e.departmentId');
      if (divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId });
      if (sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId });
    }

    const rows = await qb.getRawMany<{ id: string }>();
    return rows.map((r) => String(r.id));
  }

  private countEmployees(companyId: string, scopedIds: string[] | null, status?: string): Promise<number> {
    if (scopedIds !== null && scopedIds.length === 0) return Promise.resolve(0);

    const qb = this.employeeRepo.createQueryBuilder('e');
    qb.where('e.companyId = :companyId', { companyId });
    if (status) qb.andWhere('e.status = :status', { status });
    if (scopedIds !== null) qb.andWhere('e.id IN (:...ids)', { ids: scopedIds });
    return qb.getCount();
  }

  private countPendingLeaveRequests(companyId: string, scopedIds: string[] | null): Promise<number> {
    if (scopedIds !== null && scopedIds.length === 0) return Promise.resolve(0);

    const qb = this.leaveRequestRepo.createQueryBuilder('lr');
    qb.where('lr.companyId = :companyId', { companyId });
    qb.andWhere('lr.status = :status', { status: LEAVE_PENDING });
    if (scopedIds !== null) qb.andWhere('lr.employeeId IN (:...ids)', { ids: scopedIds });
    return qb.getCount();
  }

  /**
   * Daily attendance breakdown for the trend window. Late is DERIVED from the
   * recorded check-in time against the assigned shift start time:
   *   present AND check_in > shift.start_time
   * The comparison uses UTC-converted times so it is deterministic regardless
   * of the database session timezone. Rows joined to shifts are matched by
   * shift id AND company id to stay org-isolated.
   */
  private async getTrendRaw(
    companyId: string,
    scopedIds: string[] | null,
    from: string,
    to: string,
  ): Promise<TrendAggRow[]> {
    if (scopedIds !== null && scopedIds.length === 0) return [];

    const qb = this.attendanceRepo.createQueryBuilder('a');
    qb.select("TO_CHAR(a.attendanceDate, 'YYYY-MM-DD')", 'attendance_date');
    qb.addSelect('a.status', 'status');
    qb.addSelect('COUNT(*)', 'count');
    qb.addSelect(
      `COUNT(*) FILTER (WHERE a.status = :lateStatus AND a.checkIn IS NOT NULL AND s.startTime IS NOT NULL AND (a.checkIn AT TIME ZONE 'UTC')::time > s."start_time"::time)`,
      'late_count',
    );
    qb.setParameter('lateStatus', ATTENDANCE_PRESENT);
    qb.leftJoin(HrShift, 's', 's.id = a.shiftId AND s.companyId = a.companyId');
    qb.where('a.companyId = :companyId', { companyId });
    qb.andWhere('a.attendanceDate BETWEEN :from AND :to', { from, to });
    if (scopedIds !== null) qb.andWhere('a.employeeId IN (:...ids)', { ids: scopedIds });
    qb.groupBy('a.attendanceDate');
    qb.addGroupBy('a.status');
    qb.orderBy('a.attendanceDate', 'ASC');

    return qb.getRawMany<TrendAggRow>();
  }

  private buildDayMap(rows: TrendAggRow[]): Record<string, { present: number; late: number; absent: number; leave: number }> {
    const map: Record<string, { present: number; late: number; absent: number; leave: number }> = {};
    for (const row of rows) {
      const key = String(row.attendance_date);
      const bucket = map[key] || { present: 0, late: 0, absent: 0, leave: 0 };
      const count = Number(row.count) || 0;
      switch (row.status) {
        case ATTENDANCE_PRESENT:
          bucket.present += count;
          bucket.late += Number(row.late_count) || 0;
          break;
        case ATTENDANCE_ABSENT:
          bucket.absent += count;
          break;
        case ATTENDANCE_LEAVE:
          bucket.leave += count;
          break;
        default:
          break;
      }
      map[key] = bucket;
    }
    return map;
  }

  /**
   * Head-count distribution by department (unassigned employees roll up under
   * an "Unassigned" bucket). Respects the Division/Section/Department filters.
   */
  private async getEmployeesByDepartment(
    companyId: string,
    options: HrDashboardOptions,
  ): Promise<HrDepartmentBucket[]> {
    const { divisionId, sectionId, departmentId } = options;

    const qb = this.employeeRepo.createQueryBuilder('e');
    qb.select('d.id', 'department_id');
    qb.addSelect("COALESCE(d.name, 'Unassigned')", 'name');
    qb.addSelect('COUNT(e.id)', 'count');
    qb.leftJoin(Department, 'd', 'd.id = e.departmentId');
    qb.where('e.companyId = :companyId', { companyId });

    if (departmentId) {
      qb.andWhere('e.departmentId = :departmentId', { departmentId });
    } else {
      if (divisionId) qb.andWhere('d.divisionId = :divisionId', { divisionId });
      if (sectionId) qb.andWhere('d.sectionId = :sectionId', { sectionId });
    }

    qb.groupBy('d.id');
    qb.addGroupBy('d.name');
    qb.orderBy('count', 'DESC');

    const rows = await qb.getRawMany<{ department_id: string | null; name: string; count: string }>();
    return rows.map((r) => ({
      departmentId: r.department_id ? String(r.department_id) : null,
      name: String(r.name),
      count: Number(r.count) || 0,
    }));
  }
}