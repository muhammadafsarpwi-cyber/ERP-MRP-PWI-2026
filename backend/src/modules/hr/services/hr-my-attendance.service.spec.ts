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
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
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
  employeeId: 'EMP-FT5',
  defaultCompanyId: 'company-1',
  status: 'ACTIVE',
};

const EMPLOYEE_FIXTURE: any = {
  id: 'emp-ft5',
  companyId: 'company-1',
  employeeCode: 'EMP-FT5',
  firstName: 'Phase5b',
  lastName: 'Test',
  email: null,
  jobTitle: 'Operator',
  employmentType: 'FULL_TIME',
  joinDate: new Date('2026-01-01T00:00:00.000Z'),
  status: 'ACTIVE',
  departmentId: null,
  designation: { id: 'des-1', designationCode: 'D-006', designationName: 'Machine Operator' },
};

const ATT_ROW: any = {
  id: 'att-1',
  attendance_date: '2026-08-30',
  status: 'PRESENT',
  shift_id: null,
  check_in: null,
  check_out: null,
  overtime_minutes: 0,
  remarks: null,
  shift_code: null,
  shift_name: null,
  shift_start_time: null,
  shift_end_time: null,
};

function repos(): any {
  return {
    designationRepo: {},
    employeeRepo: { findOne: jest.fn() },
    attendanceRepo: { createQueryBuilder: jest.fn() },
    leaveRepo: {},
    leaveTypeRepo: {},
    shiftRepo: {},
    holidayRepo: {},
    skillRepo: {},
    trainingRepo: {},
    docRepo: {},
    historyRepo: {},
    rosterRepo: {},
    departmentRepo: { findOne: jest.fn() },
    divisionRepo: { findOne: jest.fn(), find: jest.fn() },
    sectionRepo: { findOne: jest.fn(), find: jest.fn() },
    userRepo: { findOne: jest.fn() },
    barcodeService: {},
  };
}

