import {
  Injectable, BadRequestException, NotFoundException, UnauthorizedException,
  ForbiddenException, ConflictException, Logger,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { HrAdvance } from '../entities/hr-advance.entity';
import { HrAdvanceHistory } from '../entities/hr-advance-history.entity';
import { HrEmployee } from '../entities/hr-employee.entity';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { FinanceAutoPostingService } from '../../finance/services/finance-auto-posting.service';
import { JournalType } from '../../finance/entities/finance-journal.entity';
import {
  CreateAdvanceDto, UpdateAdvanceDto, ApproveAdvanceDto, RejectAdvanceDto,
  DisburseAdvanceDto, RecoverAdvanceDto, HR_ADVANCE_STATUSES,
} from '../dto';
import crypto from 'crypto';

/**
 * Statuses that occupy the DB partial-unique slot for (company, employee,
 * request_date) — a second open request must be rejected with a clean 409.
 */
const HR_ADVANCE_OPEN_STATUSES = ['PENDING', 'APPROVED', 'DISBURSED', 'PARTIALLY_RECOVERED'];

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Employee Advances (HR-09).
 *
 * Lifecycle (final design — there is no DRAFT / SUBMITTED / FULLY_RECOVERED):
 *   PENDING -> APPROVED / REJECTED / CANCELLED
 *   APPROVED -> DISBURSED          (ONE full disbursement = approved_amount)
 *   DISBURSED -> PARTIALLY_RECOVERED / RECOVERED
 *   PARTIALLY_RECOVERED -> RECOVERED
 * Every other transition fails.
 *
 * Financial integrity:
 *  - All money is DECIMAL(19,4); stores are read as strings and turned into
 *    JS numbers only for validation/display. Outstanding is ALWAYS derived as
 *    (disbursed_amount - recovered_amount), computed in SQL, never stored.
 *  - Disbursements/recoveries run inside a single DB transaction that ALSO
 *    posts a balanced finance journal through the EXISTING auto-posting service
 *    (referenceType = 'EMPLOYEE_ADVANCE', referenceId = advance id), so the HR
 *    balance and the financial ledger can only move together. A row lock
 *    (SELECT ... FOR UPDATE) serializes concurrent money moves on the same
 *    advance and provides the duplicate-disbursement / concurrent-recovery
 *    protection (there is no reference-uniqueness constraint on the finance
 *    ledger, so the single-allowed-transition-under-lock IS the idempotency
 *    guard; a retry re-reads the row, sees DISBURSED / a consumed balance, and
 *    fails without touching the journals or balances).
 *  - Account mapping (existing chart of accounts only, no new COA rows;
 *    2200 is a LIABILITY account and is never used):
 *      disbursement PAYMENT -> DR 1100 Accounts Receivable, CR 1000 Cash
 *      recovery      RECEIPT -> DR 1000 Cash, CR 1100 Accounts Receivable
 */
@Injectable()
export class HrAdvancesService {
  private readonly logger = new Logger(HrAdvancesService.name);

  constructor(
    @InjectRepository(HrAdvance) private readonly advanceRepo: Repository<HrAdvance>,
    @InjectRepository(HrAdvanceHistory) private readonly historyRepo: Repository<HrAdvanceHistory>,
    @InjectRepository(HrEmployee) private readonly employeeRepo: Repository<HrEmployee>,
    @InjectRepository(Department) private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Division) private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Section) private readonly sectionRepo: Repository<Section>,
    @InjectRepository(ErpUser) private readonly userRepo: Repository<ErpUser>,
    private readonly financePostingService: FinanceAutoPostingService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // ── auth helpers ────────────────────────────────────────────────────────────

  private async resolveAuthUser(authUserId: string) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) throw new UnauthorizedException('Your account has not been provisioned by an administrator');
    if (user.status !== 'ACTIVE') throw new ForbiddenException('User account is inactive');
    return user;
  }

  /** Resolve the employee for a request, enforcing the self-service restriction. */
  private async resolveEmployee(user: ErpUser, companyId: string, requestedEmployeeId?: string) {
    if (user.employeeId) {
      const me = await this.employeeRepo.findOne({ where: { employeeCode: user.employeeId, companyId } });
      if (!me) throw new ForbiddenException('Your account is not linked to an employee in the current company');
      if (requestedEmployeeId && requestedEmployeeId !== me.id) {
        throw new ForbiddenException('Self-service users are restricted to their own advance requests');
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

  /** Resolve the advance currency from the employee master (source of truth). */
  private currencyOf(employee: HrEmployee): string {
    const c = employee.currency;
    return c && /^[A-Z]{3}$/.test(c) ? c : 'USD';
  }

  private assertValidDate(dateStr: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new BadRequestException('Invalid requestDate (YYYY-MM-DD expected)');
    const d = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid requestDate');
    return d;
  }

  private assertPositiveAmount(v: number, label: string) {
    if (!Number.isFinite(v) || v <= 0) throw new BadRequestException(`${label} must be greater than zero`);
  }

  // ── options ─────────────────────────────────────────────────────────────────

  async getAdvanceOptions(authUserId: string) {
    const user = await this.resolveAuthUser(authUserId);
    const empty = {
      companyId: null as string | null,
      today: fmt(new Date()),
      divisions: [] as any[],
      sections: [] as any[],
      departments: [] as any[],
      employees: [] as any[],
      statuses: HR_ADVANCE_STATUSES,
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
      statuses: HR_ADVANCE_STATUSES,
      self,
    };
  }

  // ── list / detail ───────────────────────────────────────────────────────────

  private emptyBase(reason: string, opts: Record<string, any> = {}) {
    return {
      asOf: fmt(new Date()),
      range: { dateFrom: opts.dateFrom ?? null, dateTo: opts.dateTo ?? null },
      companyId: null as string | null,
      reason,
      summary: {
        cancelled: 0, pending: 0, approved: 0, rejected: 0, disbursed: 0,
        partiallyRecovered: 0, recovered: 0,
        totalRequested: 0, totalApproved: 0, totalDisbursed: 0, totalRecovered: 0,
        totalOutstanding: 0, total: 0,
        notes: { outstanding: 'DERIVED' },
      },
      records: [] as any[],
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
    if (opts.dateFrom) qb.andWhere(`TO_CHAR(r.requestDate, 'YYYY-MM-DD') >= :dateFrom`, { dateFrom: opts.dateFrom });
    if (opts.dateTo) qb.andWhere(`TO_CHAR(r.requestDate, 'YYYY-MM-DD') <= :dateTo`, { dateTo: opts.dateTo });
    if (includeStatus && opts.status) qb.andWhere('r.status = :status', { status: opts.status });
    if (opts.search) qb.andWhere('(e.firstName ILIKE :s OR e.lastName ILIKE :s OR e.employeeCode ILIKE :s)', { s: `%${opts.search}%` });
  }

  private applySorting(qb: any, opts: Record<string, any>) {
    const dir = String(opts.sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const col = (opts.sortBy as string | undefined) ?? 'createdAt';
    const columns: Record<string, string> = {
      requestDate: 'r.requestDate',
      requestedAmount: 'r.requestedAmount',
      approvedAmount: 'r.approvedAmount',
      status: 'r.status',
      createdAt: 'r.createdAt',
      employeeCode: 'e.employeeCode',
    };
    const orderBy = columns[col] ? columns[col] : columns.createdAt;
    qb.orderBy(orderBy, dir as 'ASC' | 'DESC');
    qb.addOrderBy('e.employeeCode', 'ASC');
  }

  private selectBaseColumns(qb: any) {
    qb.select('r.id', 'id');
    qb.addSelect('r.employeeId', 'employee_id');
    qb.addSelect('r.refNo', 'ref_no');
    qb.addSelect(`TO_CHAR(r.requestDate, 'YYYY-MM-DD')`, 'request_date');
    qb.addSelect('r.requestedAmount', 'requested_amount');
    qb.addSelect('r.approvedAmount', 'approved_amount');
    qb.addSelect('r.disbursedAmount', 'disbursed_amount');
    qb.addSelect('r.recoveredAmount', 'recovered_amount');
    // outstanding_amount is DERIVED (never stored).
    qb.addSelect('(r.disbursedAmount - r.recoveredAmount)', 'outstanding_amount');
    qb.addSelect('r.currency', 'currency');
    qb.addSelect('r.reason', 'reason');
    qb.addSelect('r.remarks', 'remarks');
    qb.addSelect('r.decisionRemarks', 'decision_remarks');
    qb.addSelect('r.status', 'status');
    qb.addSelect(`TO_CHAR(r.approvedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'decided_at');
    qb.addSelect(`TO_CHAR(r.disbursedAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'disbursed_at');
    qb.addSelect(`TO_CHAR(r.recoveredAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'recovered_at');
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
    qb.addSelect('au.displayName', 'decided_by_name');
    qb.addSelect('du.displayName', 'disbursed_by_name');
    qb.addSelect('ru.displayName', 'recovered_by_name');
  }

  private addAuditJoins(qb: any) {
    qb.leftJoin(ErpUser, 'cu', 'cu.id = r.createdBy');
    qb.leftJoin(ErpUser, 'au', 'au.id = r.approvedBy');
    qb.leftJoin(ErpUser, 'du', 'du.id = r.disbursedBy');
    qb.leftJoin(ErpUser, 'ru', 'ru.id = r.recoveredBy');
  }

  async listAdvances(authUserId: string, options: Record<string, any> = {}) {
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

  private async fetchRows(companyId: string, opts: Record<string, any> & { page: number; limit: number }) {
    const qb = this.advanceRepo.createQueryBuilder('r');
    this.selectBaseColumns(qb);
    this.addJoins(qb);
    this.addAuditJoins(qb);
    this.applyFilters(qb, companyId, opts);
    this.applySorting(qb, opts);
    qb.offset((opts.page - 1) * opts.limit).limit(opts.limit);
    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map(mapAdvanceRow);
  }

  private async countRows(companyId: string, opts: Record<string, any>): Promise<number> {
    const qb = this.advanceRepo.createQueryBuilder('r');
    this.addJoins(qb);
    this.applyFilters(qb, companyId, opts);
    return qb.getCount();
  }

  private async computeSummary(companyId: string, opts: Record<string, any>) {
    const qb = this.advanceRepo.createQueryBuilder('r');
    qb.select(`COUNT(*) FILTER (WHERE r.status = 'CANCELLED')`, 'cancelled');
    qb.addSelect(`COUNT(*) FILTER (WHERE r.status = 'PENDING')`, 'pending');
    qb.addSelect(`COUNT(*) FILTER (WHERE r.status = 'APPROVED')`, 'approved');
    qb.addSelect(`COUNT(*) FILTER (WHERE r.status = 'REJECTED')`, 'rejected');
    qb.addSelect(`COUNT(*) FILTER (WHERE r.status = 'DISBURSED')`, 'disbursed');
    qb.addSelect(`COUNT(*) FILTER (WHERE r.status = 'PARTIALLY_RECOVERED')`, 'partially_recovered');
    qb.addSelect(`COUNT(*) FILTER (WHERE r.status = 'RECOVERED')`, 'recovered');
    qb.addSelect(`COALESCE(SUM(r.requestedAmount), 0)`, 'requested');
    qb.addSelect(`COALESCE(SUM(r.approvedAmount), 0)`, 'approved');
    qb.addSelect(`COALESCE(SUM(r.disbursedAmount), 0)`, 'disbursed');
    qb.addSelect(`COALESCE(SUM(r.recoveredAmount), 0)`, 'recovered');
    qb.addSelect(`COALESCE(SUM(r.disbursedAmount - r.recoveredAmount), 0)`, 'outstanding');
    qb.addSelect('COUNT(*)', 'total');
    this.addJoins(qb);
    this.applyFilters(qb, companyId, opts, false);
    const row = (await qb.getRawOne<Record<string, unknown>>()) ?? {};

    return {
      cancelled: Number(row.cancelled) || 0,
      pending: Number(row.pending) || 0,
      approved: Number(row.approved) || 0,
      rejected: Number(row.rejected) || 0,
      disbursed: Number(row.disbursed) || 0,
      partiallyRecovered: Number(row.partially_recovered) || 0,
      recovered: Number(row.recovered) || 0,
      totalRequested: round4(row.requested),
      totalApproved: round4(row.approved),
      totalDisbursed: round4(row.disbursed),
      totalRecovered: round4(row.recovered),
      totalOutstanding: round4(row.outstanding),
      total: Number(row.total) || 0,
      notes: { outstanding: 'DERIVED' },
    };
  }

  async getById(authUserId: string, id: string) {
    const user = await this.resolveAuthUser(authUserId);
    if (!user.defaultCompanyId) throw new BadRequestException('No default company configured for this account');

    const qb = this.advanceRepo.createQueryBuilder('r');
    this.selectBaseColumns(qb);
    this.addJoins(qb);
    this.addAuditJoins(qb);
    qb.where('r.id = :id', { id });
    qb.andWhere('r.companyId = :companyId', { companyId: user.defaultCompanyId });
    qb.andWhere('r.isActive = true');

    const row = await qb.getRawOne<Record<string, unknown>>();
    if (!row) throw new NotFoundException('Advance request not found');

    const history = await this.fetchHistory(user.defaultCompanyId, id);
    return { ...mapAdvanceRow(row), history };
  }

  // ── history ─────────────────────────────────────────────────────────────────

  private async fetchHistory(companyId: string, advanceId: string) {
    const qb = this.historyRepo.createQueryBuilder('h');
    qb.select('h.id', 'id');
    qb.addSelect('h.eventType', 'event_type');
    qb.addSelect('h.fromStatus', 'from_status');
    qb.addSelect('h.toStatus', 'to_status');
    qb.addSelect('h.amount', 'amount');
    qb.addSelect('h.requestedAmount', 'requested_amount');
    qb.addSelect('h.approvedAmount', 'approved_amount');
    qb.addSelect('h.disbursedAmount', 'disbursed_amount');
    qb.addSelect('h.recoveredAmount', 'recovered_amount');
    qb.addSelect('h.remarks', 'remarks');
    qb.addSelect('h.changedFields', 'changed_fields');
    qb.addSelect(`TO_CHAR(h.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')`, 'created_at');
    qb.addSelect('u.displayName', 'created_by_name');
    qb.leftJoin(ErpUser, 'u', 'u.id = h.createdBy');
    qb.where('h.advanceId = :advanceId', { advanceId });
    qb.andWhere('h.companyId = :companyId', { companyId });
    qb.orderBy('h.createdAt', 'ASC');
    const rows = await qb.getRawMany<Record<string, unknown>>();
    return rows.map((h) => ({
      id: String(h.id),
      eventType: (h.event_type as string | null) ?? null,
      fromStatus: (h.from_status as string | null) ?? null,
      toStatus: String(h.to_status),
      amount: h.amount != null ? round4(h.amount) : null,
      requestedAmount: h.requested_amount != null ? round4(h.requested_amount) : null,
      approvedAmount: h.approved_amount != null ? round4(h.approved_amount) : null,
      disbursedAmount: h.disbursed_amount != null ? round4(h.disbursed_amount) : null,
      recoveredAmount: h.recovered_amount != null ? round4(h.recovered_amount) : null,
      remarks: (h.remarks as string | null) ?? null,
      changedFields: Array.isArray(h.changed_fields) ? h.changed_fields.map(String) : [],
      createdAt: (h.created_at as string | null) ?? null,
      createdBy: (h.created_by_name as string | null) ?? null,
    }));
  }

  /** Writes one immutable history row inside the caller's transaction. */
  private async recordTransition(
    manager: EntityManager,
    userId: string,
    companyId: string,
    advance: HrAdvance,
    eventType: string,
    fromStatus: string | null,
    toStatus: string,
    amount: number | null,
    changed: string[],
    remarks: string | null = null,
  ) {
    const repo = manager.getRepository(HrAdvanceHistory);
    await repo.save(repo.create({
      companyId,
      advanceId: advance.id,
      eventType,
      fromStatus,
      toStatus,
      amount,
      requestedAmount: advance.requestedAmount,
      approvedAmount: advance.approvedAmount,
      disbursedAmount: advance.disbursedAmount,
      recoveredAmount: advance.recoveredAmount,
      remarks,
      changedFields: changed,
      createdBy: userId,
    }));
  }

  /** Company-scoped, locked read for in-transaction mutations. */
  private async loadAdvanceForUpdate(manager: EntityManager, companyId: string, id: string) {
    const rec = await manager.findOne(HrAdvance, {
      where: { id, companyId, isActive: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (!rec) throw new NotFoundException('Advance request not found');
    return rec;
  }

  private async assertNoOpenDuplicate(
    manager: EntityManager,
    companyId: string,
    employeeId: string,
    requestDate: Date,
    excludeId?: string,
  ) {
    const dup = await manager.findOne(HrAdvance, {
      where: {
        companyId, employeeId,
        requestDate: new Date(`${fmt(requestDate)}T00:00:00`),
        isActive: true,
        status: In(HR_ADVANCE_OPEN_STATUSES),
      },
    });
    if (dup && dup.id !== excludeId) {
      throw new ConflictException('An open advance request already exists for this employee on the selected date');
    }
  }

  // ── create ──────────────────────────────────────────────────────────────────

  async create(authUserId: string, dto: CreateAdvanceDto) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    this.assertPositiveAmount(dto.requestedAmount, 'requestedAmount');
    const requestDate = this.assertValidDate(dto.requestDate ?? fmt(new Date()));

    const employee = await this.resolveEmployee(user, companyId, dto.employeeId);
    if (!employee.isActive || employee.status !== 'ACTIVE') {
      throw new BadRequestException('Cannot create an advance for an inactive employee');
    }

    const refNo = 'ADV-' + crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();

    try {
      return await this.dataSource.transaction(async (manager) => {
        await this.assertNoOpenDuplicate(manager, companyId, employee.id, requestDate);

        const rec = manager.create(HrAdvance, {
          refNo,
          companyId,
          employeeId: employee.id,
          requestDate,
          requestedAmount: dto.requestedAmount,
          approvedAmount: null,
          disbursedAmount: 0,
          recoveredAmount: 0,
          currency: this.currencyOf(employee),
          reason: dto.reason,
          remarks: dto.remarks ?? null,
          status: 'PENDING',
          requestedBy: user.id,
          createdBy: user.id,
          updatedBy: user.id,
        });

        const saved = await manager.save(HrAdvance, rec);
        await this.recordTransition(
          manager, user.id, companyId, saved,
          'CREATED', null, 'PENDING', null, ['created'], null,
        );
        return saved.id;
      }).then((id) => this.getById(authUserId, id));
    } catch (err: any) {
      // DB partial-unique violation on (company, employee, request date).
      if (err?.code === '23505' && this.isDuplicateKey(err, 'hr_advances')) {
        throw new ConflictException('An open advance request already exists for this employee on the selected date');
      }
      throw err;
    }
  }

  // ── update / delete ─────────────────────────────────────────────────────────

  async update(authUserId: string, id: string, dto: UpdateAdvanceDto) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    try {
      return await this.dataSource.transaction(async (manager) => {
        const rec = await this.loadAdvanceForUpdate(manager, companyId, id);
        if (rec.status !== 'PENDING') throw new BadRequestException('Only pending advance requests can be updated');
        if (rec.createdBy !== user.id) throw new ForbiddenException('Only the requester can edit this advance request');

        const changed: string[] = [];

        if (dto.requestDate !== undefined) {
          const nextDate = this.assertValidDate(dto.requestDate);
          if (fmt(nextDate) !== fmt(new Date(rec.requestDate))) {
            await this.assertNoOpenDuplicate(manager, companyId, rec.employeeId, nextDate, rec.id);
            rec.requestDate = nextDate;
            changed.push('request_date');
          }
        }
        if (dto.requestedAmount !== undefined) {
          this.assertPositiveAmount(dto.requestedAmount, 'requestedAmount');
          if (round4(dto.requestedAmount) !== round4(rec.requestedAmount)) {
            rec.requestedAmount = round4(dto.requestedAmount);
            changed.push('requested_amount');
          }
        }
        if (dto.reason !== undefined && dto.reason !== rec.reason) {
          rec.reason = dto.reason;
          changed.push('reason');
        }
        if (dto.remarks !== undefined && (dto.remarks ?? null) !== rec.remarks) {
          rec.remarks = dto.remarks ?? null;
          changed.push('remarks');
        }

        if (changed.length) {
          rec.updatedBy = user.id;
          const saved = await manager.save(HrAdvance, rec);
          await this.recordTransition(
            manager, user.id, companyId, saved,
            'UPDATED', 'PENDING', 'PENDING', null, changed, null,
          );
          return saved.id;
        }
        return rec.id;
      }).then((savedId) => this.getById(authUserId, savedId));
    } catch (err: any) {
      if (err?.code === '23505' && this.isDuplicateKey(err, 'hr_advances')) {
        throw new ConflictException('An open advance request already exists for this employee on the selected date');
      }
      throw err;
    }
  }

  /** Legacy submit route — removed by the final design. Advances are created directly as PENDING. */
  async submit(authUserId: string, _id: string) {
    await this.resolveAuthUser(authUserId);
    throw new BadRequestException('Submission is not required — advance requests are created directly as PENDING');
  }

  async delete(authUserId: string, id: string) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    await this.dataSource.transaction(async (manager) => {
      const rec = await this.loadAdvanceForUpdate(manager, companyId, id);
      if (rec.status !== 'PENDING') throw new BadRequestException('Only pending advance requests can be deleted');

      rec.isActive = false;
      rec.status = 'CANCELLED';
      rec.updatedBy = user.id;
      const saved = await manager.save(HrAdvance, rec);
      await this.recordTransition(
        manager, user.id, companyId, saved,
        'CANCELLED', 'PENDING', 'CANCELLED', null, ['is_active', 'status'],
        'Advance request removed (soft delete)',
      );
    });

    return { id, deleted: true };
  }

  // ── approve / reject / cancel ───────────────────────────────────────────────

  async approve(authUserId: string, id: string, dto: ApproveAdvanceDto = {}) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    await this.dataSource.transaction(async (manager) => {
      const rec = await this.loadAdvanceForUpdate(manager, companyId, id);
      if (rec.status !== 'PENDING') throw new BadRequestException('Only pending advance requests can be approved');

      const approvedAmount = round4(dto.approvedAmount != null ? dto.approvedAmount : Number(rec.requestedAmount));
      this.assertPositiveAmount(approvedAmount, 'approvedAmount');
      if (approvedAmount - Number(rec.requestedAmount) > 0.0001) {
        throw new BadRequestException('Approved amount cannot exceed the requested amount');
      }

      const changed: string[] = ['status'];
      if (Math.abs(approvedAmount - Number(rec.requestedAmount)) > 0.0001) changed.push('approved_amount');

      rec.status = 'APPROVED';
      rec.approvedAmount = approvedAmount;
      rec.approvedBy = user.id;
      rec.approvedAt = new Date();
      rec.decisionRemarks = dto.remarks ?? null;
      rec.updatedBy = user.id;
      const saved = await manager.save(HrAdvance, rec);
      await this.recordTransition(
        manager, user.id, companyId, saved,
        'APPROVED', 'PENDING', 'APPROVED', null, changed, dto.remarks ?? null,
      );
    });

    return this.getById(authUserId, id);
  }

  async reject(authUserId: string, id: string, dto: RejectAdvanceDto) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    await this.dataSource.transaction(async (manager) => {
      const rec = await this.loadAdvanceForUpdate(manager, companyId, id);
      if (rec.status !== 'PENDING') throw new BadRequestException('Only pending advance requests can be rejected');
      if (!dto.remarks || dto.remarks.trim().length < 3) {
        throw new BadRequestException('Rejection remarks are required');
      }

      // A rejection is NOT an approval: approved fields stay unset.
      rec.status = 'REJECTED';
      rec.decisionRemarks = dto.remarks;
      rec.updatedBy = user.id;
      const saved = await manager.save(HrAdvance, rec);
      await this.recordTransition(
        manager, user.id, companyId, saved,
        'REJECTED', 'PENDING', 'REJECTED', null, ['status'], dto.remarks,
      );
    });

    return this.getById(authUserId, id);
  }

  async cancel(authUserId: string, id: string) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    await this.dataSource.transaction(async (manager) => {
      const rec = await this.loadAdvanceForUpdate(manager, companyId, id);
      if (rec.status !== 'PENDING') throw new BadRequestException('Only pending advance requests can be cancelled');

      rec.status = 'CANCELLED';
      rec.updatedBy = user.id;
      const saved = await manager.save(HrAdvance, rec);
      await this.recordTransition(
        manager, user.id, companyId, saved,
        'CANCELLED', 'PENDING', 'CANCELLED', null, ['status'], null,
      );
    });

    return this.getById(authUserId, id);
  }

  // ── finance (disburse / recover) ────────────────────────────────────────────

  /**
   * Posts a balanced journal through the existing finance auto-posting service
   * inside the caller's transaction. Account mapping uses ONLY existing seeded
   * accounts (DR 1100 Accounts Receivable / CR 1000 Cash on disbursement, the
   * mirror on recovery; 2200 is a liability account and is never touched).
   * Throws if the company has no chart rows -> the whole transaction rolls back.
   */
  private async postMoneyJournal(manager: EntityManager, opts: {
    companyId: string;
    journalType: JournalType.PAYMENT | JournalType.RECEIPT;
    refNo: string;
    advanceId: string;
    amount: number;
    actorId: string;
  }) {
    const { companyId, journalType, refNo, advanceId, amount, actorId } = opts;
    if (journalType === JournalType.PAYMENT) {
      await this.financePostingService.postAutoJournal({
        companyId,
        journalType,
        entryDate: new Date(),
        description: `Advance disbursement ${refNo}`,
        referenceType: 'EMPLOYEE_ADVANCE',
        referenceId: advanceId,
        actorId,
        manager,
        lines: [
          { accountCode: '1100', debit: amount, credit: 0, description: `Employee advance receivable - ${refNo}` },
          { accountCode: '1000', debit: 0, credit: amount, description: `Cash paid to employee - ${refNo}` },
        ],
      });
    } else {
      await this.financePostingService.postAutoJournal({
        companyId,
        journalType: JournalType.RECEIPT,
        entryDate: new Date(),
        description: `Advance recovery ${refNo}`,
        referenceType: 'EMPLOYEE_ADVANCE',
        referenceId: advanceId,
        actorId,
        manager,
        lines: [
          { accountCode: '1000', debit: amount, credit: 0, description: `Cash received from employee - ${refNo}` },
          { accountCode: '1100', debit: 0, credit: amount, description: `Employee advance recovered - ${refNo}` },
        ],
      });
    }
  }

  /**
   * Full disbursement: APPROVED -> DISBURSED posting exactly the approved
   * amount, with exactly one PAYMENT journal (DR 1100 / CR 1000) committed in
   * the same transaction. The row lock + the single-allowed transition make a
   * second (or concurrent) disbursement fail safely — it re-reads DISBURSED and
   * never touches the journal, the balance or the recovered amount.
   */
  async disburse(authUserId: string, id: string, dto: DisburseAdvanceDto) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');

    await this.dataSource.transaction(async (manager) => {
      const rec = await this.loadAdvanceForUpdate(manager, companyId, id);
      if (rec.status !== 'APPROVED') {
        throw new BadRequestException('Only approved advance requests can be disbursed');
      }

      const amount = round4(Number(rec.approvedAmount ?? 0));
      this.assertPositiveAmount(amount, 'approvedAmount');

      rec.disbursedAmount = amount;
      rec.status = 'DISBURSED';
      rec.disbursedBy = user.id;
      rec.disbursedAt = new Date();
      rec.updatedBy = user.id;
      const saved = await manager.save(HrAdvance, rec);

      await this.postMoneyJournal(manager, {
        companyId, journalType: JournalType.PAYMENT, refNo: saved.refNo, advanceId: saved.id, amount, actorId: user.id,
      });
      await this.recordTransition(
        manager, user.id, companyId, saved, 'DISBURSED',
        'APPROVED', 'DISBURSED', amount, ['disbursed_amount', 'status'], dto.remarks ?? null,
      );
    });

    return this.getById(authUserId, id);
  }

  /**
   * Recovery: DISBURSED -> PARTIALLY_RECOVERED / RECOVERED (and
   * PARTIALLY_RECOVERED -> RECOVERED), with exactly one RECEIPT journal
   * (DR 1000 / CR 1100) per recovery in the same transaction. The row lock
   * serializes concurrent recoveries so outstanding can never be over-consumed
   * (recoveredAmount can never exceed disbursedAmount).
   */
  async recover(authUserId: string, id: string, dto: RecoverAdvanceDto) {
    const user = await this.resolveAuthUser(authUserId);
    const companyId = user.defaultCompanyId;
    if (!companyId) throw new BadRequestException('No default company configured for this account');
    this.assertPositiveAmount(dto.amount, 'amount');

    await this.dataSource.transaction(async (manager) => {
      const rec = await this.loadAdvanceForUpdate(manager, companyId, id);
      if (rec.status !== 'DISBURSED' && rec.status !== 'PARTIALLY_RECOVERED') {
        throw new BadRequestException('Only disbursed advances can be recovered');
      }

      const disbursed = Number(rec.disbursedAmount ?? 0);
      const recovered = Number(rec.recoveredAmount ?? 0);
      const outstanding = round4(disbursed - recovered);
      const amount = round4(dto.amount);
      if (amount - outstanding > 0.0001) {
        throw new BadRequestException(
          `Recovery of ${toFixed4(amount)} exceeds the outstanding balance (${toFixed4(outstanding)})`,
        );
      }

      const nextOutstanding = round4(outstanding - amount);
      const prevStatus = rec.status;
      rec.recoveredAmount = round4(recovered + amount);
      rec.recoveredBy = user.id;
      rec.recoveredAt = new Date();
      rec.updatedBy = user.id;
      const toStatus = nextOutstanding <= 0.0001 ? 'RECOVERED' : 'PARTIALLY_RECOVERED';
      rec.status = toStatus;
      const saved = await manager.save(HrAdvance, rec);

      await this.postMoneyJournal(manager, {
        companyId, journalType: JournalType.RECEIPT, refNo: saved.refNo, advanceId: saved.id, amount, actorId: user.id,
      });
      await this.recordTransition(
        manager, user.id, companyId, saved,
        'RECOVERED', prevStatus, toStatus,
        amount, ['recovered_amount', 'status'], dto.remarks ?? null,
      );
    });

    return this.getById(authUserId, id);
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  /** Extract the index name from a PG unique-violation error message. */
  private isDuplicateKey(err: { code?: string; message?: string }, table: string): boolean {
    const msg = String(err?.message ?? '');
    return msg.includes(table) && /uq|unique|key/i.test(msg);
  }
}

// ── row mapper ────────────────────────────────────────────────────────────────

function round4(v: unknown): number {
  return Math.round((Number(v) || 0) * 10000) / 10000;
}

function toFixed4(v: number): string {
  return Number(v).toFixed(4).replace(/0+$/, '').replace(/\.$/, '') || '0';
}

function mapAdvanceRow(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? row.r_id),
    refNo: String(row.ref_no),
    requestDate: String(row.request_date),
    requestedAmount: round4(row.requested_amount),
    approvedAmount: row.approved_amount != null ? round4(row.approved_amount) : null,
    disbursedAmount: round4(row.disbursed_amount),
    recoveredAmount: round4(row.recovered_amount),
    outstandingAmount: round4(row.outstanding_amount),
    currency: String(row.currency ?? 'USD'),
    reason: String(row.reason),
    remarks: (row.remarks as string | null) ?? null,
    decisionRemarks: (row.decision_remarks as string | null) ?? null,
    status: String(row.status),
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
      requestedBy: (row.requested_by_name as string | null) ?? null,
      decidedAt: (row.decided_at as string | null) ?? null,
      disbursedAt: (row.disbursed_at as string | null) ?? null,
      recoveredAt: (row.recovered_at as string | null) ?? null,
      createdBy: (row.created_by_name as string | null) ?? null,
      decidedBy: (row.decided_by_name as string | null) ?? null,
      disbursedBy: (row.disbursed_by_name as string | null) ?? null,
      recoveredBy: (row.recovered_by_name as string | null) ?? null,
      createdAt: (row.created_at as string | null) ?? null,
      updatedAt: (row.updated_at as string | null) ?? null,
    },
  };
}