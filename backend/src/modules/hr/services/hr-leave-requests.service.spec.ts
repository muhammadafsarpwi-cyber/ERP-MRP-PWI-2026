import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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

const LEAVE_ROWS = [
  {
    id: 'lr-1',
    employee_id: 'emp-1',
    leave_type_id: 'lt-1',
    start_date: '2026-09-20',
    end_date: '2026-09-21',
    days: '2',
    reason: 'Family event',
    remarks: null,
    status: 'PENDING',
    employee_code: 'EMP-001',
    first_name: 'Ahmed',
    last_name: 'Raza',
    job_title: null,
    employee_status: 'ACTIVE',
    designation_id: null,
    designation_code: null,
    designation_name: null,
    department_id: 'dept-1',
    department_name: 'Production',
    division_id: 'div-1',
    division_name: 'Manufacturing Division',
    section_id: null,
    section_name: null,
    leave_type_code: 'L-1',
    leave_type_name: 'Casual Leave',
    leave_type_days_per_year: '10',
    leave_type_is_paid: true,
    created_at: '2026-09-14 09:00',
    updated_at: '2026-09-14 09:00',
    approved_at: null,
    created_by_name: 'System Admin',
    updated_by_name: 'System Admin',
    approved_by_name: null,
  },
];

function repos(): any {
  return {
    designationRepo: {},
    employeeRepo: { findOne: jest.fn(), find: jest.fn(), createQueryBuilder: jest.fn() },
    attendanceRepo: { createQueryBuilder: jest.fn() },
    leaveRepo: { findOne: jest.fn(), find: jest.fn(), create: jest.fn(), save: jest.fn(), createQueryBuilder: jest.fn() },
    leaveTypeRepo: { findOne: jest.fn(), find: jest.fn() },
    shiftRepo: { findOne: jest.fn(), find: jest.fn() },
    holidayRepo: {},
    skillRepo: {},
    trainingRepo: {},
    docRepo: {},
    historyRepo: {},
    rosterRepo: {},
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

/** Wires the full list pipeline: rows qb, count qb, summary qb, attendance qb. */
function wireList(m: ReturnType<typeof repos>, statusCounts: any = { pending: '1', approved: '1', rejected: '0', cancelled: '0', total: '2' }) {
  m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
  const rowsQb = makeQb({ getRawMany: jest.fn().mockResolvedValue(LEAVE_ROWS) });
  const countQb = makeQb({ getCount: jest.fn().mockResolvedValue(1) });
  const summaryQb = makeQb({ getRawOne: jest.fn().mockResolvedValue(statusCounts) });
  const attQb = makeQb({ getRawOne: jest.fn().mockResolvedValue({ c: '1' }) });
  m.leaveRepo.createQueryBuilder
    .mockReturnValueOnce(rowsQb)
    .mockReturnValueOnce(countQb)
    .mockReturnValueOnce(summaryQb);
  m.attendanceRepo.createQueryBuilder.mockReturnValue(attQb);
  return { rowsQb, countQb, summaryQb, attQb };
}

describe('HrService.listLeaveRequests', () => {
  it('rejects a user with no provisioned ERP account (401)', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(null);
    await expect(service.listLeaveRequests('auth-1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an inactive user account (403)', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, status: 'INACTIVE' });
    await expect(service.listLeaveRequests('auth-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a truthful empty payload when the user has no default company', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, defaultCompanyId: null });
    const data = await service.listLeaveRequests('auth-1');
    expect(data.reason).toBe('NO_DEFAULT_COMPANY');
    expect(data.summary).toEqual(expect.objectContaining({ pending: 0, approved: 0, rejected: 0, cancelled: 0, onLeaveToday: 0 }));
    expect(data.records).toEqual([]);
    expect(data.total).toBe(0);
  });

  it('rejects a dateFrom after dateTo (400)', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    await expect(service.listLeaveRequests('auth-1', { dateFrom: '2026-09-30', dateTo: '2026-09-01' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an employee filter id that does not belong to the user company (400)', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue(null);
    await expect(service.listLeaveRequests('auth-1', { employeeId: 'other-emp' })).rejects.toBeInstanceOf(BadRequestException);
    expect(m.employeeRepo.findOne).toHaveBeenCalledWith({ where: { id: 'other-emp', companyId: 'company-1' } });
  });

  it('scopes everything to the user company, applies status/search, and returns real KPIs', async () => {
    const { service, m } = await setup();
    const { summaryQb } = wireList(m);
    const data = await service.listLeaveRequests('auth-1', { status: 'PENDING', search: 'Ahmed', page: 1, limit: 10 });
    const rowsQb = m.leaveRepo.createQueryBuilder.mock.results[0].value;
    const countQb = m.leaveRepo.createQueryBuilder.mock.results[1].value;
    expect(rowsQb.where).toHaveBeenCalledWith('l.companyId = :companyId', { companyId: 'company-1' });
    expect(rowsQb.andWhere).toHaveBeenCalledWith('l.status = :status', { status: 'PENDING' });
    expect(rowsQb.andWhere).toHaveBeenCalledWith(
      '(e.firstName ILIKE :s OR e.lastName ILIKE :s OR e.employeeCode ILIKE :s)',
      { s: '%Ahmed%' },
    );
    expect(countQb.getCount).toHaveBeenCalled();
    // The summary scope must NOT collapse to the selected status tab.
    expect(summaryQb.andWhere).not.toHaveBeenCalledWith('l.status = :status', { status: 'PENDING' });
    expect(data.companyId).toBe('company-1');
    expect(data.reason).toBeNull();
    expect(data.total).toBe(1);
    expect(data.summary).toEqual(expect.objectContaining({ pending: 1, approved: 1, onLeaveToday: 1 }));
    expect(data.records).toHaveLength(1);
    const r: any = data.records[0];
    expect(r.status).toBe('PENDING');
    expect(r.startDate).toBe('2026-09-20');
    expect(r.endDate).toBe('2026-09-21');
    expect(r.days).toBe(2);
    expect(r.employee).toEqual(expect.objectContaining({ employeeCode: 'EMP-001', firstName: 'Ahmed' }));
    expect(r.employee.department).toEqual(expect.objectContaining({ name: 'Production' }));
    expect(r.leaveType).toEqual(expect.objectContaining({ code: 'L-1', name: 'Casual Leave' }));
  });

  it('applies the date overlap range filter', async () => {
    const { service, m } = await setup();
    wireList(m);
    await service.listLeaveRequests('auth-1', { dateFrom: '2026-09-18', dateTo: '2026-09-25' });
    const rowsQb = m.leaveRepo.createQueryBuilder.mock.results[0].value;
    expect(rowsQb.andWhere).toHaveBeenCalledWith(
      'l.startDate <= :dateTo AND l.endDate >= :dateFrom',
      { dateFrom: '2026-09-18', dateTo: '2026-09-25' },
    );
  });

  it('returns the full audit trail on a single-record read', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    const qb = makeQb({ getRawOne: jest.fn().mockResolvedValue({ ...LEAVE_ROWS[0], approved_at: '2026-09-14 10:00', approved_by_name: 'HR Admin' }) });
    m.leaveRepo.createQueryBuilder.mockReturnValue(qb);
    const data = await service.getLeaveRequestById('auth-1', 'lr-1');
    expect(qb.where).toHaveBeenCalledWith('l.id = :id', { id: 'lr-1' });
    expect(qb.andWhere).toHaveBeenCalledWith('l.companyId = :companyId', { companyId: 'company-1' });
    expect(data.status).toBe('PENDING');
    expect(data.audit).toEqual(expect.objectContaining({ createdBy: 'System Admin', approvedBy: 'HR Admin', approvedAt: '2026-09-14 10:00' }));
  });

  it('404 when the leave request is missing or belongs to another company', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.leaveRepo.createQueryBuilder.mockReturnValue(makeQb({ getRawOne: jest.fn().mockResolvedValue(undefined) }));
    await expect(service.getLeaveRequestById('auth-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('HrService.getLeaveRequestOptions', () => {
  it('rejects an unprovisioned user (401)', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(null);
    await expect(service.getLeaveRequestOptions('auth-1')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns empty options when the user has no default company', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, defaultCompanyId: null });
    const data = await service.getLeaveRequestOptions('auth-1');
    expect(data).toEqual(expect.objectContaining({ companyId: null, divisions: [], departments: [], employees: [], leaveTypes: [] }));
    expect(data.statuses).toEqual(expect.arrayContaining(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']));
  });

  it('maps company-scoped dropdown metadata and resolves the self linkage', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, employeeId: 'EMP-001' });
    m.divisionRepo.find.mockResolvedValue([{ id: 'div-1', divisionCode: 'DIV-001', name: 'Manufacturing Division' }]);
    m.sectionRepo.find.mockResolvedValue([{ id: 'sec-1', sectionCode: 'SEC-001', name: 'Assembly Line A', divisionId: 'div-1' }]);
    m.departmentRepo.find.mockResolvedValue([{ id: 'dept-1', departmentCode: 'DEPT-001', name: 'Production', divisionId: 'div-1', sectionId: null }]);
    m.employeeRepo.find.mockResolvedValue([{ id: 'emp-1', employeeCode: 'EMP-001', firstName: 'Ahmed', lastName: 'Raza', departmentId: 'dept-1' }]);
    m.leaveTypeRepo.find.mockResolvedValue([{ id: 'lt-1', leaveCode: 'L-1', leaveName: 'Casual Leave', daysPerYear: 10, isPaid: true, status: 'ACTIVE' }]);
    const data = await service.getLeaveRequestOptions('auth-1');
    expect(m.employeeRepo.find).toHaveBeenCalledWith({
      where: { companyId: 'company-1', isActive: true, status: 'ACTIVE' },
      order: { employeeCode: 'ASC' },
    });
    expect(data.leaveTypes).toEqual([{ id: 'lt-1', code: 'L-1', name: 'Casual Leave', daysPerYear: 10, isPaid: true, status: 'ACTIVE' }]);
    expect(data.self).toEqual({ employeeId: 'emp-1', employeeCode: 'EMP-001', name: 'Ahmed Raza' });
  });
});

describe('HrService.createLeaveRequest', () => {
  it('rejects a request when the user has no default company (400)', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, defaultCompanyId: null });
    await expect(service.createLeaveRequest('auth-1', { leaveTypeId: 'lt-1', startDate: '2026-09-20', endDate: '2026-09-21' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves the employee from the authenticated ERP user for a self-service request', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue({ ...USER_FIXTURE, employeeId: 'EMP-001' });
    m.employeeRepo.findOne.mockResolvedValue({ id: 'emp-1', employeeCode: 'EMP-001', status: 'ACTIVE', isActive: true });
    m.leaveTypeRepo.findOne.mockResolvedValue({ id: 'lt-1', companyId: 'company-1', leaveCode: 'L-1', leaveName: 'Casual Leave' });
    const overlapQb = makeQb({ getRawOne: jest.fn().mockResolvedValue(undefined) });
    m.leaveRepo.createQueryBuilder.mockReturnValue(overlapQb);
    m.leaveRepo.create.mockImplementation((x: any) => ({ ...x }));
    m.leaveRepo.save.mockResolvedValue({ id: 'lr-1' });
    await service.createLeaveRequest('auth-1', { leaveTypeId: 'lt-1', startDate: '2026-09-20', endDate: '2026-09-21', reason: 'Medical' });
    expect(m.employeeRepo.findOne).toHaveBeenCalledWith({ where: { employeeCode: 'EMP-001', companyId: 'company-1' } });
    expect(m.leaveRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-1',
      employeeId: 'emp-1',
      leaveTypeId: 'lt-1',
      status: 'PENDING',
      days: 2,
      reason: 'Medical',
      createdBy: 'user-1',
      updatedBy: 'user-1',
    }));
    expect(m.leaveRepo.create.mock.calls[0][0].startDate).toBeInstanceOf(Date);
  });

  it('400 when an unlinked account does not specify an employee', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    await expect(service.createLeaveRequest('auth-1', { leaveTypeId: 'lt-1', startDate: '2026-09-20', endDate: '2026-09-21' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('400 when the employee does not belong to the current company', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue(null);
    await expect(service.createLeaveRequest('auth-1', { employeeId: 'other-emp', leaveTypeId: 'lt-1', startDate: '2026-09-20', endDate: '2026-09-21' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(m.employeeRepo.findOne).toHaveBeenCalledWith({ where: { id: 'other-emp', companyId: 'company-1' } });
  });

  it('400 when the leave type does not belong to the current company', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue({ id: 'emp-1', status: 'ACTIVE', isActive: true });
    m.leaveTypeRepo.findOne.mockResolvedValue(null);
    await expect(service.createLeaveRequest('auth-1', { employeeId: 'emp-1', leaveTypeId: 'lt-x', startDate: '2026-09-20', endDate: '2026-09-21' }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(m.leaveTypeRepo.findOne).toHaveBeenCalledWith({ where: { id: 'lt-x', companyId: 'company-1' } });
  });

  it('400 when end date precedes start date', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue({ id: 'emp-1', status: 'ACTIVE', isActive: true });
    m.leaveTypeRepo.findOne.mockResolvedValue({ id: 'lt-1', companyId: 'company-1' });
    await expect(service.createLeaveRequest('auth-1', { employeeId: 'emp-1', leaveTypeId: 'lt-1', startDate: '2026-09-20', endDate: '2026-09-19' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('409 when an overlapping pending/approved leave already exists', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.employeeRepo.findOne.mockResolvedValue({ id: 'emp-1', status: 'ACTIVE', isActive: true });
    m.leaveTypeRepo.findOne.mockResolvedValue({ id: 'lt-1', companyId: 'company-1' });
    const overlapQb = makeQb({ getRawOne: jest.fn().mockResolvedValue({ id: 'lr-x', leave_name: 'Casual Leave', start_date: '2026-09-15', end_date: '2026-09-25', status: 'APPROVED' }) });
    m.leaveRepo.createQueryBuilder.mockReturnValue(overlapQb);
    await expect(service.createLeaveRequest('auth-1', { employeeId: 'emp-1', leaveTypeId: 'lt-1', startDate: '2026-09-20', endDate: '2026-09-21' }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe('HrService.updateLeaveRequest', () => {
  it('400 when the request is no longer pending', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.leaveRepo.findOne.mockResolvedValue({ id: 'lr-1', companyId: 'company-1', isActive: true, status: 'APPROVED' });
    await expect(service.updateLeaveRequest('auth-1', 'lr-1', { reason: 'Changed' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recomputes days and keeps the status PENDING on success', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    const rec: any = {
      id: 'lr-1', companyId: 'company-1', employeeId: 'emp-1', isActive: true, status: 'PENDING',
      startDate: new Date('2026-09-20T00:00:00'), endDate: new Date('2026-09-21T00:00:00'),
      days: null, reason: 'old', forged: false,
    };
    m.leaveRepo.findOne.mockResolvedValue(rec);
    m.leaveTypeRepo.findOne.mockResolvedValue({ id: 'lt-2', companyId: 'company-1' });
    m.leaveRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    m.leaveRepo.createQueryBuilder.mockReturnValue(makeQb({ getRawOne: jest.fn().mockResolvedValue(undefined) }));
    const out = await service.updateLeaveRequest('auth-1', 'lr-1', { leaveTypeId: 'lt-2', startDate: '2026-09-22', endDate: '2026-09-23', reason: 'new' });
    expect(rec.leaveTypeId).toBe('lt-2');
    expect(rec.reason).toBe('new');
    expect(rec.days).toBe(2);
    expect(rec.status).toBe('PENDING');
    expect(m.leaveRepo.save).toHaveBeenCalledWith(rec);
  });
});

describe('HrService.deleteLeaveRequest', () => {
  it('soft-deletes the leave request (no history lost)', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    const rec: any = { id: 'lr-1', companyId: 'company-1', isActive: true, status: 'PENDING' };
    m.leaveRepo.findOne.mockResolvedValue(rec);
    m.leaveRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    await service.deleteLeaveRequest('auth-1', 'lr-1');
    expect(rec.isActive).toBe(false);
    expect(rec.updatedBy).toBe('user-1');
  });

  it('404 when the request is missing or belongs to another company', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.leaveRepo.findOne.mockResolvedValue(null);
    await expect(service.deleteLeaveRequest('auth-1', 'lr-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('HrService.approveLeave / rejectLeave / cancelLeave', () => {
  it('400 when approving a non-pending request', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.leaveRepo.findOne.mockResolvedValue({ id: 'lr-1', companyId: 'company-1', isActive: true, status: 'REJECTED' });
    await expect(service.approveLeave('auth-1', 'lr-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('409 when an overlapping active leave blocks the approval', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    const rec: any = {
      id: 'lr-1', companyId: 'company-1', employeeId: 'emp-1', isActive: true, status: 'PENDING',
      startDate: new Date('2026-09-20T00:00:00'), endDate: new Date('2026-09-21T00:00:00'),
    };
    m.leaveRepo.findOne.mockResolvedValue(rec);
    const overlapQb = makeQb({ getRawOne: jest.fn().mockResolvedValue({ id: 'lr-x', leave_name: 'Casual Leave', start_date: '2026-09-19', end_date: '2026-09-22', status: 'PENDING' }) });
    m.leaveRepo.createQueryBuilder.mockReturnValue(overlapQb);
    await expect(service.approveLeave('auth-1', 'lr-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('approves a pending request with the decision fields', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    const rec: any = {
      id: 'lr-1', companyId: 'company-1', employeeId: 'emp-1', isActive: true, status: 'PENDING',
      startDate: new Date('2026-09-20T00:00:00'), endDate: new Date('2026-09-21T00:00:00'), remarks: null,
    };
    m.leaveRepo.findOne.mockResolvedValue(rec);
    m.leaveRepo.createQueryBuilder.mockReturnValue(makeQb({ getRawOne: jest.fn().mockResolvedValue(undefined) }));
    m.leaveRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const out = await service.approveLeave('auth-1', 'lr-1', { remarks: 'Approved by manager' });
    expect(out.status).toBe('APPROVED');
    expect(out.approvedBy).toBe('user-1');
    expect(out.approvedAt).toBeInstanceOf(Date);
    expect(out.remarks).toBe('Approved by manager');
    expect(out.updatedBy).toBe('user-1');
  });

  it('rejects a pending request and records the decision', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    const rec: any = {
      id: 'lr-1', companyId: 'company-1', employeeId: 'emp-1', isActive: true, status: 'PENDING',
      startDate: new Date('2026-09-20T00:00:00'), endDate: new Date('2026-09-21T00:00:00'), remarks: null,
    };
    m.leaveRepo.findOne.mockResolvedValue(rec);
    m.leaveRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const out = await service.rejectLeave('auth-1', 'lr-1', { remarks: 'No cover available' });
    expect(out.status).toBe('REJECTED');
    expect(out.approvedBy).toBe('user-1');
    expect(out.approvedAt).toBeInstanceOf(Date);
    expect(out.remarks).toBe('No cover available');
  });

  it('cancels a pending request', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    const rec: any = { id: 'lr-1', companyId: 'company-1', isActive: true, status: 'PENDING' };
    m.leaveRepo.findOne.mockResolvedValue(rec);
    m.leaveRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const out = await service.cancelLeave('auth-1', 'lr-1');
    expect(out.status).toBe('CANCELLED');
  });

  it('400 when cancelling a non-pending request', async () => {
    const { service, m } = await setup();
    m.userRepo.findOne.mockResolvedValue(USER_FIXTURE);
    m.leaveRepo.findOne.mockResolvedValue({ id: 'lr-1', companyId: 'company-1', isActive: true, status: 'APPROVED' });
    await expect(service.cancelLeave('auth-1', 'lr-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});