import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { HrOvertimeService } from './hr-overtime.service';
import { HrOvertime } from '../entities/hr-overtime.entity';
import { HrOvertimeHistory } from '../entities/hr-overtime-history.entity';
import { HrAttendance } from '../entities/hr-attendance.entity';
import { HrEmployee } from '../entities/hr-employee.entity';
import { HrShift } from '../entities/hr-shift.entity';
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

const SHIFT: any = { id: 'shift-1', companyId: 'company-1', shiftCode: 'A', shiftName: 'Morning', startTime: '08:00:00', endTime: '17:00:00', workingHours: 8 };

const HISTORY_ROW = {
  id: 'h-1', from_status: null, to_status: 'PENDING', requested_hours: '2.50', approved_hours: null,
  remarks: null, changed_fields: ['created'], created_at: '2026-09-14 09:00', created_by_name: 'System Admin',
};

const ROW = {
  id: 'ot-1', ref_no: 'OT-ABC12345', overtime_date: '2026-09-14', requested_hours: '2.50', approved_hours: null,
  reason: 'OVERTIME DUTY', remarks: 'Extra production run', decision_remarks: null, status: 'PENDING',
  submitted_at: '2026-09-14 09:00', decided_at: null, created_at: '2026-09-14 09:00', updated_at: '2026-09-14 09:00',
  employee_id: 'emp-1', employee_code: 'EMP-001', first_name: 'Ahmed', last_name: 'Raza',
  job_title: 'Machine Operator', employee_status: 'ACTIVE',
  department_id: 'dept-1', department_name: 'Production',
  division_id: 'div-1', division_name: 'Manufacturing', section_id: null, section_name: null,
  created_by_name: 'System Admin', decided_by_name: null,
  attendance_row_id: 'att-1', check_in: '2026-09-14T07:00:00.000Z', check_out: '2026-09-14T18:30:00.000Z', attendance_status: 'PRESENT',
  shift_id: 'shift-1', shift_code: 'A', shift_name: 'Morning', shift_start: '08:00', shift_end: '17:00', shift_hours: '8.00',
};

function repos(): any {
  return {
    otRepo: { createQueryBuilder: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn() },
    historyRepo: { createQueryBuilder: jest.fn(), create: jest.fn(), save: jest.fn() },
    attendanceRepo: { findOne: jest.fn(), create: jest.fn(), save: jest.fn() },
    employeeRepo: { findOne: jest.fn(), find: jest.fn() },
    shiftRepo: { findOne: jest.fn(), find: jest.fn() },
    departmentRepo: { findOne: jest.fn(), find: jest.fn() },
    divisionRepo: { findOne: jest.fn(), find: jest.fn() },
    sectionRepo: { findOne: jest.fn(), find: jest.fn() },
    userRepo: { findOne: jest.fn() },
  };
}

function wireDetail(m: ReturnType<typeof repos>, row: unknown = ROW, history: unknown[] = [HISTORY_ROW]) {
  const detailQb = makeQb();
  detailQb.getRawOne.mockResolvedValue(row);
  m.otRepo.createQueryBuilder.mockReturnValue(detailQb);
  const hQb = makeQb();
  hQb.getRawMany.mockResolvedValue(history);
  m.historyRepo.createQueryBuilder.mockReturnValue(hQb);
}

async function setup(): Promise<{ service: HrOvertimeService; m: ReturnType<typeof repos> }> {
  jest.clearAllMocks();
  const m = repos();
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      HrOvertimeService,
      { provide: getRepositoryToken(HrOvertime), useValue: m.otRepo },
      { provide: getRepositoryToken(HrOvertimeHistory), useValue: m.historyRepo },
      { provide: getRepositoryToken(HrAttendance), useValue: m.attendanceRepo },
      { provide: getRepositoryToken(HrEmployee), useValue: m.employeeRepo },
      { provide: getRepositoryToken(HrShift), useValue: m.shiftRepo },
      { provide: getRepositoryToken(Department), useValue: m.departmentRepo },
      { provide: getRepositoryToken(Division), useValue: m.divisionRepo },
      { provide: getRepositoryToken(Section), useValue: m.sectionRepo },
      { provide: getRepositoryToken(ErpUser), useValue: m.userRepo },
    ],
  }).compile();
  const service = module.get<HrOvertimeService>(HrOvertimeService);
  return { service, m };
}

