import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HrDashboardService } from './hr-dashboard.service';
import { HrEmployee } from '../entities/hr-employee.entity';
import { HrAttendance } from '../entities/hr-attendance.entity';
import { HrLeaveRequest } from '../entities/hr-leave-request.entity';
import { HrShift } from '../entities/hr-shift.entity';
import { Department } from '../../organization/entities/department.entity';

function makeQb(overrides: Partial<any> = {}): any {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  };
  Object.assign(qb, overrides);
  return qb;
}

describe('HrDashboardService', () => {
  let service: HrDashboardService;
  let employeeRepo: any;
  let attendanceRepo: any;
  let leaveRepo: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    employeeRepo = { createQueryBuilder: jest.fn() };
    attendanceRepo = { createQueryBuilder: jest.fn() };
    leaveRepo = { createQueryBuilder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HrDashboardService,
        { provide: getRepositoryToken(HrEmployee), useValue: employeeRepo },
        { provide: getRepositoryToken(HrAttendance), useValue: attendanceRepo },
        { provide: getRepositoryToken(HrLeaveRequest), useValue: leaveRepo },
        { provide: getRepositoryToken(Department), useValue: {} },
      ],
    }).compile();

    service = module.get<HrDashboardService>(HrDashboardService);
  });

  it('returns KPIs, trend and department distribution derived from real data (no org filter)', async () => {
    const qbTotal = makeQb({ getCount: jest.fn().mockResolvedValue(12) });
    const qbActive = makeQb({ getCount: jest.fn().mockResolvedValue(10) });
    const qbDept = makeQb({
      getRawMany: jest.fn().mockResolvedValue([
        { department_id: 'd1', name: 'Production', count: '6' },
        { department_id: null, name: 'Unassigned', count: '4' },
      ]),
    });
    employeeRepo.createQueryBuilder
      .mockReturnValueOnce(qbTotal)
      .mockReturnValueOnce(qbActive)
      .mockReturnValueOnce(qbDept);

    const qbTrend = makeQb({
      getRawMany: jest.fn().mockResolvedValue([
        { attendance_date: '2026-09-13', status: 'PRESENT', count: '3', late_count: '1' },
        { attendance_date: '2026-09-13', status: 'ABSENT', count: '1', late_count: '0' },
        { attendance_date: '2026-09-13', status: 'LEAVE', count: '1', late_count: '0' },
        { attendance_date: '2026-09-12', status: 'PRESENT', count: '2', late_count: '0' },
      ]),
    });
    attendanceRepo.createQueryBuilder.mockReturnValueOnce(qbTrend);

    const qbLeave = makeQb({ getCount: jest.fn().mockResolvedValue(2) });
    leaveRepo.createQueryBuilder.mockReturnValueOnce(qbLeave);

    const data = await service.getDashboardData('company-1', { date: '2026-09-13', days: 30 });

    expect(data.asOf).toBe('2026-09-13');
    expect(data.periodStart).toBe('2026-08-15');
    expect(data.periodEnd).toBe('2026-09-13');
    expect(data.kpi.totalEmployees).toBe(12);
    expect(data.kpi.activeEmployees).toBe(10);
    expect(data.kpi.presentToday).toBe(3);
    expect(data.kpi.lateToday).toBe(1);
    expect(data.kpi.absentToday).toBe(1);
    expect(data.kpi.onLeaveToday).toBe(1);
    expect(data.kpi.pendingApprovals).toBe(2);
    expect(data.kpi.outOfZone).toBe(0);
    expect(data.kpi.documentsExpiring).toBe(0);
    expect(data.notes.lateToday).toBe('DERIVED');
    expect(data.notes.outOfZone).toBe('UNSUPPORTED');
    expect(data.notes.documentsExpiring).toBe('UNSUPPORTED');

    expect(data.attendanceTrend).toHaveLength(30);
    const today = data.attendanceTrend.find((d) => d.date === '2026-09-13');
    expect(today).toMatchObject({ present: 3, late: 1, absent: 1, onLeave: 1 });
    const yesterday = data.attendanceTrend.find((d) => d.date === '2026-09-12');
    expect(yesterday).toMatchObject({ present: 2, late: 0, absent: 0, onLeave: 0 });

    expect(data.employeesByDepartment).toEqual([
      { departmentId: 'd1', name: 'Production', count: 6 },
      { departmentId: null, name: 'Unassigned', count: 4 },
    ]);
  });

  it('scopes employees via the selected department and still derives real KPIs', async () => {
    const qbScope = makeQb({
      getRawMany: jest.fn().mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]),
    });
    const qbTotal = makeQb({ getCount: jest.fn().mockResolvedValue(2) });
    const qbActive = makeQb({ getCount: jest.fn().mockResolvedValue(2) });
    const qbDept = makeQb({
      getRawMany: jest.fn().mockResolvedValue([
        { department_id: 'd1', name: 'Production', count: '2' },
      ]),
    });
    employeeRepo.createQueryBuilder
      .mockReturnValueOnce(qbScope)
      .mockReturnValueOnce(qbTotal)
      .mockReturnValueOnce(qbActive)
      .mockReturnValueOnce(qbDept);

    const qbTrend = makeQb({
      getRawMany: jest.fn().mockResolvedValue([
        { attendance_date: '2026-09-13', status: 'PRESENT', count: '1', late_count: '1' },
      ]),
    });
    attendanceRepo.createQueryBuilder.mockReturnValueOnce(qbTrend);

    const qbLeave = makeQb({ getCount: jest.fn().mockResolvedValue(1) });
    leaveRepo.createQueryBuilder.mockReturnValueOnce(qbLeave);

    const data = await service.getDashboardData('company-1', {
      date: '2026-09-13',
      days: 30,
      departmentId: 'd1',
    });

    expect(qbScope.andWhere).toHaveBeenCalledWith('e.departmentId = :departmentId', { departmentId: 'd1' });
    expect(qbTotal.andWhere).toHaveBeenCalledWith('e.id IN (:...ids)', { ids: ['e1', 'e2'] });
    expect(data.kpi.totalEmployees).toBe(2);
    expect(data.kpi.presentToday).toBe(1);
    expect(data.kpi.lateToday).toBe(1);
    expect(data.kpi.pendingApprovals).toBe(1);
    expect(data.employeesByDepartment[0]).toEqual({ departmentId: 'd1', name: 'Production', count: 2 });
  });

  it('scopes employees via a Division hierarchy when only a division is selected', async () => {
    const qbScope = makeQb({
      getRawMany: jest.fn().mockResolvedValue([{ id: 'e1' }]),
    });
    const qbTotal = makeQb({ getCount: jest.fn().mockResolvedValue(1) });
    const qbActive = makeQb({ getCount: jest.fn().mockResolvedValue(1) });
    const qbDept = makeQb({ getRawMany: jest.fn().mockResolvedValue([]) });
    employeeRepo.createQueryBuilder
      .mockReturnValueOnce(qbScope)
      .mockReturnValueOnce(qbTotal)
      .mockReturnValueOnce(qbActive)
      .mockReturnValueOnce(qbDept);

    const qbTrend = makeQb({ getRawMany: jest.fn().mockResolvedValue([]) });
    attendanceRepo.createQueryBuilder.mockReturnValueOnce(qbTrend);
    const qbLeave = makeQb({ getCount: jest.fn().mockResolvedValue(0) });
    leaveRepo.createQueryBuilder.mockReturnValueOnce(qbLeave);

    await service.getDashboardData('company-1', { date: '2026-09-13', days: 30, divisionId: 'div-1' });

    expect(qbScope.leftJoin).toHaveBeenCalledWith(Department, 'd', 'd.id = e.departmentId');
    expect(qbScope.andWhere).toHaveBeenCalledWith('d.divisionId = :divisionId', { divisionId: 'div-1' });
  });

  it('returns strictly zero values when the org scope matches no employees (no fake data)', async () => {
    const qbScope = makeQb({ getRawMany: jest.fn().mockResolvedValue([]) });
    const qbDept = makeQb({ getRawMany: jest.fn().mockResolvedValue([]) });
    employeeRepo.createQueryBuilder
      .mockReturnValueOnce(qbScope)
      .mockReturnValueOnce(qbDept);

    const data = await service.getDashboardData('company-1', {
      date: '2026-09-13',
      days: 30,
      departmentId: 'd-none',
    });

    expect(data.kpi.totalEmployees).toBe(0);
    expect(data.kpi.activeEmployees).toBe(0);
    expect(data.kpi.presentToday).toBe(0);
    expect(data.kpi.lateToday).toBe(0);
    expect(data.kpi.absentToday).toBe(0);
    expect(data.kpi.onLeaveToday).toBe(0);
    expect(data.kpi.pendingApprovals).toBe(0);
    expect(data.attendanceTrend).toHaveLength(30);
    expect(data.attendanceTrend.every((d) => d.present === 0 && d.late === 0 && d.absent === 0 && d.onLeave === 0)).toBe(true);
    expect(attendanceRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(leaveRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});