describe('HrService.getMyAttendance', () => {
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

  it('rejects a user that has no provisioned ERP account (401)', async () => {
    m.userRepo.findOne.mockResolvedValue(null);
    await expect(service.getMyAttendance('auth-unknown')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(m.attendanceRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('rejects an inactive account (403)', async () => {
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, status: 'INACTIVE' });
    await expect(service.getMyAttendance('auth-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(m.attendanceRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns a truthful empty payload when the account has no employee linkage (NO fake data)', async () => {
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, employeeId: null });
    const data = await service.getMyAttendance('auth-1', { from: '2026-09-01', to: '2026-09-30' });
    expect(data.linked).toBe(false);
    expect(data.reason).toBe('ACCOUNT_NOT_LINKED');
    expect(data.employee).toBeNull();
    expect(data.today).toBeNull();
    expect(data.summary.total).toBe(0);
    expect(data.records).toEqual([]);
    expect(m.employeeRepo.findOne).not.toHaveBeenCalled();
    expect(m.attendanceRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('reports NO_DEFAULT_COMPANY when the user has no default company', async () => {
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, defaultCompanyId: null });
    const data = await service.getMyAttendance('auth-1');
    expect(data.reason).toBe('NO_DEFAULT_COMPANY');
    expect(data.employee).toBeNull();
    expect(m.attendanceRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns EMPLOYEE_NOT_FOUND when the linked employee code does not exist in the user company', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue(null);
    const data = await service.getMyAttendance('auth-1', { from: '2026-09-01', to: '2026-09-30' });
    expect(data.linked).toBe(true);
    expect(data.reason).toBe('EMPLOYEE_NOT_FOUND');
    expect(data.employee).toBeNull();
    expect(data.summary.total).toBe(0);
    expect(data.records).toEqual([]);
    expect(m.attendanceRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('resolves the employee ONLY from the authenticated user (company scoped), then returns real records', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue(EMPLOYEE_FIXTURE);

    const qbRecords = makeQb({ getRawMany: jest.fn().mockResolvedValue([ATT_ROW]) });
    const qbCount = makeQb({ getCount: jest.fn().mockResolvedValue(1) });
    const qbSummary = makeQb({
      getRawOne: jest.fn().mockResolvedValue({ total: '1', present: '1', absent: '0', on_leave: '0', half_day: '0', holiday: '0', weekend: '0', late: '0' }),
    });
    const qbToday = makeQb({ getRawMany: jest.fn().mockResolvedValue([ATT_ROW]) });
    m.attendanceRepo.createQueryBuilder
      .mockReturnValueOnce(qbRecords)
      .mockReturnValueOnce(qbCount)
      .mockReturnValueOnce(qbSummary)
      .mockReturnValueOnce(qbToday);

    const data: any = await service.getMyAttendance('auth-1', { from: '2026-09-01', to: '2026-09-30' });

    expect(m.employeeRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeCode: 'EMP-FT5', companyId: 'company-1' } }),
    );
    expect(data.employee.employeeCode).toBe('EMP-FT5');
    expect(data.employee.designation.designationName).toBe('Machine Operator');
    expect(data.employee.department).toBeNull();
    expect(data.range).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(data.summary).toMatchObject({ total: 1, present: 1, absent: 0, late: 0, notes: { late: 'DERIVED' } });
    expect(data.total).toBe(1);
    expect(data.records).toHaveLength(1);
    expect(data.records[0]).toMatchObject({ id: 'att-1', date: '2026-08-30', status: 'PRESENT', overtimeMinutes: 0 });
    expect(data.today).toMatchObject({ id: 'att-1', status: 'PRESENT' });
  });

  it('always scopes every attendance query to the resolved employee + company (no cross-employee leak possible)', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue(EMPLOYEE_FIXTURE);
    const qbRecords = makeQb({ getRawMany: jest.fn().mockResolvedValue([]) });
    const qbCount = makeQb({ getCount: jest.fn().mockResolvedValue(0) });
    const qbSummary = makeQb({ getRawOne: jest.fn().mockResolvedValue(undefined) });
    const qbToday = makeQb({ getRawMany: jest.fn().mockResolvedValue([]) });
    m.attendanceRepo.createQueryBuilder
      .mockReturnValueOnce(qbRecords)
      .mockReturnValueOnce(qbCount)
      .mockReturnValueOnce(qbSummary)
      .mockReturnValueOnce(qbToday);

    await service.getMyAttendance('auth-1', { from: '2026-09-01', to: '2026-09-30' });

    expect(qbRecords.where).toHaveBeenCalledWith('a.companyId = :companyId', { companyId: 'company-1' });
    expect(qbRecords.andWhere).toHaveBeenCalledWith('a.employeeId = :employeeId', { employeeId: 'emp-ft5' });
    expect(qbRecords.andWhere).toHaveBeenCalledWith('a.attendanceDate BETWEEN :from AND :to', { from: '2026-09-01', to: '2026-09-30' });
  });

  it('applies status and shift filters to the history query', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue(EMPLOYEE_FIXTURE);
    const qbRecords = makeQb({ getRawMany: jest.fn().mockResolvedValue([]) });
    const qbCount = makeQb({ getCount: jest.fn().mockResolvedValue(0) });
    const qbSummary = makeQb({ getRawOne: jest.fn().mockResolvedValue(undefined) });
    const qbToday = makeQb({ getRawMany: jest.fn().mockResolvedValue([]) });
    m.attendanceRepo.createQueryBuilder
      .mockReturnValueOnce(qbRecords)
      .mockReturnValueOnce(qbCount)
      .mockReturnValueOnce(qbSummary)
      .mockReturnValueOnce(qbToday);

    await service.getMyAttendance('auth-1', {
      from: '2026-09-01', to: '2026-09-30', status: 'PRESENT', shiftId: 'shift-1',
    });

    expect(qbRecords.andWhere).toHaveBeenCalledWith('a.status = :status', { status: 'PRESENT' });
    expect(qbRecords.andWhere).toHaveBeenCalledWith('a.shiftId = :shiftId', { shiftId: 'shift-1' });
    expect(qbCount.andWhere).toHaveBeenCalledWith('a.status = :status', { status: 'PRESENT' });
    expect(qbCount.andWhere).toHaveBeenCalledWith('a.shiftId = :shiftId', { shiftId: 'shift-1' });
  });

  it('resolves department + division + section through department relations without N+1 loops', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue({ ...EMPLOYEE_FIXTURE, departmentId: 'dept-1' });
    m.departmentRepo.findOne.mockResolvedValue({
      id: 'dept-1', name: 'Production',
      division: { id: 'div-1', name: 'Manufacturing Division' },
      section: { id: 'sec-1', name: 'Assembly Line A' },
    });
    for (let i = 0; i < 4; i++) {
      m.attendanceRepo.createQueryBuilder.mockReturnValueOnce(makeQb());
    }

    const data: any = await service.getMyAttendance('auth-1', { from: '2026-09-01', to: '2026-09-30' });
    expect(m.departmentRepo.findOne).toHaveBeenCalledTimes(1);
    expect(data.employee.department).toMatchObject({
      id: 'dept-1', name: 'Production',
      division: { id: 'div-1', name: 'Manufacturing Division' },
      section: { id: 'sec-1', name: 'Assembly Line A' },
    });
  });

  it('defaults to the current month range when no from/to is supplied', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue(EMPLOYEE_FIXTURE);
    for (let i = 0; i < 4; i++) {
      m.attendanceRepo.createQueryBuilder.mockReturnValueOnce(makeQb());
    }
    const data = await service.getMyAttendance('auth-1');
    expect(data.range.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(data.range.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects an inverted date range with 400', async () => {
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue(EMPLOYEE_FIXTURE);
    await expect(
      service.getMyAttendance('auth-1', { from: '2026-10-01', to: '2026-09-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});