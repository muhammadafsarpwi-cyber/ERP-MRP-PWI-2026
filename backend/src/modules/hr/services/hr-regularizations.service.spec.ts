import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HrRegularizationsService } from './hr-regularizations.service';
import { HrRegularization } from '../entities/hr-regularization.entity';
import { HrAttendanceHistory } from '../entities/hr-attendance-history.entity';
import { HrAttendance } from '../entities/hr-attendance.entity';
import { HrEmployee } from '../entities/hr-employee.entity';
import { HrLeaveRequest } from '../entities/hr-leave-request.entity';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';

function makeQb(overrides: Partial<any> = {}): any {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(undefined),
    getOne: jest.fn().mockResolvedValue(undefined),
    getCount: jest.fn().mockResolvedValue(0),
  };
  Object.assign(qb, overrides);
  return qb;
}

function makeQbWithRows(qb: any, rows: unknown[]): any {
  qb.getRawMany.mockResolvedValue(rows);
  qb.getCount.mockResolvedValue(rows.length);
  return qb;
}

const ADMIN_USER: any = {
  id: 'user-1', authUserId: 'auth-1', employeeId: null, defaultCompanyId: 'company-1', status: 'ACTIVE',
};

const SELF_USER: any = {
  id: 'user-2', authUserId: 'auth-2', employeeId: 'EMP-001', defaultCompanyId: 'company-1', status: 'ACTIVE',
};

const SELF_EMP: any = { id: 'emp-1', companyId: 'company-1', employeeCode: 'EMP-001', firstName: 'Ahmed', lastName: 'Raza', status: 'ACTIVE', isActive: true, departmentId: 'dept-1' };

const OTHER_EMP: any = { id: 'emp-2', companyId: 'company-1', employeeCode: 'EMP-002', firstName: 'Sara', lastName: 'Khan', status: 'ACTIVE', isActive: true, departmentId: 'dept-1' };

const ROW = {
  id: 'rgz-1', request_no: 'RGZ-ABC12345', attendance_date: '2026-08-30', correction_type: 'CHECK_IN',
  reason: 'MISSING_CHECK_IN', status: 'SUBMITTED',
  current_check_in: null, current_check_out: null, current_status: null,
  requested_check_in: '2026-08-30T08:00:00.000Z', requested_check_out: null, requested_status: null,
  approved_check_in: null, approved_check_out: null, approved_status: null,
  remarks: 'Forgot to punch in', decision_remarks: null,
  submitted_at: '2026-09-14 09:00', decided_at: null, created_at: '2026-09-14 09:00', updated_at: '2026-09-14 09:00',
  employee_id: 'emp-1', employee_code: 'EMP-001', first_name: 'Ahmed', last_name: 'Raza',
  job_title: 'Machine Operator', employee_status: 'ACTIVE',
  department_id: 'dept-1', department_name: 'Production',
  division_id: 'div-1', division_name: 'Manufacturing', section_id: null, section_name: null,
  created_by_name: 'System Admin', decided_by_name: null,
};

function repos(): any {
  return {
    regRepo: { createQueryBuilder: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn() },
    historyRepo: { create: jest.fn(), save: jest.fn() },
    attendanceRepo: { createQueryBuilder: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn() },
    employeeRepo: { findOne: jest.fn(), find: jest.fn() },
    leaveRepo: { createQueryBuilder: jest.fn() },
    departmentRepo: { findOne: jest.fn(), find: jest.fn() },
    divisionRepo: { findOne: jest.fn(), find: jest.fn() },
    sectionRepo: { findOne: jest.fn(), find: jest.fn() },
    userRepo: { findOne: jest.fn() },
  };
}

async function setup(): Promise<{ service: HrRegularizationsService; m: ReturnType<typeof repos> }> {
  jest.clearAllMocks();
  const m = repos();
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      HrRegularizationsService,
      { provide: getRepositoryToken(HrRegularization), useValue: m.regRepo },
      { provide: getRepositoryToken(HrAttendanceHistory), useValue: m.historyRepo },
      { provide: getRepositoryToken(HrAttendance), useValue: m.attendanceRepo },
      { provide: getRepositoryToken(HrEmployee), useValue: m.employeeRepo },
      { provide: getRepositoryToken(HrLeaveRequest), useValue: m.leaveRepo },
      { provide: getRepositoryToken(Department), useValue: m.departmentRepo },
      { provide: getRepositoryToken(Division), useValue: m.divisionRepo },
      { provide: getRepositoryToken(Section), useValue: m.sectionRepo },
      { provide: getRepositoryToken(ErpUser), useValue: m.userRepo },
    ],
  }).compile();
  const service = module.get<HrRegularizationsService>(HrRegularizationsService);
  return { service, m };
}

