import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { HrService } from './hr.service';
import { HrDesignation } from '../entities/hr-designation.entity';
import { HrEmployee } from '../entities/hr-employee.entity';
import { HrAttendance } from '../entities/hr-attendance.entity';
import { HrLeaveRequest } from '../entities/hr-leave-request.entity';
import { HrLeaveType } from '../entities/hr-leave-type.entity';
import { HrShift } from '../entities/hr-shift.entity';
import { HrHoliday } from '../entities/hr-holiday.entity';
import { HrEmployeeSkill } from '../entities/hr-employee-skill.entity';
import { HrEmployeeTraining } from '../entities/hr-employee-training.entity';
import { HrEmployeeDocument } from '../entities/hr-employee-document.entity';
import { HrEmployeeHistory } from '../entities/hr-employee-history.entity';
import { HrShiftRoster } from '../entities/hr-shift-roster.entity';
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
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getRawOne: jest.fn().mockResolvedValue(undefined),
    getCount: jest.fn().mockResolvedValue(0),
  };
  Object.assign(qb, overrides);
  return qb;
}

const USER_FIXTURE: any = {
  id: 'user-1',
  authUserId: 'auth-1',
  employeeId: null,
  defaultCompanyId: 'company-1',
  status: 'ACTIVE',
};

const REG_ROW: any = {
  id: 'att-1',
  attendance_date: '2026-08-30',
  status: 'PRESENT',
  shift_id: null,
  check_in: null,
  check_out: null,
  overtime_minutes: 0,
  remarks: null,
  employee_id: 'emp-ft5',
  employee_code: 'EMP-FT5',
  first_name: 'Phase5b',
  last_name: 'Test',
  email: null,
  job_title: 'Operator',
  employment_type: 'FULL_TIME',
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
  shift_code: null,
  shift_name: null,
  shift_start_time: null,
  shift_end_time: null,
  late_minutes: null,
};

function repos(): any {
  return {
    designationRepo: {},
    employeeRepo: { findOne: jest.fn(), find: jest.fn() },
    attendanceRepo: { createQueryBuilder: jest.fn() },
    leaveRepo: {},
    leaveTypeRepo: {},
    shiftRepo: { findOne: jest.fn(), find: jest.fn() },
    holidayRepo: {},
    skillRepo: {},
    trainingRepo: {},
    docRepo: {},
    historyRepo: {},
    rosterRepo: { createQueryBuilder: jest.fn(), findOne: jest.fn(), find: jest.fn(), save: jest.fn(), create: jest.fn() },
    departmentRepo: { findOne: jest.fn(), find: jest.fn() },
    divisionRepo: { findOne: jest.fn(), find: jest.fn() },
    sectionRepo: { findOne: jest.fn(), find: jest.fn() },
    userRepo: { findOne: jest.fn() },
    barcodeService: {},
  };
}