describe('HrOvertimeService', () => {
  describe('authentication', () => {
    it('rejects when the ERP user is not provisioned', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(undefined);
      await expect(service.listOvertime('auth-x', {})).rejects.toThrow(UnauthorizedException);
    });

    it('rejects inactive user accounts', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue({ ...ADMIN_USER, status: 'INACTIVE' });
      await expect(service.listOvertime('auth-1', {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('options', () => {
    it('resolves company-scoped dropdowns including shifts and self-service linkage', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(SELF_USER);
      m.divisionRepo.find.mockResolvedValue([]);
      m.sectionRepo.find.mockResolvedValue([]);
      m.departmentRepo.find.mockResolvedValue([]);
      m.employeeRepo.find.mockResolvedValue([SELF_EMP, OTHER_EMP]);
      m.shiftRepo.find.mockResolvedValue([SHIFT]);
      const options = await service.getOvertimeOptions('auth-2');
      expect(options.companyId).toBe('company-1');
      expect(options.self).toEqual({ employeeId: 'emp-1', employeeCode: 'EMP-001', name: 'Ahmed Raza' });
      expect(options.statuses).toEqual(['PENDING', 'APPROVED', 'REJECTED']);
      expect(options.shifts[0]).toMatchObject({ id: 'shift-1', code: 'A', name: 'Morning', startTime: '08:00', endTime: '17:00', workingHours: 8 });
    });

    it('returns an empty (truthful) payload without a default company', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue({ ...ADMIN_USER, defaultCompanyId: null });
      const options = await service.getOvertimeOptions('auth-1');
      expect(options).toMatchObject({ companyId: null, employees: [], self: { employeeId: null } });
      expect(m.employeeRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns a truthful empty payload when the user has no default company', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue({ ...ADMIN_USER, defaultCompanyId: null });
      const out = await service.listOvertime('auth-1', {});
      expect(out).toMatchObject({ reason: 'NO_DEFAULT_COMPANY', summary: { pending: 0 }, records: [], total: 0 });
    });

    it('rejects date windows where from > to', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      await expect(
        service.listOvertime('auth-1', { dateFrom: '2026-09-20', dateTo: '2026-09-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a filter employee outside the current company', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(undefined);
      await expect(service.listOvertime('auth-1', { employeeId: 'emp-9' })).rejects.toThrow(BadRequestException);
    });

    it('rejects a filter shift outside the current company', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.shiftRepo.findOne.mockResolvedValue(undefined);
      await expect(service.listOvertime('auth-1', { shiftId: 'shift-x' })).rejects.toThrow(BadRequestException);
    });

    it('lists rows scoped to the user company with summary and computed candidate overtime', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      const qb = makeQbWithRows(makeQb(), [ROW]);
      qb.getRawOne
        .mockResolvedValueOnce({ pending: 1, approved: 2, rejected: 3, requested_hours: '8.50', approved_hours: '4.00', total: 6 })
        .mockResolvedValueOnce({ c: 1 });
      m.otRepo.createQueryBuilder.mockReturnValue(qb);
      const out = await service.listOvertime('auth-1', { page: 1, limit: 10 });
      expect(out.companyId).toBe('company-1');
      expect(out.records[0].refNo).toBe('OT-ABC12345');
      expect(out.records[0].requestedHours).toBe(2.5);
      expect(out.records[0].approvedHours).toBeNull();
      expect(out.records[0].attendance).toMatchObject({ id: 'att-1', durationMinutes: 690, candidateOvertimeMinutes: 90 });
      expect(out.records[0].shift).toMatchObject({ id: 'shift-1', code: 'A', name: 'Morning', startTime: '08:00', endTime: '17:00' });
      expect(out.summary).toMatchObject({ pending: 1, approved: 2, rejected: 3, totalRequestedHours: 8.5, totalApprovedHours: 4, total: 6 });
    });
  });

  describe('create', () => {
    it('forces self-service users to their own employee (403 on another)', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(SELF_USER);
      m.employeeRepo.findOne.mockResolvedValue(SELF_EMP);
      await expect(
        service.create('auth-2', { employeeId: 'emp-2', overtimeDate: '2026-09-14', requestedHours: 2, reason: 'OVERTIME DUTY' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('requires employeeId when the user has no employee linkage', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      await expect(
        service.create('auth-1', { overtimeDate: '2026-09-14', requestedHours: 2, reason: 'OVERTIME DUTY' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a future overtime date', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(OTHER_EMP);
      await expect(
        service.create('auth-1', { employeeId: 'emp-2', overtimeDate: '2999-12-31', requestedHours: 2, reason: 'OVERTIME DUTY' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns 409 for an active duplicate request on the same date', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(OTHER_EMP);
      m.otRepo.findOne.mockResolvedValue({ id: 'ot-d' });
      await expect(
        service.create('auth-1', { employeeId: 'emp-2', overtimeDate: '2026-09-14', requestedHours: 2, reason: 'OVERTIME DUTY' }),
      ).rejects.toThrow(ConflictException);
    });

    it('blocks a non-working date recorded as HOLIDAY in attendance', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(OTHER_EMP);
      m.otRepo.findOne.mockResolvedValue(undefined);
      m.attendanceRepo.findOne.mockResolvedValue({ status: 'HOLIDAY' });
      await expect(
        service.create('auth-1', { employeeId: 'emp-2', overtimeDate: '2026-09-14', requestedHours: 2, reason: 'OVERTIME DUTY' }),
      ).rejects.toThrow(/HOLIDAY/);
    });

    it('rejects a shift outside the current company', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(OTHER_EMP);
      m.otRepo.findOne.mockResolvedValue(undefined);
      m.attendanceRepo.findOne.mockResolvedValue(undefined);
      m.shiftRepo.findOne.mockResolvedValue(undefined);
      await expect(
        service.create('auth-1', { employeeId: 'emp-2', overtimeDate: '2026-09-14', requestedHours: 2, reason: 'OVERTIME DUTY', shiftId: 'shift-x' }),
      ).rejects.toThrow('Shift not found');
    });

    it('saves a request with attendance/shift snapshot and records the created transition', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.employeeRepo.findOne.mockResolvedValue(OTHER_EMP);
      m.otRepo.findOne.mockResolvedValue(undefined);
      m.attendanceRepo.findOne.mockResolvedValue({ id: 'att-1', status: 'PRESENT', shiftId: 'shift-1' });
      const saved = { id: 'ot-1', refNo: 'OT-ABC12345', companyId: 'company-1', requestedHours: 2, approvedHours: null };
      m.otRepo.create.mockImplementation((r: any) => r);
      m.otRepo.save.mockResolvedValue(saved);
      m.historyRepo.create.mockImplementation((h: any) => h);
      m.historyRepo.save.mockResolvedValue({});
      wireDetail(m);
      const detail = await service.create('auth-1', { employeeId: 'emp-2', overtimeDate: '2026-09-14', requestedHours: 2, reason: 'OVERTIME DUTY' });
      expect(m.otRepo.save).toHaveBeenCalled();
      const savedArg = m.otRepo.save.mock.calls[0][0];
      expect(savedArg.refNo).toMatch(/^OT-[0-9A-F]{8}$/);
      expect(savedArg.attendanceId).toBe('att-1');
      expect(savedArg.shiftId).toBe('shift-1');
      expect(savedArg.status).toBe('PENDING');
      expect(m.historyRepo.save).toHaveBeenCalled();
      const history = m.historyRepo.save.mock.calls[0][0];
      expect(history.fromStatus).toBeNull();
      expect(history.toStatus).toBe('PENDING');
      expect(detail.refNo).toBe('OT-ABC12345');
      expect(detail.history).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('allows only the requester to edit', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.otRepo.findOne.mockResolvedValue({ id: 'ot-1', status: 'PENDING', createdBy: 'someone-else' });
      await expect(service.update('auth-1', 'ot-1', { reason: 'OVERTIME DUTY' })).rejects.toThrow(ForbiddenException);
    });

    it('rejects edits to a decided request', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.otRepo.findOne.mockResolvedValue({ id: 'ot-1', status: 'APPROVED', createdBy: 'user-1' });
      await expect(service.update('auth-1', 'ot-1', { reason: 'OVERTIME DUTY' })).rejects.toThrow('Only pending');
    });

    it('rejects an edited shift outside the current company', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.otRepo.findOne.mockResolvedValue({ id: 'ot-1', status: 'PENDING', createdBy: 'user-1' });
      m.shiftRepo.findOne.mockResolvedValue(undefined);
      await expect(service.update('auth-1', 'ot-1', { shiftId: 'shift-x' })).rejects.toThrow('Shift not found');
    });

    it('updates a pending request', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.otRepo.findOne.mockResolvedValue({ id: 'ot-1', status: 'PENDING', createdBy: 'user-1', reason: 'EXTRA SHIFT', remarks: null, requestedHours: '2.00' });
      m.otRepo.save.mockResolvedValue({});
      wireDetail(m);
      const out = await service.update('auth-1', 'ot-1', { reason: 'OVERTIME DUTY', requestedHours: 3 });
      expect(m.otRepo.save).toHaveBeenCalled();
      expect(m.otRepo.save.mock.calls[0][0].reason).toBe('OVERTIME DUTY');
      expect(m.otRepo.save.mock.calls[0][0].requestedHours).toBe(3);
      expect(out.refNo).toBe('OT-ABC12345');
    });
  });

  describe('delete', () => {
    it('soft-deletes only pending requests', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      const rec: any = { id: 'ot-1', status: 'PENDING', companyId: 'company-1' };
      m.otRepo.findOne.mockResolvedValue(rec);
      m.otRepo.save.mockResolvedValue(rec);
      const out = await service.delete('auth-1', 'ot-1');
      expect(out).toEqual({ id: 'ot-1', deleted: true });
      expect(rec.isActive).toBe(false);
    });

    it('cannot delete a decided request', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.otRepo.findOne.mockResolvedValue({ id: 'ot-1', status: 'APPROVED' });
      await expect(service.delete('auth-1', 'ot-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('approve', () => {
    it('approves using requested hours by default and records the transition', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      const rec: any = { id: 'ot-1', status: 'PENDING', companyId: 'company-1', requestedHours: '2.50', approvedHours: null, overtimeDate: new Date('2026-09-14T00:00:00') };
      m.otRepo.findOne.mockResolvedValue(rec);
      m.otRepo.save.mockResolvedValue(rec);
      m.historyRepo.create.mockImplementation((h: any) => h);
      m.historyRepo.save.mockResolvedValue({});
      wireDetail(m, { ...ROW, status: 'APPROVED', approved_hours: '2.50', decided_at: '2026-09-14 10:00' });
      const out = await service.approve('auth-1', 'ot-1', {});
      expect(rec.status).toBe('APPROVED');
      expect(rec.approvedHours).toBe(2.5);
      expect(m.historyRepo.save).toHaveBeenCalled();
      const history = m.historyRepo.save.mock.calls[0][0];
      expect(history.fromStatus).toBe('PENDING');
      expect(history.toStatus).toBe('APPROVED');
      expect(history.changedFields).toEqual(['status']);
      expect(out.status).toBe('APPROVED');
    });

    it('approves with explicit approved hours and records the approved_hours field', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      const rec: any = { id: 'ot-1', status: 'PENDING', companyId: 'company-1', requestedHours: '2.50', approvedHours: null };
      m.otRepo.findOne.mockResolvedValue(rec);
      m.otRepo.save.mockResolvedValue(rec);
      m.historyRepo.create.mockImplementation((h: any) => h);
      m.historyRepo.save.mockResolvedValue({});
      wireDetail(m, { ...ROW, status: 'APPROVED', approved_hours: '3.50', decided_at: '2026-09-14 10:00' });
      await service.approve('auth-1', 'ot-1', { approvedHours: 3.5, remarks: 'Verified from clock out' });
      const history = m.historyRepo.save.mock.calls[0][0];
      expect(history.changedFields).toContain('approved_hours');
      expect(history.approvedHours).toBe(3.5);
    });

    it('cannot approve a request that is not PENDING', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.otRepo.findOne.mockResolvedValue({ id: 'ot-1', status: 'REJECTED' });
      await expect(service.approve('auth-1', 'ot-1', {})).rejects.toThrow(BadRequestException);
    });

    it('404s when the request is not found in the current company', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.otRepo.findOne.mockResolvedValue(undefined);
      await expect(service.approve('auth-1', 'ot-9', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('reject', () => {
    it('rejects with the required remarks and records the transition', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      const rec: any = { id: 'ot-1', status: 'PENDING', companyId: 'company-1', requestedHours: '2.50', approvedHours: null };
      m.otRepo.findOne.mockResolvedValue(rec);
      m.otRepo.save.mockResolvedValue(rec);
      m.historyRepo.create.mockImplementation((h: any) => h);
      m.historyRepo.save.mockResolvedValue({});
      wireDetail(m, { ...ROW, status: 'REJECTED', decided_at: '2026-09-14 11:00' });
      const out = await service.reject('auth-1', 'ot-1', { remarks: 'Overtime not approved for this date' });
      expect(rec.status).toBe('REJECTED');
      expect(rec.decisionRemarks).toBe('Overtime not approved for this date');
      expect(m.attendanceRepo.save).not.toHaveBeenCalled();
      const history = m.historyRepo.save.mock.calls[0][0];
      expect(history.fromStatus).toBe('PENDING');
      expect(history.toStatus).toBe('REJECTED');
      expect(history.remarks).toBe('Overtime not approved for this date');
      expect(out.status).toBe('REJECTED');
    });

    it('cannot reject a decided request', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      m.otRepo.findOne.mockResolvedValue({ id: 'ot-1', status: 'APPROVED' });
      await expect(service.reject('auth-1', 'ot-1', { remarks: 'x' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('getById', () => {
    it('404s when the request does not exist in the current company', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      const qb = makeQb();
      qb.getRawOne.mockResolvedValue(undefined);
      m.otRepo.createQueryBuilder.mockReturnValue(qb);
      await expect(service.getById('auth-1', 'ot-9')).rejects.toThrow(NotFoundException);
    });

    it('returns detail with the transition history', async () => {
      const { service, m } = await setup();
      m.userRepo.findOne.mockResolvedValue(ADMIN_USER);
      wireDetail(m);
      const out = await service.getById('auth-1', 'ot-1');
      expect(out.refNo).toBe('OT-ABC12345');
      expect(out.history).toHaveLength(1);
      expect(out.history[0]).toMatchObject({ toStatus: 'PENDING', createdBy: 'System Admin' });
    });
  });
});