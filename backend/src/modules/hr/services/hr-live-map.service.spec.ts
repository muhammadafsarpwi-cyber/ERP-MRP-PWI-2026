import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { HrService, classifyLocationStatus } from './hr.service';
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
  employeeId: null,
  defaultCompanyId: 'company-1',
  status: 'ACTIVE',
};

const EMP_ROWS = [
  {
    employee_id: 'emp-1',
    employee_code: 'EMP-001',
    first_name: 'Ahmed',
    last_name: 'Raza',
    job_title: null,
    employee_status: 'ACTIVE',
    designation_id: 'des-1',
    designation_code: 'D-002',
    designation_name: 'Production Manager',
    department_id: null,
    department_name: null,
    division_id: null,
    division_name: null,
    section_id: null,
    section_name: null,
  },
  {
    employee_id: 'emp-2',
    employee_code: 'EMP-002',
    first_name: 'Fatima',
    last_name: 'Khan',
    job_title: null,
    employee_status: 'ACTIVE',
    designation_id: null,
    designation_code: null,
    designation_name: null,
    department_id: 'dept-1',
    department_name: 'Production',
    division_id: 'div-1',
    division_name: 'Manufacturing Division',
    section_id: 'sec-1',
    section_name: 'Assembly Line A',
  },
];

const ATT_ROW: any = {
  employee_id: 'emp-1',
  status: 'PRESENT',
  check_in: new Date().toISOString(),
  check_out: null,
  shift_id: 'shift-1',
  shift_code: 'S-1',
  shift_name: 'Morning',
  shift_start_time: '08:00:00',
  shift_end_time: '16:00:00',
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
    rosterRepo: { query: jest.fn() },
    departmentRepo: { findOne: jest.fn(), find: jest.fn() },
    divisionRepo: { findOne: jest.fn(), find: jest.fn() },
    sectionRepo: { findOne: jest.fn(), find: jest.fn() },
    userRepo: { findOne: jest.fn() },
    barcodeService: {},
  };
}

async function setup(): Promise<{ service: HrService; m: ReturnType<typeof repos> }> {
  jest.clearAllMocks();
  const m = repos();
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
  return { service: module.get<HrService>(HrService), m };
}

function wireHappyPath(m: ReturnType<typeof repos>, attRows: any[] = [ATT_ROW], rosterRows: any[] = []) {
  m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
  m.shiftRepo.findOne.mockResolvedValue({ id: 'shift-1', companyId: 'company-1' });
  const empQb = makeQb({ getRawMany: jest.fn().mockResolvedValue(EMP_ROWS) });
  m.employeeRepo.createQueryBuilder.mockReturnValue(empQb);
  const attQb = makeQb({ getRawMany: jest.fn().mockResolvedValue(attRows) });
  m.attendanceRepo.createQueryBuilder.mockReturnValue(attQb);
  m.rosterRepo.query.mockResolvedValue(rosterRows);
}

describe('classifyLocationStatus (live/recent/stale/no-location)', () => {
  it('returns NO_LOCATION when there is no last-updated timestamp', () => {
    expect(classifyLocationStatus(null, '2026-09-14T10:00:00.000Z')).toBe('NO_LOCATION');
    expect(classifyLocationStatus(undefined, '2026-09-14T10:00:00.000Z')).toBe('NO_LOCATION');
    expect(classifyLocationStatus('not-a-date', '2026-09-14T10:00:00.000Z')).toBe('NO_LOCATION');
  });

  it('returns LIVE within the 5-minute threshold', () => {
    const now = '2026-09-14T10:00:00.000Z';
    expect(classifyLocationStatus('2026-09-14T09:59:00.000Z', now)).toBe('LIVE');
    expect(classifyLocationStatus('2026-09-14T09:55:00.000Z', now)).toBe('LIVE');
  });

  it('returns RECENT within the 30-minute threshold', () => {
    const now = '2026-09-14T10:00:00.000Z';
    expect(classifyLocationStatus('2026-09-14T09:40:00.000Z', now)).toBe('RECENT');
    expect(classifyLocationStatus('2026-09-14T09:31:00.000Z', now)).toBe('RECENT');
  });

  it('returns STALE after the 30-minute threshold', () => {
    const now = '2026-09-14T10:00:00.000Z';
    expect(classifyLocationStatus('2026-09-14T09:29:00.000Z', now)).toBe('STALE');
    expect(classifyLocationStatus('2026-09-14T08:00:00.000Z', now)).toBe('STALE');
  });
});

