import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { HrService } from './hr.service';
import { HrDesignation } from '../entities/hr-designation.entity';
import { HrEmployee } from '../entities/hr-employee.entity';
import { HrAttendance } from '../entities/hr-attendance.entity';
import { HrLeaveRequest } from '../entities/hr-leave-request.entity';
import { HrLeaveType } from '../entities/hr-leave-type.entity';
import { HrShift } from '../entities/hr-shift.entity';
import { HrHoliday } from '../entities/hr-holiday.entity';
import { HrShiftRoster } from '../entities/hr-shift-roster.entity';
import { HrEmployeeSkill } from '../entities/hr-employee-skill.entity';
import { HrEmployeeTraining } from '../entities/hr-employee-training.entity';
import { HrEmployeeDocument } from '../entities/hr-employee-document.entity';
import { HrEmployeeHistory } from '../entities/hr-employee-history.entity';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { BarcodeService } from '../../barcode/services/barcode.service';

function makeQb(overrides: Partial<any> = {}): any {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(undefined),
    getCount: jest.fn().mockResolvedValue(0),
  };
  Object.assign(qb, overrides);
  return qb;
}

function queues(repo: any, items: any[], fallback?: any): void {
  repo.createQueryBuilder = jest.fn(() => (items.length ? items.shift() : fallback ?? makeQb()));
}

const USER_FIXTURE: any = {
  id: 'user-1',
  authUserId: 'auth-1',
  employeeId: null,
  defaultCompanyId: 'company-1',
  status: 'ACTIVE',
};

const ROSTER_ROW: any = {
  id: 'roster-1',
  roster_date: '2026-09-14',
  assignment_status: 'ASSIGNED',
  remarks: null,
  employee_id: 'emp-ft5',
  employee_code: 'EMP-FT5',
  first_name: 'Phase5b',
  last_name: 'Test',
  job_title: 'Operator',
  employee_status: 'ACTIVE',
  designation_id: 'des-1',
  designation_code: 'D-006',
  designation_name: 'Machine Operator',
  department_id: 'dept-1',
  department_name: 'Production',
  division_id: 'div-1',
  division_name: 'Manufacturing Division',
  section_id: 'sec-1',
  section_name: 'Assembly Line A',
  shift_id: 'shift-1',
  shift_code: 'S-1',
  shift_name: 'S-1 Morning',
  shift_start_time: '08:00:00',
  shift_end_time: '16:00:00',
  attendance_id: 'att-1',
  attendance_status: 'PRESENT',
};

const UNASSIGNED_ROW: any = {
  id: null,
  roster_date: null,
  assignment_status: null,
  remarks: null,
  employee_id: 'emp-ft6',
  employee_code: 'EMP-FT6',
  first_name: 'Un',
  last_name: 'Assigned',
  job_title: 'Supervisor',
  employee_status: 'ACTIVE',
  designation_id: 'des-2',
  designation_code: 'D-002',
  designation_name: 'Supervisor',
  department_id: 'dept-2',
  department_name: 'Quality',
  division_id: 'div-2',
  division_name: 'Engineering',
  section_id: 'sec-2',
  section_name: 'QC Bay',
  shift_id: null,
  shift_code: null,
  shift_name: null,
  shift_start_time: null,
  shift_end_time: null,
  attendance_id: null,
  attendance_status: null,
};

function repos(): any {
  return {
    designationRepo: {},
    employeeRepo: { findOne: jest.fn(), find: jest.fn(), createQueryBuilder: jest.fn() },
    attendanceRepo: { createQueryBuilder: jest.fn() },
    leaveRepo: {},
    leaveTypeRepo: {},
    shiftRepo: { findOne: jest.fn(), find: jest.fn() },
    holidayRepo: {},
    skillRepo: {},
    trainingRepo: {},
    docRepo: {},
    historyRepo: {},
    rosterRepo: { findOne: jest.fn(), find: jest.fn(), save: jest.fn(), create: jest.fn(), createQueryBuilder: jest.fn() },
    departmentRepo: { findOne: jest.fn(), find: jest.fn() },
    divisionRepo: { findOne: jest.fn(), find: jest.fn() },
    sectionRepo: { findOne: jest.fn(), find: jest.fn() },
    userRepo: { findOne: jest.fn() },
    barcodeService: {},
  };
}