describe('HrService.getAttendanceRegister', () => {
  let service: HrService;
  let m: ReturnType<typeof repos>;

  beforeEach(async () => {
    jest.clearAllMocks();
    m = repos();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HrService,
        { provide: getRepositoryToken(HrDesignation), useValue: m.designationRepo },
        { provide: getRepositoryToken(HrEmployee), useValue: m.employeeRepo },
        { provide: getRepositoryToken(HrAttendance), useValue: m.attendanceRepo },
        { provide: getRepositoryToken(HrLeaveRequest), useValue: m.leaveRepo },
        { provide: getRepositoryToken(HrLeaveType), useValue: m.leaveTypeRepo },
        { provide: getRepositoryToken(HrShift), useValue: m.shiftRepo },
        { provide: getRepositoryToken(HrHoliday), useValue: m.holidayRepo },
        { provide: getRepositoryToken(HrEmployeeSkill), useValue: m.skillRepo },
        { provide: getRepositoryToken(HrEmployeeTraining), useValue: m.trainingRepo },
        { provide: getRepositoryToken(HrEmployeeDocument), useValue: m.docRepo },
        { provide: getRepositoryToken(HrEmployeeHistory), useValue: m.historyRepo },
        { provide: getRepositoryToken(HrShiftRoster), useValue: m.rosterRepo },
        { provide: getRepositoryToken(Department), useValue: m.departmentRepo },
        { provide: getRepositoryToken(Division), useValue: m.divisionRepo },
        { provide: getRepositoryToken(Section), useValue: m.sectionRepo },
        { provide: getRepositoryToken(ErpUser), useValue: m.userRepo },
        { provide: BarcodeService, useValue: m.barcodeService },
      ],
    }).compile();
    service = module.get<HrService>(HrService);
  });

  const threeQbs = (over: { records?: Partial<any>; count?: Partial<any>; summary?: Partial<any> } = {}) => {
    const qbRecords = makeQb(over.records);
    const qbCount = makeQb(over.count);
    const qbSummary = makeQb({ getRawOne: jest.fn().mockResolvedValue(undefined), ...(over.summary ?? {}) });
    m.attendanceRepo.createQueryBuilder
      .mockReturnValueOnce(qbRecords)
      .mockReturnValueOnce(qbCount)
      .mockReturnValueOnce(qbSummary);
    return { qbRecords, qbCount, qbSummary };
  };

  it('rejects a user that has no provisioned ERP account (401)', async () => {
    m.userRepo.findOne.mockResolvedValue(null);
    await expect(service.getAttendanceRegister('auth-unknown')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(m.attendanceRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('rejects an inactive account (403)', async () => {
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, status: 'INACTIVE' });
    await expect(service.getAttendanceRegister('auth-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(m.attendanceRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns a truthful empty register when the user has no default company', async () => {
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, defaultCompanyId: null });
    const data = await service.getAttendanceRegister('auth-1', { from: '2026-09-01', to: '2026-09-30' });
    expect(data.companyId).toBeNull();
    expect(data.reason).toBe('NO_DEFAULT_COMPANY');
    expect(data.records).toEqual([]);
    expect(data.summary.total).toBe(0);
    expect(data.range).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(m.attendanceRepo.createQueryBuilder).not.toHaveBeenCalled();
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
      service.getAttendanceRegister('auth-1', { from: '2026-09-01', to: '2026-09-30', [optKey]: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(m[repoKey].findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-1' }) }),
    );
    expect(m.attendanceRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('always scopes every register query to the authenticated user default company', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    const { qbRecords } = threeQbs({
      count: { getCount: jest.fn().mockResolvedValue(0) },
    });
    await service.getAttendanceRegister('auth-1', { from: '2026-09-01', to: '2026-09-30' });
    expect(qbRecords.where).toHaveBeenCalledWith('a.companyId = :companyId', { companyId: 'company-1' });
    expect(qbRecords.andWhere).toHaveBeenCalledWith('a.attendanceDate BETWEEN :from AND :to', { from: '2026-09-01', to: '2026-09-30' });
  });

  it('returns company-wide records with joined employee/org/shift detail and derived late', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    const { qbRecords, qbCount, qbSummary } = threeQbs({
      records: { getRawMany: jest.fn().mockResolvedValue([{ ...REG_ROW, late_minutes: 7 }]) },
      count: { getCount: jest.fn().mockResolvedValue(5) },
      summary: {
        getRawOne: jest.fn().mockResolvedValue({
          total: '5', present: '4', absent: '0', on_leave: '0', half_day: '0', holiday: '1', weekend: '0',
          employees_covered: '2', late: '1',
        }),
      },
    });

    const data: any = await service.getAttendanceRegister('auth-1', { from: '2026-08-01', to: '2026-08-31' });

    expect(qbRecords.offset).toHaveBeenCalledWith(0);
    expect(qbRecords.limit).toHaveBeenCalledWith(50);
    expect(data.companyId).toBe('company-1');
    expect(data.reason).toBeNull();
    expect(data.total).toBe(5);
    expect(data.records).toHaveLength(1);
    expect(data.records[0]).toMatchObject({
      id: 'att-1', date: '2026-08-30', status: 'PRESENT', lateMinutes: 7, late: true, overtimeMinutes: 0,
      employee: {
        employeeCode: 'EMP-FT5',
        firstName: 'Phase5b',
        lastName: 'Test',
        designation: { code: 'D-006', name: 'Machine Operator' },
        department: {
          name: 'Production',
          division: { id: 'div-1', name: 'Manufacturing Division' },
          section: { id: 'sec-1', name: 'Assembly Line A' },
        },
      },
    });
    expect(data.summary).toMatchObject({
      total: 5, present: 4, late: 1, holiday: 1, employeesCovered: 2, notes: { late: 'DERIVED' },
    });
  });

  it('applies division/section/department/employee/shift/status/search filters consistently to records, count and summary', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue({ id: 'emp-ft5', companyId: 'company-1' });
    m.departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', companyId: 'company-1' });
    m.divisionRepo.findOne.mockResolvedValue({ id: 'div-1', companyId: 'company-1' });
    m.sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', companyId: 'company-1' });
    m.shiftRepo.findOne.mockResolvedValue({ id: 'shift-1', companyId: 'company-1' });

    const { qbRecords, qbCount, qbSummary } = threeQbs({ count: { getCount: jest.fn().mockResolvedValue(0) } });

    await service.getAttendanceRegister('auth-1', {
      from: '2026-08-01', to: '2026-08-31',
      employeeId: 'emp-ft5', departmentId: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1',
      shiftId: 'shift-1', status: 'PRESENT', search: 'phase',
    });

    expect(qbRecords.andWhere).toHaveBeenCalledWith('a.employeeId = :employeeId', { employeeId: 'emp-ft5' });
    expect(qbRecords.andWhere).toHaveBeenCalledWith('e.departmentId = :departmentId', { departmentId: 'dept-1' });
    expect(qbRecords.andWhere).toHaveBeenCalledWith('d.divisionId = :divisionId', { divisionId: 'div-1' });
    expect(qbRecords.andWhere).toHaveBeenCalledWith('d.sectionId = :sectionId', { sectionId: 'sec-1' });
    expect(qbRecords.andWhere).toHaveBeenCalledWith('a.shiftId = :shiftId', { shiftId: 'shift-1' });
    expect(qbRecords.andWhere).toHaveBeenCalledWith('a.status = :status', { status: 'PRESENT' });
    expect(qbRecords.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('ILIKE'),
      { s: '%phase%' },
    );
    expect(qbCount.andWhere).toHaveBeenCalledWith('a.employeeId = :employeeId', { employeeId: 'emp-ft5' });
    expect(qbCount.andWhere).toHaveBeenCalledWith('d.divisionId = :divisionId', { divisionId: 'div-1' });
    expect(qbSummary.andWhere).toHaveBeenCalledWith('d.sectionId = :sectionId', { sectionId: 'sec-1' });
    expect(qbSummary.andWhere).toHaveBeenCalledWith('a.status = :status', { status: 'PRESENT' });
  });

  it('applies the LATE derived-status filter to records, count and summary (LATE is not stored)', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    const { qbRecords, qbCount, qbSummary } = threeQbs({ count: { getCount: jest.fn().mockResolvedValue(1) } });

    await service.getAttendanceRegister('auth-1', {
      from: '2026-08-01', to: '2026-08-31', status: 'LATE',
    });

    const derived = expect.stringContaining("a.status = 'PRESENT' AND a.checkIn IS NOT NULL AND s.\"start_time\"");
    expect(qbRecords.andWhere).toHaveBeenCalledWith(derived);
    expect(qbCount.andWhere).toHaveBeenCalledWith(derived);
    expect(qbSummary.andWhere).toHaveBeenCalledWith(derived);
    expect(qbRecords.andWhere).not.toHaveBeenCalledWith('a.status = :status', { status: 'LATE' });
  });

  it('keeps the stored-status filter for every status except LATE', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    const { qbRecords } = threeQbs({ count: { getCount: jest.fn().mockResolvedValue(0) } });
    await service.getAttendanceRegister('auth-1', {
      from: '2026-08-01', to: '2026-08-31', status: 'HOLIDAY',
    });
    expect(qbRecords.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('status = \'PRESENT\''));
    expect(qbRecords.andWhere).toHaveBeenCalledWith('a.status = :status', { status: 'HOLIDAY' });
  });

  it('clamps the limit to 500 and honours explicit page/limit', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    const { qbRecords } = threeQbs({ count: { getCount: jest.fn().mockResolvedValue(0) } });
    const data: any = await service.getAttendanceRegister('auth-1', {
      from: '2026-08-01', to: '2026-08-31', page: 2, limit: 999,
    });
    expect(qbRecords.offset).toHaveBeenCalledWith(500);
    expect(qbRecords.limit).toHaveBeenCalledWith(500);
    expect(data.page).toBe(2);
    expect(data.limit).toBe(500);
  });

  it('defaults to the current month range when no from/to is supplied', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    const { qbRecords } = threeQbs({ count: { getCount: jest.fn().mockResolvedValue(0) } });
    const data: any = await service.getAttendanceRegister('auth-1');
    expect(data.range.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(data.range.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(qbRecords.andWhere).toHaveBeenCalledWith(
      'a.attendanceDate BETWEEN :from AND :to',
      { from: data.range.from, to: data.range.to },
    );
  });

  it('rejects an inverted date range with 400', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    await expect(
      service.getAttendanceRegister('auth-1', { from: '2026-10-01', to: '2026-09-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(m.attendanceRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns a truthful empty register when no records match', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    threeQbs();
    const data: any = await service.getAttendanceRegister('auth-1', { from: '2026-09-01', to: '2026-09-30' });
    expect(data.total).toBe(0);
    expect(data.records).toEqual([]);
    expect(data.summary).toMatchObject({ total: 0, present: 0, late: 0, employeesCovered: 0, notes: { late: 'DERIVED' } });
  });

  it('returns company-scoped filter options for the register', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.divisionRepo.find.mockResolvedValue([{ id: 'div-1', divisionCode: 'DIV-A', name: 'Manufacturing' }]);
    m.sectionRepo.find.mockResolvedValue([{ id: 'sec-1', sectionCode: 'SEC-1', name: 'Assembly', divisionId: 'div-1' }]);
    m.departmentRepo.find.mockResolvedValue([{ id: 'dept-1', departmentCode: 'D-1', name: 'Production', divisionId: 'div-1', sectionId: 'sec-1' }]);
    m.shiftRepo.find.mockResolvedValue([{ id: 'shift-1', shiftCode: 'S-1', shiftName: 'Morning' }]);

    const data: any = await service.getAttendanceRegisterOptions('auth-1');

    expect(m.divisionRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'company-1' } }));
    expect(m.sectionRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'company-1' } }));
    expect(m.departmentRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'company-1' } }));
    expect(m.shiftRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'company-1' } }));
    expect(data.companyId).toBe('company-1');
    expect(data.divisions).toEqual([{ id: 'div-1', code: 'DIV-A', name: 'Manufacturing' }]);
    expect(data.sections).toEqual([{ id: 'sec-1', code: 'SEC-1', name: 'Assembly', divisionId: 'div-1' }]);
    expect(data.departments).toEqual([{ id: 'dept-1', code: 'D-1', name: 'Production', divisionId: 'div-1', sectionId: 'sec-1' }]);
    expect(data.shifts).toEqual([{ id: 'shift-1', code: 'S-1', name: 'Morning' }]);
    expect(data.statuses).toEqual(['PRESENT', 'ABSENT', 'LEAVE', 'HALF_DAY', 'HOLIDAY', 'WEEKEND', 'LATE']);
  });

  it('returns an empty options payload when the user has no default company', async () => {
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, defaultCompanyId: null });
    const data: any = await service.getAttendanceRegisterOptions('auth-1');
    expect(data).toMatchObject({ companyId: null, divisions: [], sections: [], departments: [], shifts: [] });
    expect(m.divisionRepo.find).not.toHaveBeenCalled();
  });
});