describe('HrService.getLiveMap', () => {
  it('rejects a user with no provisioned ERP account (401)', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(null);
    await expect(service.getLiveMap('auth-1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an inactive user account (403)', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, status: 'INACTIVE' });
    await expect(service.getLiveMap('auth-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a truthful empty base when the user has no default company', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, defaultCompanyId: null });
    const data = await service.getLiveMap('auth-1');
    expect(data.reason).toBe('NO_DEFAULT_COMPANY');
    expect(data.summary).toEqual(expect.objectContaining({
      location: { live: 0, recent: 0, stale: 0, noLocation: 0 },
      presence: expect.objectContaining({ presentNow: 0, noRecord: 0 }),
    }));
    expect(data.employees).toEqual([]);
  });

  it('rejects a filter id that does not belong to the user company (400)', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue(null);
    await expect(service.getLiveMap('auth-1', { employeeId: 'other-emp' })).rejects.toBeInstanceOf(BadRequestException);
    expect(m.employeeRepo.findOne).toHaveBeenCalledWith({ where: { id: 'other-emp', companyId: 'company-1' } });
  });

  it('rejects a shift id from another company (400)', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.shiftRepo.findOne.mockResolvedValue(null);
    await expect(service.getLiveMap('auth-1', { shiftId: 'other-shift' })).rejects.toBeInstanceOf(BadRequestException);
    expect(m.shiftRepo.findOne).toHaveBeenCalledWith({ where: { id: 'other-shift', companyId: 'company-1' } });
  });

  it('scopes the employee query to the user company and truthful NO_LOCATION state', async () => {
    const { service, m } = await setup();
    wireHappyPath(m);
    const data = await service.getLiveMap('auth-1');
    const empQb = m.employeeRepo.createQueryBuilder.mock.results[0].value;
    expect(empQb.where).toHaveBeenCalledWith('e.companyId = :companyId', { companyId: 'company-1' });
    expect(data.companyId).toBe('company-1');
    expect(data.reason).toBeNull();
    expect(data.total).toBe(2);
    // No geo source exists → everyone is NO_LOCATION and live/recent/stale are 0.
    expect(data.summary.location).toEqual({ live: 0, recent: 0, stale: 0, noLocation: 2 });
    for (const e of data.employees) {
      expect(e.location.status).toBe('NO_LOCATION');
      expect(e.location.latitude).toBeNull();
      expect(e.location.longitude).toBeNull();
      expect(e.location.lastUpdated).toBeNull();
      expect(e.location.source).toBeNull();
    }
    expect(data.location.providerConfigured).toBe(false);
  });

  it('derives real presence from today attendance and prefers the attendance shift', async () => {
    const { service, m } = await setup();
    wireHappyPath(m, [ATT_ROW]);
    const data = await service.getLiveMap('auth-1');
    const emp1: any = data.employees.find((e: any) => e.employeeId === 'emp-1');
    expect(emp1.attendance).toEqual(expect.objectContaining({ status: 'PRESENT', presentNow: true }));
    expect(emp1.shift).toEqual(expect.objectContaining({ id: 'shift-1', code: 'S-1', name: 'Morning' }));
    expect(emp1.shiftSource).toBe('attendance');
    expect(data.summary.presence).toEqual(expect.objectContaining({ presentNow: 1, presentToday: 1, noRecord: 1, absent: 0 }));
  });

  it('falls back to the roster planned shift when there is no attendance today', async () => {
    const { service, m } = await setup();
    wireHappyPath(m, [], [{ employee_id: 'emp-2', shift_id: 'shift-2', shift_code: 'S-2', shift_name: 'Evening', shift_start_time: '16:00:00', shift_end_time: '00:00:00' }]);
    const data = await service.getLiveMap('auth-1');
    const emp2: any = data.employees.find((e: any) => e.employeeId === 'emp-2');
    expect(emp2.shift).toEqual(expect.objectContaining({ id: 'shift-2', code: 'S-2', name: 'Evening' }));
    expect(emp2.shiftSource).toBe('roster');
    expect(emp2.attendance).toBeNull();
  });

  it('applies shift and status filters on the merged today data and paginates', async () => {
    const { service, m } = await setup();
    wireHappyPath(m, [ATT_ROW]);
    const byShift = await service.getLiveMap('auth-1', { shiftId: 'shift-1' });
    expect(byShift.total).toBe(1);
    expect(byShift.employees[0].employeeCode).toBe('EMP-001');
    const byStatus = await service.getLiveMap('auth-1', { status: 'ABSENT' });
    expect(byStatus.total).toBe(0);
    expect(byStatus.employees).toEqual([]);
  });

  it('returns the org tree from the employee join', async () => {
    const { service, m } = await setup();
    wireHappyPath(m, []);
    const data = await service.getLiveMap('auth-1');
    const emp2: any = data.employees.find((e: any) => e.employeeId === 'emp-2');
    expect(emp2.department).toEqual(expect.objectContaining({
      name: 'Production',
      division: expect.objectContaining({ name: 'Manufacturing Division' }),
      section: expect.objectContaining({ name: 'Assembly Line A' }),
    }));
    const emp1: any = data.employees.find((e: any) => e.employeeId === 'emp-1');
    expect(emp1.designation).toEqual(expect.objectContaining({ code: 'D-002', name: 'Production Manager' }));
  });
});