function buildModule(m: any): Promise<HrService> {
  return Test.createTestingModule({
    providers: [
      HrService,
      { provide: getRepositoryToken(HrDesignation), useValue: m.designationRepo },
      { provide: getRepositoryToken(HrEmployee), useValue: m.employeeRepo },
      { provide: getRepositoryToken(HrAttendance), useValue: m.attendanceRepo },
      { provide: getRepositoryToken(HrLeaveRequest), useValue: m.leaveRepo },
      { provide: getRepositoryToken(HrLeaveType), useValue: m.leaveTypeRepo },
      { provide: getRepositoryToken(HrShift), useValue: m.shiftRepo },
      { provide: getRepositoryToken(HrHoliday), useValue: m.holidayRepo },
      { provide: getRepositoryToken(HrShiftRoster), useValue: m.rosterRepo },
      { provide: getRepositoryToken(HrEmployeeSkill), useValue: m.skillRepo },
      { provide: getRepositoryToken(HrEmployeeTraining), useValue: m.trainingRepo },
      { provide: getRepositoryToken(HrEmployeeDocument), useValue: m.docRepo },
      { provide: getRepositoryToken(HrEmployeeHistory), useValue: m.historyRepo },
      { provide: getRepositoryToken(Department), useValue: m.departmentRepo },
      { provide: getRepositoryToken(Division), useValue: m.divisionRepo },
      { provide: getRepositoryToken(Section), useValue: m.sectionRepo },
      { provide: getRepositoryToken(ErpUser), useValue: m.userRepo },
      { provide: BarcodeService, useValue: m.barcodeService },
    ],
  }).compile().then((mod: TestingModule) => mod.get<HrService>(HrService));
}

/** Full happy-path query orchestration for the ASSIGNED roster view. */
function setupAssignedView(m: any, over: Partial<any> = {}) {
  const qbRecords = makeQb({ getRawMany: jest.fn().mockResolvedValue(over.records ?? [ROSTER_ROW]) });
  const qbCount = makeQb({ getCount: jest.fn().mockResolvedValue(over.total ?? 5) });
  const qbRosterRows = makeQb({ getRawOne: jest.fn().mockResolvedValue(over.assigned ?? { c: '4' }) });
  const qbDistinct = makeQb({ getRawOne: jest.fn().mockResolvedValue(over.distinct ?? { c: '3' }) });
  const qbShiftCounts = makeQb({ getRawMany: jest.fn().mockResolvedValue(over.shiftCounts ?? [{ shift_id: 'shift-1', assigned: '4' }]) });
  queues(m.rosterRepo, [qbRecords, qbCount, qbRosterRows, qbDistinct, qbShiftCounts]);
  const qbPeople = makeQb({ getRawOne: jest.fn().mockResolvedValue(over.people ?? { c: '10' }) });
  queues(m.employeeRepo, [qbPeople]);
  m.shiftRepo.find.mockResolvedValue(over.shifts ?? [
    { id: 'shift-1', shiftCode: 'S-1', shiftName: 'S-1 Morning' },
    { id: 'shift-2', shiftCode: 'S-2', shiftName: 'S-2 Evening' },
    { id: 'shift-3', shiftCode: 'S-3', shiftName: 'S-3 Night' },
  ]);
  return { qbRecords, qbCount };
}