describe('HrRegularizationsService', () => {
  describe('authentication', () => {
    it('rejects when the ERP user is not provisioned', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(undefined);
      await expect(service.listRegularizations('auth-x', {})).rejects.toThrow(UnauthorizedException);
    });

    it('rejects inactive user accounts', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue({ ...ADMIN_USER, status: 'INACTIVE' });
      await expect(service.listRegularizations('auth-1', {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('options', () => {
    it('resolves company-scoped dropdowns and self-service linkage', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(SELF_USER);
      m.divisionRepo.find.mockResolvedValue([]);
      m.sectionRepo.find.mockResolvedValue([]);
      m.departmentRepo.find.mockResolvedValue([]);
      m.employeeRepo.find.mockResolvedValue([SELF_EMP, OTHER_EMP]);
      const options = await service.getRegularizationOptions('auth-2');
      expect(options.companyId).toBe('company-1');
      expect(options.self).toEqual({ employeeId: 'emp-1', employeeCode: 'EMP-001', name: 'Ahmed Raza' });
      expect(options.statuses).toContain('SUBMITTED');
      expect(options.types).toContain('CHECK_IN_OUT');
    });

    it('returns an empty (truthful) payload without a default company', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue({ ...ADMIN_USER, defaultCompanyId: null });
      const options = await service.getRegularizationOptions('auth-1');
      expect(options).toMatchObject({ companyId: null, employees: [], self: { employeeId: null } });
      expect(m.employeeRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns a truthful empty payload when the user has no default company', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue({ ...ADMIN_USER, defaultCompanyId: null });
      const out = await service.listRegularizations('auth-1', {});
      expect(out).toMatchObject({ reason: 'NO_DEFAULT_COMPANY', summary: { submitted: 0 }, records: [], total: 0 });
    });

    it('rejects date windows where from > to', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(OTHER_EMP);
      await expect(
        service.listRegularizations('auth-1', { dateFrom: '2026-09-20', dateTo: '2026-09-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a filter employee outside the current company', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(undefined);
      await expect(service.listRegularizations('auth-1', { employeeId: 'emp-9' })).rejects.toThrow(BadRequestException);
    });

    it('lists rows scoped to the user company with summary', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      const qb = makeQbWithRows(makeQb(), [ROW]);
      qb.getRawOne
        .mockResolvedValueOnce({ submitted: 1, approved: 2, rejected: 3, total: 6 })
        .mockResolvedValueOnce({ c: 0 });
      m.regRepo.createQueryBuilder.mockReturnValue(qb);
      m.regRepo.getCount = jest.fn().mockResolvedValue(1);
      const out = await service.listRegularizations('auth-1', { page: 1, limit: 10 });
      expect(out.companyId).toBe('company-1');
      expect(out.records[0].requestNo).toBe('RGZ-ABC12345');
      expect(out.summary).toMatchObject({ submitted: 1, approved: 2, rejected: 3, total: 6 });
    });
  });

  describe('create', () => {
    it('forces self-service users to their own employee (403 on another)', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(SELF_USER);
      m.employeeRepo.findOne.mockResolvedValue(SELF_EMP);
      await expect(
        service.create('auth-2', { employeeId: 'emp-2', attendanceDate: '2026-08-30', correctionType: 'CHECK_IN', reason: 'MISSING_CHECK_IN', requestedCheckIn: '2026-08-30T08:00:00' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('requires employeeId when the user has no employee linkage', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      await expect(
        service.create('auth-1', { attendanceDate: '2026-08-30', correctionType: 'CHECK_IN', reason: 'MISSING_CHECK_IN', requestedCheckIn: '2026-08-30T08:00:00' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a future attendance date', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(OTHER_EMP);
      await expect(
        service.create('auth-1', { employeeId: 'emp-2', attendanceDate: '2999-12-31', correctionType: 'CHECK_IN', reason: 'MISSING_CHECK_IN', requestedCheckIn: '2999-12-31T08:00:00' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns 409 for an active duplicate request on the same date', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(OTHER_EMP);
      m.regRepo.findOne.mockResolvedValue({ id: 'rgz-d' });
      await expect(
        service.create('auth-1', { employeeId: 'emp-2', attendanceDate: '2026-08-30', correctionType: 'CHECK_IN', reason: 'MISSING_CHECK_IN', requestedCheckIn: '2026-08-30T08:00:00' }),
      ).rejects.toThrow(ConflictException);
    });

    it('blocks a date recorded as LEAVE in attendance', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(OTHER_EMP);
      m.regRepo.findOne.mockResolvedValue(undefined);
      m.attendanceRepo.findOne.mockResolvedValue({ status: 'LEAVE' });
      await expect(
        service.create('auth-1', { employeeId: 'emp-2', attendanceDate: '2026-08-30', correctionType: 'CHECK_IN', reason: 'MISSING_CHECK_IN', requestedCheckIn: '2026-08-30T08:00:00' }),
      ).rejects.toThrow(/LEAVE/);
    });

    it('blocks a date covered by an approved leave', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(OTHER_EMP);
      m.regRepo.findOne.mockResolvedValue(undefined);
      m.attendanceRepo.findOne.mockResolvedValue(undefined);
      const leaveQb = makeQb();
      leaveQb.getOne.mockResolvedValue({ id: 'leave-1' });
      m.leaveRepo.createQueryBuilder.mockReturnValue(leaveQb);
      await expect(
        service.create('auth-1', { employeeId: 'emp-2', attendanceDate: '2026-08-30', correctionType: 'CHECK_IN', reason: 'MISSING_CHECK_IN', requestedCheckIn: '2026-08-30T08:00:00' }),
      ).rejects.toThrow('approved leave');
    });

    it('requires the requested time to match the attendance date', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(OTHER_EMP);
      m.regRepo.findOne.mockResolvedValue(undefined);
      m.attendanceRepo.findOne.mockResolvedValue(undefined);
      m.leaveRepo.createQueryBuilder.mockReturnValue(makeQb());
      await expect(
        service.create('auth-1', { employeeId: 'emp-2', attendanceDate: '2026-08-30', correctionType: 'CHECK_IN', reason: 'MISSING_CHECK_IN', requestedCheckIn: '2026-08-31T08:00:00' }),
      ).rejects.toThrow('must be on the attendance date');
    });

    it('rejects requested check-in after check-out', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(OTHER_EMP);
      m.regRepo.findOne.mockResolvedValue(undefined);
      m.attendanceRepo.findOne.mockResolvedValue(undefined);
      m.leaveRepo.createQueryBuilder.mockReturnValue(makeQb());
      await expect(
        service.create('auth-1', { employeeId: 'emp-2', attendanceDate: '2026-08-30', correctionType: 'CHECK_IN_OUT', reason: 'WRONG_CHECK_IN', requestedCheckIn: '2026-08-30T18:00:00', requestedCheckOut: '2026-08-30T08:00:00' }),
      ).rejects.toThrow('check-in must be before check-out');
    });

    it('saves a request with captured current values and a generated request number', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(OTHER_EMP);
      m.regRepo.findOne.mockResolvedValue(undefined);
      m.attendanceRepo.findOne.mockResolvedValue({ id: 'att-1', checkIn: new Date('2026-08-30T06:30:00'), checkOut: new Date('2026-08-30T16:00:00'), status: 'PRESENT' });
      m.leaveRepo.createQueryBuilder.mockReturnValue(makeQb());
      const saved = { id: 'rgz-1', requestNo: 'RGZ-ABC12345', ...OTHER_EMP, createdBy: 'user-1' };
      m.regRepo.create.mockImplementation((r: any) => r);
      m.regRepo.save.mockResolvedValue(saved);
      const detailQb = makeQb();
      detailQb.getRawOne.mockResolvedValue(ROW);
      const attQb = { ...makeQb(), getRawOne: jest.fn().mockResolvedValue(ROW) };
      m.regRepo.createQueryBuilder.mockReturnValue(detailQb);
      m.attendanceRepo.findOne.mockResolvedValue({ id: 'att-1', checkIn: new Date('2026-08-30T06:30:00'), checkOut: new Date('2026-08-30T16:00:00'), status: 'PRESENT', shiftId: 'shift-1' });
      const detail = await service.create('auth-1', { employeeId: 'emp-2', attendanceDate: '2026-08-30', correctionType: 'CHECK_IN', reason: 'MISSING_CHECK_IN', requestedCheckIn: '2026-08-30T08:00:00' });
      expect(m.regRepo.save).toHaveBeenCalled();
      const savedArg = m.regRepo.save.mock.calls[0][0];
      expect(savedArg.requestNo).toMatch(/^RGZ-[0-9A-F]{8}$/);
      expect(savedArg.currentStatus).toBe('PRESENT');
      expect(savedArg.currentCheckIn).toEqual(new Date('2026-08-30T06:30:00'));
      expect(detail.requestNo).toBe('RGZ-ABC12345');
    });
  });

  describe('update', () => {
    it('allows only the requester to edit', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.regRepo.findOne.mockResolvedValue({ id: 'rgz-1', status: 'SUBMITTED', createdBy: 'someone-else', employeeId: 'emp-2', attendanceDate: new Date('2026-08-30T00:00:00') });
      await expect(service.update('auth-1', 'rgz-1', { reason: 'OTHER' })).rejects.toThrow(ForbiddenException);
    });

    it('rejects edits to a decided request', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.regRepo.findOne.mockResolvedValue({ id: 'rgz-1', status: 'APPROVED', createdBy: 'user-1' });
      await expect(service.update('auth-1', 'rgz-1', { reason: 'OTHER' })).rejects.toThrow('Only submitted');
    });

    it('updates a submitted request (merging with existing requested values)', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.regRepo.findOne.mockResolvedValue({ id: 'rgz-1', status: 'SUBMITTED', createdBy: 'user-1', employeeId: 'emp-2', attendanceDate: new Date('2026-08-30T00:00:00'), correctionType: 'CHECK_IN', reason: 'MISSING_CHECK_IN', requestedCheckIn: new Date('2026-08-30T08:00:00'), requestedCheckOut: null, requestedStatus: null, remarks: null });
      m.leaveRepo.createQueryBuilder.mockReturnValue(makeQb());
      m.regRepo.save.mockResolvedValue({}); 
      const detailQb = makeQb();
      detailQb.getRawOne.mockResolvedValue(ROW);
      m.regRepo.createQueryBuilder.mockReturnValue(detailQb);
      m.attendanceRepo.findOne.mockResolvedValue(undefined);
      const out = await service.update('auth-1', 'rgz-1', { reason: 'WRONG_CHECK_IN' });
      expect(m.regRepo.save).toHaveBeenCalled();
      expect(m.regRepo.save.mock.calls[0][0].reason).toBe('WRONG_CHECK_IN');
      expect(out.requestNo).toBe('RGZ-ABC12345');
    });
  });

  describe('delete', () => {
    it('soft-deletes only submitted requests', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      const rec: any = { id: 'rgz-1', status: 'SUBMITTED', companyId: 'company-1' };
      m.regRepo.findOne.mockResolvedValue(rec);
      m.regRepo.save.mockResolvedValue(rec);
      const out = await service.delete('auth-1', 'rgz-1');
      expect(out).toEqual({ id: 'rgz-1', deleted: true });
      expect(rec.isActive).toBe(false);
    });

    it('cannot delete a decided request', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.regRepo.findOne.mockResolvedValue({ id: 'rgz-1', status: 'APPROVED' });
      await expect(service.delete('auth-1', 'rgz-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve', () => {
    it('applies a correction to existing attendance and snapshots the original', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.regRepo.findOne.mockResolvedValue({
        id: 'rgz-1', companyId: 'company-1', employeeId: 'emp-2', status: 'SUBMITTED',
        correctionType: 'CHECK_IN', attendanceDate: new Date('2026-08-30T00:00:00'),
        requestedCheckIn: new Date('2026-08-30T08:00:00'), requestedCheckOut: null, requestedStatus: null,
      });
      m.leaveRepo.createQueryBuilder.mockReturnValue(makeQb());
      const att = { id: 'att-1', companyId: 'company-1', employeeId: 'emp-2', shiftId: null, checkIn: new Date('2026-08-30T06:30:00'), checkOut: new Date('2026-08-30T16:00:00'), status: 'PRESENT', overtimeMinutes: 0, remarks: null };
      m.attendanceRepo.findOne.mockResolvedValue(att);
      m.attendanceRepo.save.mockImplementation((a: any) => Promise.resolve(a));
      m.historyRepo.create.mockImplementation((h: any) => h);
      m.historyRepo.save.mockResolvedValue({});
      const rec = { id: 'rgz-1', status: 'SUBMITTED', companyId: 'company-1' };
      m.regRepo.save.mockResolvedValue(rec);
      const detailQb = makeQb();
      detailQb.getRawOne.mockResolvedValue({ ...ROW, status: 'APPROVED', decided_at: '2026-09-14 10:00' });
      m.regRepo.createQueryBuilder.mockReturnValue(detailQb);
      m.attendanceRepo.findOne.mockResolvedValue(att);

      const out = await service.approve('auth-1', 'rgz-1', {});
      expect(att.checkIn.toISOString()).toBe(new Date('2026-08-30T08:00:00').toISOString());
      const history = m.historyRepo.save.mock.calls[0][0];
      expect(history.operation).toBe('UPDATE');
      expect(history.snapshot.checkIn).toBe(new Date('2026-08-30T06:30:00').toISOString());
      expect(history.changedFields).toContain('check_in');
      expect(m.regRepo.save.mock.calls[0][0].status).toBe('APPROVED');
      expect(out.status).toBe('APPROVED');
    });

    it('creates the attendance row (INSERT history) when none exists', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.regRepo.findOne.mockResolvedValue({
        id: 'rgz-2', companyId: 'company-1', employeeId: 'emp-3', status: 'SUBMITTED',
        correctionType: 'CHECK_IN', attendanceDate: new Date('2026-09-10T00:00:00'),
        requestedCheckIn: new Date('2026-09-10T07:45:00'), requestedCheckOut: null, requestedStatus: null,
      });
      m.leaveRepo.createQueryBuilder.mockReturnValue(makeQb());
      m.attendanceRepo.findOne.mockResolvedValue(undefined);
      m.attendanceRepo.create.mockReturnValue({});
      m.attendanceRepo.save.mockImplementation((a: any) => Promise.resolve({ ...a, id: 'att-new' }));
      m.historyRepo.create.mockImplementation((h: any) => h);
      m.historyRepo.save.mockResolvedValue({});
      const rec = { id: 'rgz-2', status: 'SUBMITTED' };
      m.regRepo.save.mockResolvedValue(rec);
      const detailQb = makeQb();
      detailQb.getRawOne.mockResolvedValue({ ...ROW, id: 'rgz-2', status: 'APPROVED' });
      m.regRepo.createQueryBuilder.mockReturnValue(detailQb);

      await service.approve('auth-1', 'rgz-2', {});
      const history = m.historyRepo.save.mock.calls[0][0];
      expect(history.operation).toBe('INSERT');
      expect(history.attendanceId).toBe('att-new');
    });

    it('re-checks leave conflicts at decision time', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.regRepo.findOne.mockResolvedValue({ id: 'rgz-1', companyId: 'company-1', employeeId: 'emp-2', status: 'SUBMITTED', correctionType: 'STATUS', attendanceDate: new Date('2026-08-30T00:00:00'), requestedStatus: 'PRESENT' });
      const leaveQb = makeQb();
      leaveQb.getOne.mockResolvedValue({ id: 'leave-9' });
      m.leaveRepo.createQueryBuilder.mockReturnValue(leaveQb);
      await expect(service.approve('auth-1', 'rgz-1', {})).rejects.toThrow('approved leave');
    });

    it('cannot approve a request that is not SUBMITTED', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.regRepo.findOne.mockResolvedValue({ id: 'rgz-1', status: 'REJECTED' });
      await expect(service.approve('auth-1', 'rgz-1', {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('reject', () => {
    it('marks the request REJECTED without touching attendance', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      const rec: any = { id: 'rgz-1', status: 'SUBMITTED', companyId: 'company-1' };
      m.regRepo.findOne.mockResolvedValue(rec);
      m.regRepo.save.mockResolvedValue(rec);
      const detailQb = makeQb();
      detailQb.getRawOne.mockResolvedValue({ ...ROW, status: 'REJECTED', decided_at: '2026-09-14 11:00' });
      m.regRepo.createQueryBuilder.mockReturnValue(detailQb);
      const out = await service.reject('auth-1', 'rgz-1', { remarks: 'Not justified' });
      expect(rec.status).toBe('REJECTED');
      expect(rec.decisionRemarks).toBe('Not justified');
      expect(m.attendanceRepo.save).not.toHaveBeenCalled();
      expect(m.historyRepo.save).not.toHaveBeenCalled();
      expect(out.status).toBe('REJECTED');
    });

    it('cannot reject a decided request', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.regRepo.findOne.mockResolvedValue({ id: 'rgz-1', status: 'APPROVED' });
      await expect(service.reject('auth-1', 'rgz-1', {})).rejects.toThrow(BadRequestException);
    });
  });
});