describe('HrService.getLiveMapOptions', () => {
  it('rejects an unprovisioned user (401)', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(null);
    await expect(service.getLiveMapOptions('auth-1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns empty options when the user has no default company', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, defaultCompanyId: null });
    const data = await service.getLiveMapOptions('auth-1');
    expect(data).toEqual(expect.objectContaining({
      companyId: null,
      divisions: [],
      shifts: [],
      employees: [],
      attendanceStatuses: expect.arrayContaining(['PRESENT', 'ABSENT']),
    }));
  });

  it('maps company-scoped dropdown metadata', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.divisionRepo.find.mockResolvedValue([{ id: 'div-1', divisionCode: 'DIV-001', name: 'Manufacturing Division' }]);
    m.sectionRepo.find.mockResolvedValue([{ id: 'sec-1', sectionCode: 'SEC-001', name: 'Assembly Line A', divisionId: 'div-1' }]);
    m.departmentRepo.find.mockResolvedValue([{ id: 'dept-1', departmentCode: 'DEPT-001', name: 'Production', divisionId: 'div-1', sectionId: null }]);
    m.shiftRepo.find.mockResolvedValue([{ id: 'shift-1', shiftCode: 'S-1', shiftName: 'Morning', startTime: '08:00:00', endTime: '16:00:00' }]);
    m.employeeRepo.find.mockResolvedValue([{ id: 'emp-1', employeeCode: 'EMP-001', firstName: 'Ahmed', lastName: 'Raza' }]);
    const data = await service.getLiveMapOptions('auth-1');
    expect(m.employeeRepo.find).toHaveBeenCalledWith({
      where: { companyId: 'company-1', isActive: true, status: 'ACTIVE' },
      order: { employeeCode: 'ASC' },
    });
    expect(data.divisions).toEqual([{ id: 'div-1', code: 'DIV-001', name: 'Manufacturing Division' }]);
    expect(data.sections).toEqual([{ id: 'sec-1', code: 'SEC-001', name: 'Assembly Line A', divisionId: 'div-1' }]);
    expect(data.departments).toEqual([{ id: 'dept-1', code: 'DEPT-001', name: 'Production', divisionId: 'div-1', sectionId: null }]);
    expect(data.shifts).toEqual([{ id: 'shift-1', code: 'S-1', name: 'Morning', startTime: '08:00:00', endTime: '16:00:00' }]);
    expect(data.employees).toEqual([{ id: 'emp-1', employeeCode: 'EMP-001', firstName: 'Ahmed', lastName: 'Raza' }]);
  });
});