describe('HrService Shift Roster', () => {
  let service: HrService;
  let m: ReturnType<typeof repos>;

  beforeEach(async () => {
    jest.clearAllMocks();
    m = repos();
    service = await buildModule(m);
  });

  describe('getShiftRosterOptions', () => {
    it('rejects a user that has no provisioned ERP account (401)', async () => {
      m.userRepo.findOne.mockResolvedValue(null);
      await expect(service.getShiftRosterOptions('auth-x')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an inactive account (403)', async () => {
      m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, status: 'INACTIVE' });
      await expect(service.getShiftRosterOptions('auth-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns a truthful empty payload when the user has no default company', async () => {
      m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, defaultCompanyId: null });
      const data: any = await service.getShiftRosterOptions('auth-1');
      expect(data).toMatchObject({ companyId: null, divisions: [], sections: [], departments: [], shifts: [], employees: [] });
      expect(data.assignmentStatuses).toEqual(['ASSIGNED', 'TENTATIVE']);
      expect(m.employeeRepo.find).not.toHaveBeenCalled();
    });

    it('returns company-scoped options including active employees and assignment statuses', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      m.divisionRepo.find.mockResolvedValue([{ id: 'div-1', divisionCode: 'DIV-A', name: 'Manufacturing' }]);
      m.sectionRepo.find.mockResolvedValue([{ id: 'sec-1', sectionCode: 'SEC-1', name: 'Assembly', divisionId: 'div-1' }]);
      m.departmentRepo.find.mockResolvedValue([{ id: 'dept-1', departmentCode: 'D-1', name: 'Production', divisionId: 'div-1', sectionId: 'sec-1' }]);
      m.shiftRepo.find.mockResolvedValue([{ id: 'shift-1', shiftCode: 'S-1', shiftName: 'S-1 Morning' }]);
      m.employeeRepo.find.mockResolvedValue([{ id: 'emp-ft5', employeeCode: 'EMP-FT5', firstName: 'Phase5b', lastName: 'Test', departmentId: 'dept-1' }]);

      const data: any = await service.getShiftRosterOptions('auth-1');

      expect(m.divisionRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'company-1' } }));
      expect(m.employeeRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-1', isActive: true, status: 'ACTIVE' }) }),
      );
      expect(data.companyId).toBe('company-1');
      expect(data.shifts).toEqual([{ id: 'shift-1', code: 'S-1', name: 'S-1 Morning', startTime: null, endTime: null, workingHours: null }]);
      expect(data.employees).toEqual([{ id: 'emp-ft5', employeeCode: 'EMP-FT5', firstName: 'Phase5b', lastName: 'Test', departmentId: 'dept-1' }]);
      expect(data.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getShiftRoster', () => {
    it('rejects a user that has no provisioned ERP account (401)', async () => {
      m.userRepo.findOne.mockResolvedValue(null);
      await expect(service.getShiftRoster('auth-x')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(m.rosterRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('rejects an inactive account (403)', async () => {
      m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, status: 'INACTIVE' });
      await expect(service.getShiftRoster('auth-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns a truthful empty payload when the user has no default company', async () => {
      m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, defaultCompanyId: null });
      const data: any = await service.getShiftRoster('auth-1');
      expect(data.companyId).toBeNull();
      expect(data.reason).toBe('NO_DEFAULT_COMPANY');
      expect(data.records).toEqual([]);
      expect(data.summary).toMatchObject({ totalEmployees: 0, assigned: 0, unassigned: 0, activeShifts: 0 });
      expect(m.rosterRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it.each([
      ['employeeId', 'employeeRepo'],
      ['departmentId', 'departmentRepo'],
      ['divisionId', 'divisionRepo'],
      ['sectionId', 'sectionRepo'],
      ['shiftId', 'shiftRepo'],
    ])('rejects a %s that does not belong to the user company (400)', async (optKey, repoKey) => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      (m[repoKey] as any).findOne.mockResolvedValue(null);
      await expect(
        service.getShiftRoster('auth-1', { [optKey]: '00000000-0000-0000-0000-000000000000' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(m.rosterRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('always scopes every roster query to the authenticated user default company', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      const { qbRecords } = setupAssignedView(m);
      const data: any = await service.getShiftRoster('auth-1');
      expect(qbRecords.where).toHaveBeenCalledWith('r.companyId = :companyId', { companyId: 'company-1' });
      expect(qbRecords.andWhere).toHaveBeenCalledWith('r.isActive = true');
      expect(qbRecords.andWhere).toHaveBeenCalledWith('r.rosterDate = :rosterDate', { rosterDate: data.rosterDate });
    });

    it('returns real roster records with joined employee/org/shift/attendance detail and derived summary', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      setupAssignedView(m);
      const data: any = await service.getShiftRoster('auth-1');

      expect(data.companyId).toBe('company-1');
      expect(data.reason).toBeNull();
      expect(data.total).toBe(5);
      expect(data.records).toHaveLength(1);
      expect(data.records[0]).toMatchObject({
        id: 'roster-1', rosterDate: '2026-09-14', assignmentStatus: 'ASSIGNED',
        employee: { employeeCode: 'EMP-FT5', firstName: 'Phase5b', lastName: 'Test' },
        shift: { id: 'shift-1', code: 'S-1', name: 'S-1 Morning', startTime: '08:00:00', endTime: '16:00:00' },
        attendance: { id: 'att-1', status: 'PRESENT' },
      });
      expect(data.records[0].employee.department).toEqual({
        id: 'dept-1', name: 'Production',
        division: { id: 'div-1', name: 'Manufacturing Division' },
        section: { id: 'sec-1', name: 'Assembly Line A' },
      });
      expect(data.summary).toMatchObject({
        totalEmployees: 10, assigned: 4, assignedEmployeeCount: 3, unassigned: 7, activeShifts: 3,
        notes: { unassigned: 'DERIVED' },
      });
      expect(data.shiftBreakdown).toEqual([
        { id: 'shift-1', code: 'S-1', name: 'S-1 Morning', assigned: 4 },
        { id: 'shift-2', code: 'S-2', name: 'S-2 Evening', assigned: 0 },
        { id: 'shift-3', code: 'S-3', name: 'S-3 Night', assigned: 0 },
      ]);
    });

    it('shows attendance only where real attendance exists on that date', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      setupAssignedView(m, { records: [{ ...ROSTER_ROW, attendance_id: null, attendance_status: null }] });
      const data: any = await service.getShiftRoster('auth-1');
      expect(data.records[0].attendance).toBeNull();
    });

    it('applies division/section/department/employee/shift/assignment-status/search filters to records and count', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      m.employeeRepo.findOne.mockResolvedValue({ id: 'emp-ft5', companyId: 'company-1' });
      m.departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', companyId: 'company-1' });
      m.divisionRepo.findOne.mockResolvedValue({ id: 'div-1', companyId: 'company-1' });
      m.sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', companyId: 'company-1' });
      m.shiftRepo.findOne.mockResolvedValue({ id: 'shift-1', companyId: 'company-1' });
      const { qbRecords, qbCount } = setupAssignedView(m);

      await service.getShiftRoster('auth-1', {
        employeeId: 'emp-ft5', departmentId: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1',
        shiftId: 'shift-1', assignmentStatus: 'TENTATIVE', search: 'phase',
      });

      expect(qbRecords.andWhere).toHaveBeenCalledWith('r.employeeId = :employeeId', { employeeId: 'emp-ft5' });
      expect(qbRecords.andWhere).toHaveBeenCalledWith('e.departmentId = :departmentId', { departmentId: 'dept-1' });
      expect(qbRecords.andWhere).toHaveBeenCalledWith('d.divisionId = :divisionId', { divisionId: 'div-1' });
      expect(qbRecords.andWhere).toHaveBeenCalledWith('d.sectionId = :sectionId', { sectionId: 'sec-1' });
      expect(qbRecords.andWhere).toHaveBeenCalledWith('r.shiftId = :shiftId', { shiftId: 'shift-1' });
      expect(qbRecords.andWhere).toHaveBeenCalledWith('r.assignmentStatus = :assignmentStatus', { assignmentStatus: 'TENTATIVE' });
      expect(qbRecords.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { s: '%phase%' });
      expect(qbCount.andWhere).toHaveBeenCalledWith('r.shiftId = :shiftId', { shiftId: 'shift-1' });
      expect(qbCount.andWhere).toHaveBeenCalledWith('d.divisionId = :divisionId', { divisionId: 'div-1' });
    });

    it('clamps the limit to 200 and honours explicit page/limit', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      const { qbRecords } = setupAssignedView(m);
      const data: any = await service.getShiftRoster('auth-1', { page: 3, limit: 999 });
      expect(qbRecords.offset).toHaveBeenCalledWith(400);
      expect(qbRecords.limit).toHaveBeenCalledWith(200);
      expect(data.page).toBe(3);
      expect(data.limit).toBe(200);
    });

    it('defaults the roster date to the current server date', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      setupAssignedView(m);
      const data: any = await service.getShiftRoster('auth-1');
      expect(data.rosterDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('UNASSIGNED mode lists active employees without an active roster assignment', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      const qbRecords = makeQb({ getRawMany: jest.fn().mockResolvedValue([UNASSIGNED_ROW]) });
      const qbCount = makeQb({ getCount: jest.fn().mockResolvedValue(2) });
      const qbPeople = makeQb({ getRawOne: jest.fn().mockResolvedValue({ c: '10' }) });
      queues(m.employeeRepo, [qbRecords, qbCount, qbPeople]);
      const qbRosterRows = makeQb({ getRawOne: jest.fn().mockResolvedValue({ c: '2' }) });
      const qbDistinct = makeQb({ getRawOne: jest.fn().mockResolvedValue({ c: '2' }) });
      const qbShiftCounts = makeQb({ getRawMany: jest.fn().mockResolvedValue([{ shift_id: 'shift-1', assigned: '2' }]) });
      queues(m.rosterRepo, [qbRosterRows, qbDistinct, qbShiftCounts]);
      m.shiftRepo.find.mockResolvedValue([{ id: 'shift-1', shiftCode: 'S-1', shiftName: 'S-1 Morning' }]);

      const data: any = await service.getShiftRoster('auth-1', { assignment: 'unassigned' });

      expect(qbRecords.andWhere).toHaveBeenCalledWith('e.isActive = true');
      expect(qbRecords.andWhere).toHaveBeenCalledWith(expect.stringContaining('NOT EXISTS'));
      expect(qbRecords.andWhere).toHaveBeenCalledWith(expect.stringContaining('hr_shift_roster'));
      expect(qbRecords.setParameter).toHaveBeenCalledWith('rosterDateA', data.rosterDate);
      expect(qbRecords.setParameter).toHaveBeenCalledWith('rosterDateB', data.rosterDate);
      expect(data.records).toHaveLength(1);
      expect(data.records[0]).toMatchObject({
        id: null, rosterDate: null, assignmentStatus: null, shift: null,
        employee: { employeeCode: 'EMP-FT6' },
      });
      expect(data.summary).toMatchObject({ totalEmployees: 10, assigned: 2, unassigned: 8 });
    });

    it('returns a truthful empty roster when no records match', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      setupAssignedView(m, { records: [], total: 0, assigned: { c: '0' }, distinct: { c: '0' }, shiftCounts: [], people: { c: '10' } });
      const data: any = await service.getShiftRoster('auth-1');
      expect(data.total).toBe(0);
      expect(data.records).toEqual([]);
      expect(data.summary).toMatchObject({ assigned: 0, unassigned: 10, activeShifts: 3 });
    });
  });

  describe('getShiftRosterById', () => {
    it('returns a single mapped roster record for a real id', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      const qb = makeQb({ getRawOne: jest.fn().mockResolvedValue(ROSTER_ROW) });
      queues(m.rosterRepo, [qb]);
      const data: any = await service.getShiftRosterById('auth-1', 'roster-1');
      expect(qb.where).toHaveBeenCalledWith('r.id = :id', { id: 'roster-1' });
      expect(data.id).toBe('roster-1');
      expect(data.shift.code).toBe('S-1');
    });

    it('throws 404 when the record does not exist or is soft-deleted', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      const qb = makeQb({ getRawOne: jest.fn().mockResolvedValue(undefined) });
      queues(m.rosterRepo, [qb]);
      await expect(service.getShiftRosterById('auth-1', 'roster-x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createShiftRoster', () => {
    it('rejects a user that has no provisioned ERP account (401)', async () => {
      m.userRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createShiftRoster('auth-x', { employeeId: 'emp-ft5', shiftId: 'shift-1', rosterDate: '2026-09-14' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects a user with no default company (400)', async () => {
      m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, defaultCompanyId: null });
      await expect(
        service.createShiftRoster('auth-1', { employeeId: 'emp-ft5', shiftId: 'shift-1', rosterDate: '2026-09-14' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects assigning an inactive employee (400)', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      m.employeeRepo.findOne.mockResolvedValue({ id: 'emp-ft5', companyId: 'company-1', status: 'INACTIVE', isActive: false });
      await expect(
        service.createShiftRoster('auth-1', { employeeId: 'emp-ft5', shiftId: 'shift-1', rosterDate: '2026-09-14' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(m.rosterRepo.findOne).not.toHaveBeenCalled();
    });

    it('rejects a shift that does not exist in the company (400)', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      m.employeeRepo.findOne.mockResolvedValue({ id: 'emp-ft5', companyId: 'company-1', status: 'ACTIVE', isActive: true });
      m.shiftRepo.findOne.mockResolvedValue(null);
      await expect(
        service.createShiftRoster('auth-1', { employeeId: 'emp-ft5', shiftId: 'shift-1', rosterDate: '2026-09-14' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an active duplicate for the same employee/shift/date (400)', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      m.employeeRepo.findOne.mockResolvedValue({ id: 'emp-ft5', companyId: 'company-1', status: 'ACTIVE', isActive: true });
      m.shiftRepo.findOne.mockResolvedValue({ id: 'shift-1', companyId: 'company-1' });
      m.rosterRepo.findOne.mockResolvedValue({ id: 'roster-1', isActive: true });
      await expect(
        service.createShiftRoster('auth-1', { employeeId: 'emp-ft5', shiftId: 'shift-1', rosterDate: '2026-09-14' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(m.rosterRepo.save).not.toHaveBeenCalled();
    });

    it('reactivates a soft-deleted duplicate instead of duplicating it', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      m.employeeRepo.findOne.mockResolvedValue({ id: 'emp-ft5', companyId: 'company-1', status: 'ACTIVE', isActive: true });
      m.shiftRepo.findOne.mockResolvedValue({ id: 'shift-1', companyId: 'company-1' });
      const existing = { id: 'roster-1', isActive: false, assignmentStatus: 'ASSIGNED', remarks: 'old' };
      m.rosterRepo.findOne.mockResolvedValue(existing);
      m.rosterRepo.save.mockResolvedValue(existing);
      await service.createShiftRoster('auth-1', { employeeId: 'emp-ft5', shiftId: 'shift-1', rosterDate: '2026-09-14', remarks: 'new' });
      expect(existing.isActive).toBe(true);
      expect(existing.remarks).toBe('new');
      expect(m.rosterRepo.create).not.toHaveBeenCalled();
      expect(m.rosterRepo.save).toHaveBeenCalledWith(existing);
    });

    it('creates an assignment scoped to the authenticated company and user', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      m.employeeRepo.findOne.mockResolvedValue({ id: 'emp-ft5', companyId: 'company-1', status: 'ACTIVE', isActive: true });
      m.shiftRepo.findOne.mockResolvedValue({ id: 'shift-1', companyId: 'company-1' });
      m.rosterRepo.findOne.mockResolvedValue(null);
      const created = { id: 'roster-new' };
      m.rosterRepo.create.mockReturnValue(created);
      m.rosterRepo.save.mockResolvedValue(created);

      const result: any = await service.createShiftRoster('auth-1', {
        employeeId: 'emp-ft5', shiftId: 'shift-1', rosterDate: '2026-09-14',
        assignmentStatus: 'TENTATIVE', remarks: 'standby',
      });

      expect(m.rosterRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        companyId: 'company-1', employeeId: 'emp-ft5', shiftId: 'shift-1',
        assignmentStatus: 'TENTATIVE', remarks: 'standby', createdBy: 'user-1', isActive: true,
      }));
      expect(result.id).toBe('roster-new');
    });
  });

  describe('updateShiftRoster', () => {
    it('throws 404 when the assignment does not exist or is soft-deleted', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      m.rosterRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateShiftRoster('auth-1', 'roster-x', { remarks: 'nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects moving the assignment onto an active duplicate (400)', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      m.employeeRepo.findOne.mockResolvedValue({ id: 'emp-ft5', companyId: 'company-1', status: 'ACTIVE', isActive: true });
      m.shiftRepo.findOne.mockResolvedValue({ id: 'shift-2', companyId: 'company-1' });
      m.rosterRepo.findOne
        .mockResolvedValueOnce({ id: 'roster-1', companyId: 'company-1', isActive: true, employeeId: 'emp-ft5', shiftId: 'shift-1', rosterDate: new Date('2026-09-14') })
        .mockResolvedValueOnce({ id: 'roster-2', isActive: true });
      await expect(
        service.updateShiftRoster('auth-1', 'roster-1', { shiftId: 'shift-2' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates allowed fields and persists the change', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      m.employeeRepo.findOne.mockResolvedValue({ id: 'emp-ft6', companyId: 'company-1', status: 'ACTIVE', isActive: true });
      const rec: any = { id: 'roster-1', companyId: 'company-1', isActive: true, employeeId: 'emp-ft5', shiftId: 'shift-1', rosterDate: new Date('2026-09-14'), remarks: null };
      m.rosterRepo.findOne
        .mockResolvedValueOnce(rec)
        .mockResolvedValueOnce(null);
      m.rosterRepo.save.mockResolvedValue(rec);

      const result: any = await service.updateShiftRoster('auth-1', 'roster-1', { employeeId: 'emp-ft6', assignmentStatus: 'TENTATIVE', remarks: 'rotated' });

      expect(rec.employeeId).toBe('emp-ft6');
      expect(rec.assignmentStatus).toBe('TENTATIVE');
      expect(rec.remarks).toBe('rotated');
      expect(rec.updatedBy).toBe('user-1');
      expect(m.rosterRepo.save).toHaveBeenCalledWith(rec);
      expect(result.id).toBe('roster-1');
    });
  });

  describe('softDeleteShiftRoster', () => {
    it('throws 404 when the assignment does not exist or is already soft-deleted', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      m.rosterRepo.findOne.mockResolvedValue(null);
      await expect(service.softDeleteShiftRoster('auth-1', 'roster-x')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('soft-deletes the assignment for the authenticated company', async () => {
      m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
      const rec: any = { id: 'roster-1', companyId: 'company-1', isActive: true };
      m.rosterRepo.findOne.mockResolvedValue(rec);
      m.rosterRepo.save.mockResolvedValue(rec);
      const result: any = await service.softDeleteShiftRoster('auth-1', 'roster-1');
      expect(rec.isActive).toBe(false);
      expect(rec.updatedBy).toBe('user-1');
      expect(m.rosterRepo.save).toHaveBeenCalledWith(rec);
      expect(result.isActive).toBe(false);
    });
  });
});