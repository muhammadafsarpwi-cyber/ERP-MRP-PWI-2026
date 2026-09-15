import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HrAdvancesService } from './hr-advances.service';
import { HrAdvance } from '../entities/hr-advance.entity';
import { HrAdvanceHistory } from '../entities/hr-advance-history.entity';
import { HrEmployee } from '../entities/hr-employee.entity';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { FinanceAutoPostingService } from '../../finance/services/finance-auto-posting.service';
import { JournalType } from '../../finance/entities/finance-journal.entity';

const ADMIN_USER: any = {
  id: 'user-1', authUserId: 'auth-1', employeeId: null, defaultCompanyId: 'company-1', status: 'ACTIVE',
};
const OTHER_USER: any = {
  id: 'user-9', authUserId: 'auth-9', employeeId: null, defaultCompanyId: 'company-2', status: 'ACTIVE',
};
const SELF_USER: any = {
  id: 'user-2', authUserId: 'auth-2', employeeId: 'EMP-001', defaultCompanyId: 'company-1', status: 'ACTIVE',
};
const EMP_1: any = {
  id: 'emp-1', companyId: 'company-1', employeeCode: 'EMP-001', firstName: 'Ahmed', lastName: 'Raza',
  status: 'ACTIVE', isActive: true, departmentId: 'dept-1', currency: 'USD',
};
const EMP_2: any = {
  id: 'emp-2', companyId: 'company-1', employeeCode: 'EMP-002', firstName: 'Sara', lastName: 'Khan',
  status: 'ACTIVE', isActive: true, departmentId: 'dept-1', currency: 'USD',
};

function makeAdvance(over: Record<string, any> = {}): any {
  return {
    id: 'adv-1', refNo: 'ADV-ABC12345', companyId: 'company-1', employeeId: 'emp-1',
    requestDate: new Date('2026-09-15T00:00:00'), requestedAmount: 5000, approvedAmount: null,
    disbursedAmount: 0, recoveredAmount: 0, currency: 'USD', reason: 'Medical advance', remarks: null,
    status: 'PENDING', requestedBy: 'user-1', approvedBy: null, approvedAt: null,
    disbursedBy: null, disbursedAt: null, recoveredBy: null, recoveredAt: null,
    decisionRemarks: null, isActive: true, createdBy: 'user-1', updatedBy: 'user-1',
    createdAt: new Date('2026-09-15T09:00:00Z'), updatedAt: new Date('2026-09-15T09:00:00Z'),
    ...over,
  };
}

function detailRow(a: any) {
  return {
    id: a.id, ref_no: a.refNo, request_date: '2026-09-15',
    requested_amount: String(a.requestedAmount),
    approved_amount: a.approvedAmount != null ? String(a.approvedAmount) : null,
    disbursed_amount: String(a.disbursedAmount ?? 0),
    recovered_amount: String(a.recoveredAmount ?? 0),
    outstanding_amount: String((Number(a.disbursedAmount ?? 0) - Number(a.recoveredAmount ?? 0)).toFixed(4)),
    currency: a.currency ?? 'USD', reason: a.reason, remarks: a.remarks ?? null,
    decision_remarks: a.decisionRemarks ?? null, status: a.status,
    decided_at: null, disbursed_at: null, recovered_at: null, created_at: '2026-09-15 09:00', updated_at: '2026-09-15 09:00',
    employee_id: a.employeeId, employee_code: 'EMP-001', first_name: 'Ahmed', last_name: 'Raza',
    job_title: 'Machine Operator', employee_status: 'ACTIVE',
    department_id: 'dept-1', department_name: 'Production',
    division_id: null, division_name: null, section_id: null, section_name: null,
    created_by_name: 'System Admin', decided_by_name: null, disbursed_by_name: null, recovered_by_name: null,
  };
}

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

function repos(): any {
  return {
    advanceRepo: { createQueryBuilder: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn() },
    historyRepo: { createQueryBuilder: jest.fn(), create: jest.fn(), save: jest.fn() },
    employeeRepo: { findOne: jest.fn(), find: jest.fn() },
    departmentRepo: { findOne: jest.fn(), find: jest.fn() },
    divisionRepo: { findOne: jest.fn(), find: jest.fn() },
    sectionRepo: { findOne: jest.fn(), find: jest.fn() },
    userRepo: { findOne: jest.fn() },
  };
}

type Ctx = {
  service: HrAdvancesService;
  m: ReturnType<typeof repos>;
  db: { advance: any };
  histories: any[];
  financePosting: { postAutoJournal: jest.Mock };
  manager: any;
};

async function setup(user: any, initial: any = null): Promise<Ctx> {
  jest.clearAllMocks();
  const m = repos();
  m.userRepo.findOne.mockResolvedValue(user);
  m.employeeRepo.findOne.mockImplementation(async (opts: any) => {
    const w = opts?.where ?? {};
    if (w.companyId === 'company-1') {
      if (w.employeeCode === EMP_1.employeeCode || w.id === EMP_1.id) return EMP_1;
      if (w.id === EMP_2.id) return EMP_2;
    }
    return undefined;
  });

  const db: Ctx['db'] = { advance: initial };
  const histories: any[] = [];
  const manager: any = {
    findOne: jest.fn(async (entity: any, opts: any) => {
      if (entity !== HrAdvance || !db.advance) return undefined;
      const w = opts?.where ?? {};
      if (w.id && db.advance.id !== w.id) return undefined;
      if (w.companyId && db.advance.companyId !== w.companyId) return undefined;
      if (w.isActive === true && db.advance.isActive !== true) return undefined;
      if (w.employeeId && db.advance.employeeId !== w.employeeId) return undefined;
      if (w.requestDate && String(w.requestDate).slice(0, 10) !== String(db.advance.requestDate).slice(0, 10)) return undefined;
      const wantStatus = w.status?.value ?? w.status;
      if (wantStatus !== undefined) {
        const ok = Array.isArray(wantStatus) ? wantStatus.includes(db.advance.status) : db.advance.status === wantStatus;
        if (!ok) return undefined;
      }
      return db.advance;
    }),
    save: jest.fn(async (_entity: any, rec: any) => { db.advance = rec; return rec; }),
    create: jest.fn((_entity: any, data: any) => ({ id: 'adv-new', isActive: true, ...data })),
    getRepository: jest.fn((entity: any) => ({
      create: (d: any) => d,
      save: jest.fn(async (d: any) => { histories.push(d); return d; }),
    })),
  };
  const financePosting = { postAutoJournal: jest.fn(async (input: any) => ({ id: 'jv-1', ...input })) };
  const dataSource: any = {
    transaction: jest.fn(async (cb: any) => {
      const before = JSON.parse(JSON.stringify(db.advance));
      const histBefore = histories.length;
      try {
        return await cb(manager);
      } catch (e) {
        db.advance = before;
        histories.length = histBefore;
        throw e;
      }
    }),
  };
  // grab the Entities by token (no DI in mocks) — build module.
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      HrAdvancesService,
      { provide: getRepositoryToken(HrAdvance), useValue: m.advanceRepo },
      { provide: getRepositoryToken(HrAdvanceHistory), useValue: m.historyRepo },
      { provide: getRepositoryToken(HrEmployee), useValue: m.employeeRepo },
      { provide: getRepositoryToken(Department), useValue: m.departmentRepo },
      { provide: getRepositoryToken(Division), useValue: m.divisionRepo },
      { provide: getRepositoryToken(Section), useValue: m.sectionRepo },
      { provide: getRepositoryToken(ErpUser), useValue: m.userRepo },
      { provide: FinanceAutoPostingService, useValue: financePosting },
      { provide: getDataSourceToken() as any, useValue: dataSource },
    ],
  }).compile();
  const service = module.get<HrAdvancesService>(HrAdvancesService);

  // getById wiring (lazy so it reflects the current db state)
  const detailQb = makeQb();
  detailQb.getRawOne.mockImplementation(async () => (db.advance ? detailRow(db.advance) : undefined));
  m.advanceRepo.createQueryBuilder.mockReturnValue(detailQb);
  const hQb = makeQb();
  hQb.getRawMany.mockResolvedValue([]);
  m.historyRepo.createQueryBuilder.mockReturnValue(hQb);

  return { service, m, db, histories, financePosting, manager };
}

async function toApproved(price: number, approved = price) {
  return setup(ADMIN_USER, makeAdvance({ status: 'APPROVED', approvedAmount: approved, requestedAmount: price }));
}

describe('HrAdvancesService', () => {
  describe('create', () => {
    it('creates an advance directly into PENDING with CREATED history (no DRAFT/SUBMITTED)', async () => {
      const { service, db, histories } = await setup(ADMIN_USER);
      const dto: any = { employeeId: 'emp-1', requestDate: '2026-09-15', requestedAmount: 5000, reason: 'Medical advance' };
      const result = await service.create('auth-1', dto);
      expect(result.status).toBe('PENDING');
      expect(db.advance.status).toBe('PENDING');
      expect(db.advance.requestedAmount).toBe(5000);
      expect(db.advance.employeeId).toBe('emp-1');
      expect(db.advance.requestedBy).toBe('user-1');
      expect(db.advance.disbursedAmount).toBe(0);
      expect(db.advance.recoveredAmount).toBe(0);
      expect(histories[0].eventType).toBe('CREATED');
      expect(histories[0].fromStatus).toBeNull();
      expect(histories[0].toStatus).toBe('PENDING');
      expect(histories[0].amount).toBeNull();
    });

    it('self-service users resolve to their own employee and cannot request for another', async () => {
      const { service, db } = await setup(SELF_USER);
      const self = await service.create('auth-2', { requestDate: '2026-09-15', requestedAmount: 1000, reason: 'Travel' } as any);
      expect(self.employee.id).toBe('emp-1');
      expect(db.advance.employeeId).toBe('emp-1');
      await expect(
        service.create('auth-2', { employeeId: 'emp-2', requestDate: '2026-09-15', requestedAmount: 1000, reason: 'Travel' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects creating an advance for an employee outside the company', async () => {
      const { service } = await setup(ADMIN_USER);
      await expect(
        service.create('auth-1', { employeeId: 'emp-x', requestDate: '2026-09-15', requestedAmount: 1000, reason: 'Travel' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an open duplicate request with a clean 409 conflict', async () => {
      const { service } = await setup(ADMIN_USER, makeAdvance({ status: 'PENDING' }));
      await expect(
        service.create('auth-1', { employeeId: 'emp-1', requestDate: '2026-09-15', requestedAmount: 1000, reason: 'Duplicate' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('maps a DB unique violation on hr_advances to a clean 409 conflict', async () => {
      const { service, manager } = await setup(ADMIN_USER);
      manager.save.mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint "uq_hr_adv_active" on table "hr_advances"' });
      await expect(
        service.create('auth-1', { employeeId: 'emp-1', requestDate: '2026-09-15', requestedAmount: 1000, reason: 'Duplicate' } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects an unauthenticated user', async () => {
      const { service, m } = await setup(ADMIN_USER);
      m.userRepo.findOne.mockResolvedValue(undefined);
      await expect(service.create('auth-x', { requestedAmount: 1000, reason: 'x' } as any)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('update', () => {
    it('updates a PENDING advance and records the changed fields in history', async () => {
      const { service, db, histories } = await setup(ADMIN_USER, makeAdvance({ status: 'PENDING', createdBy: 'user-1' }));
      const result = await service.update('auth-1', 'adv-1', { requestedAmount: 6000, reason: 'Updated reason', remarks: 'Room change' } as any);
      expect(result.requestedAmount).toBe(6000);
      expect(db.advance.requestedAmount).toBe(6000);
      expect(db.advance.reason).toBe('Updated reason');
      const upd = histories[histories.length - 1];
      expect(upd.eventType).toBe('UPDATED');
      expect(upd.changedFields).toEqual(expect.arrayContaining(['requested_amount', 'reason', 'remarks']));
    });

    it('rejects updating after approval', async () => {
      const { service } = await toApproved(5000);
      await expect(service.update('auth-1', 'adv-1', { requestedAmount: 8000 } as any)).rejects.toThrow(BadRequestException);
    });

    it('rejects updates by a different requester', async () => {
      const { service } = await setup(ADMIN_USER, makeAdvance({ status: 'PENDING', createdBy: 'someone-else' }));
      await expect(service.update('auth-1', 'adv-1', { reason: 'x' } as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('approve', () => {
    it('approves a PENDING advance (default = requested amount)', async () => {
      const { service, db, histories } = await setup(ADMIN_USER, makeAdvance({ status: 'PENDING', requestedAmount: 5000 }));
      const result = await service.approve('auth-1', 'adv-1', {});
      expect(result.status).toBe('APPROVED');
      expect(db.advance.approvedAmount).toBe(5000);
      expect(db.advance.approvedBy).toBe('user-1');
      expect(db.advance.approvedAt).toBeInstanceOf(Date);
      const h = histories[histories.length - 1];
      expect(h.eventType).toBe('APPROVED');
      expect(h.fromStatus).toBe('PENDING');
      expect(h.toStatus).toBe('APPROVED');
    });

    it('does not allow APPROVED → APPROVED', async () => {
      const { service } = await toApproved(5000);
      await expect(service.approve('auth-1', 'adv-1', {})).rejects.toThrow(BadRequestException);
    });

    it('allows partial approval (approved <= requested) but never above', async () => {
      const { service, db } = await setup(ADMIN_USER, makeAdvance({ status: 'PENDING', requestedAmount: 5000 }));
      await service.approve('auth-1', 'adv-1', { approvedAmount: 4000 });
      expect(db.advance.approvedAmount).toBe(4000);
      const high = await setup(ADMIN_USER, makeAdvance({ status: 'PENDING', requestedAmount: 5000 }));
      await expect(high.service.approve('auth-1', 'adv-1', { approvedAmount: 6000 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('reject', () => {
    it('rejects a PENDING advance without setting approval fields', async () => {
      const { service, db, histories } = await setup(ADMIN_USER, makeAdvance({ status: 'PENDING' }));
      const result = await service.reject('auth-1', 'adv-1', { remarks: 'Unsupported purpose' });
      expect(result.status).toBe('REJECTED');
      expect(db.advance.status).toBe('REJECTED');
      expect(db.advance.approvedBy).toBeNull();
      expect(db.advance.approvedAt).toBeNull();
      expect(db.advance.approvedAmount).toBeNull();
      expect(db.advance.decisionRemarks).toBe('Unsupported purpose');
      const h = histories[histories.length - 1];
      expect(h.eventType).toBe('REJECTED');
      expect(h.fromStatus).toBe('PENDING');
      expect(h.toStatus).toBe('REJECTED');
    });

    it('does not allow REJECTED → anything', async () => {
      const { service } = await setup(ADMIN_USER, makeAdvance({ status: 'REJECTED' }));
      await expect(service.reject('auth-1', 'adv-1', { remarks: 'again' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel / delete', () => {
    it('cancels a PENDING advance (PENDING → CANCELLED) with history', async () => {
      const { service, db, histories } = await setup(ADMIN_USER, makeAdvance({ status: 'PENDING' }));
      const result = await service.cancel('auth-1', 'adv-1');
      expect(result.status).toBe('CANCELLED');
      expect(db.advance.status).toBe('CANCELLED');
      const h = histories[histories.length - 1];
      expect(h.eventType).toBe('CANCELLED');
      expect(h.fromStatus).toBe('PENDING');
      expect(h.toStatus).toBe('CANCELLED');
    });

    it('rejects cancelling a DISBURSED advance', async () => {
      const { service } = await setup(ADMIN_USER, makeAdvance({ status: 'DISBURSED', approvedAmount: 10000, disbursedAmount: 10000 }));
      await expect(service.cancel('auth-1', 'adv-1')).rejects.toThrow(BadRequestException);
    });

    it('deletes a PENDING advance via soft delete (is_active=false, status CANCELLED)', async () => {
      const { service, db, histories } = await setup(ADMIN_USER, makeAdvance({ status: 'PENDING' }));
      const res = await service.delete('auth-1', 'adv-1');
      expect(res.deleted).toBe(true);
      expect(db.advance.isActive).toBe(false);
      expect(db.advance.status).toBe('CANCELLED');
      const h = histories[histories.length - 1];
      expect(h.eventType).toBe('CANCELLED');
    });
  });

  describe('disburse (finance)', () => {
    it('disburses exactly the approved amount (full disbursement)', async () => {
      const { service, db, histories, financePosting } = await toApproved(10000, 8000);
      await service.disburse('auth-1', 'adv-1', {});
      expect(db.advance.status).toBe('DISBURSED');
      expect(db.advance.disbursedAmount).toBe(8000);
      expect(db.advance.disbursedBy).toBe('user-1');
      expect(db.advance.disbursedAt).toBeInstanceOf(Date);
      expect(financePosting.postAutoJournal).toHaveBeenCalledTimes(1);
      const input = financePosting.postAutoJournal.mock.calls[0][0];
      expect(input.journalType).toBe(JournalType.PAYMENT);
      expect(input.amount === undefined).toBe(true);
      const h = histories[histories.length - 1];
      expect(h.eventType).toBe('DISBURSED');
      expect(h.fromStatus).toBe('APPROVED');
      expect(h.toStatus).toBe('DISBURSED');
      expect(h.amount).toBe(8000);
    });

    it('posts DR 1100 / CR 1000 with EMPLOYEE_ADVANCE reference', async () => {
      const { service, financePosting, db } = await toApproved(10000, 8000);
      await service.disburse('auth-1', 'adv-1', {});
      const input = financePosting.postAutoJournal.mock.calls[0][0];
      expect(input.referenceType).toBe('EMPLOYEE_ADVANCE');
      expect(input.referenceId).toBe('adv-1');
      expect(input.actorId).toBe('user-1');
      expect(input.manager).toBeDefined();
      expect(input.lines).toEqual([
        { accountCode: '1100', debit: 8000, credit: 0, description: expect.any(String) },
        { accountCode: '1000', debit: 0, credit: 8000, description: expect.any(String) },
      ]);
      expect(db.advance.disbursedAmount).toBe(8000);
    });

    it('blocks a duplicate disbursement without creating a second journal', async () => {
      const { service, financePosting } = await setup(ADMIN_USER, makeAdvance({ status: 'DISBURSED', approvedAmount: 8000, disbursedAmount: 8000 }));
      await expect(service.disburse('auth-1', 'adv-1', {})).rejects.toThrow(BadRequestException);
      expect(financePosting.postAutoJournal).not.toHaveBeenCalled();
    });

    it('rolls back everything when the finance posting fails', async () => {
      const { service, financePosting, db, histories } = await toApproved(10000, 8000);
      financePosting.postAutoJournal.mockRejectedValueOnce(new Error('journal unbalanced'));
      await expect(service.disburse('auth-1', 'adv-1', {})).rejects.toThrow('journal unbalanced');
      expect(db.advance.status).toBe('APPROVED');
      expect(db.advance.disbursedAmount).toBe(0);
      expect(db.advance.disbursedAt).toBeNull();
      expect(db.advance.disbursedBy).toBeNull();
      expect(histories.length).toBe(0);
    });

    it('rejects disbursing an inactive or non-approved advance', async () => {
      const { service } = await setup(ADMIN_USER, makeAdvance({ status: 'CANCELLED' }));
      await expect(service.disburse('auth-1', 'adv-1', {})).rejects.toThrow(BadRequestException);
    });
  });

  describe('recover (finance)', () => {
    it('records a partial recovery (DISBURSED → PARTIALLY_RECOVERED)', async () => {
      const { service, db, histories, financePosting } = await setup(ADMIN_USER, makeAdvance({ status: 'DISBURSED', approvedAmount: 10000, disbursedAmount: 10000 }));
      await service.recover('auth-1', 'adv-1', { amount: 4000 });
      expect(db.advance.status).toBe('PARTIALLY_RECOVERED');
      expect(db.advance.recoveredAmount).toBe(4000);
      expect(db.advance.recoveredBy).toBe('user-1');
      expect(financePosting.postAutoJournal).toHaveBeenCalledTimes(1);
      const h = histories[histories.length - 1];
      expect(h.eventType).toBe('RECOVERED');
      expect(h.fromStatus).toBe('DISBURSED');
      expect(h.toStatus).toBe('PARTIALLY_RECOVERED');
      expect(h.amount).toBe(4000);
    });

    it('records a full recovery (→ RECOVERED) and no outstanding remains', async () => {
      const { service, db } = await setup(ADMIN_USER, makeAdvance({ status: 'DISBURSED', approvedAmount: 10000, disbursedAmount: 10000, recoveredAmount: 6000 }));
      await service.recover('auth-1', 'adv-1', { amount: 4000 });
      expect(db.advance.status).toBe('RECOVERED');
      expect(db.advance.recoveredAmount).toBe(10000);
    });

    it('rejects a recovery that exceeds outstanding', async () => {
      const { service, financePosting, db } = await setup(ADMIN_USER, makeAdvance({ status: 'DISBURSED', approvedAmount: 10000, disbursedAmount: 10000 }));
      await expect(service.recover('auth-1', 'adv-1', { amount: 12000 })).rejects.toThrow(BadRequestException);
      expect(db.advance.recoveredAmount).toBe(0);
      expect(financePosting.postAutoJournal).not.toHaveBeenCalled();
    });

    it('protects against concurrent recoveries consuming the same outstanding', async () => {
      const { service, financePosting, db } = await setup(ADMIN_USER, makeAdvance({ status: 'DISBURSED', approvedAmount: 10000, disbursedAmount: 10000 }));
      await service.recover('auth-1', 'adv-1', { amount: 6000 });
      expect(db.advance.status).toBe('PARTIALLY_RECOVERED');
      await expect(service.recover('auth-1', 'adv-1', { amount: 6000 })).rejects.toThrow(BadRequestException);
      expect(db.advance.recoveredAmount).toBe(6000);
      expect(financePosting.postAutoJournal).toHaveBeenCalledTimes(1);
    });

    it('posts DR 1000 / CR 1100 with EMPLOYEE_ADVANCE reference', async () => {
      const { service, financePosting } = await setup(ADMIN_USER, makeAdvance({ status: 'DISBURSED', approvedAmount: 10000, disbursedAmount: 10000 }));
      await service.recover('auth-1', 'adv-1', { amount: 4000 });
      const input = financePosting.postAutoJournal.mock.calls[0][0];
      expect(input.journalType).toBe(JournalType.RECEIPT);
      expect(input.referenceType).toBe('EMPLOYEE_ADVANCE');
      expect(input.referenceId).toBe('adv-1');
      expect(input.lines).toEqual([
        { accountCode: '1000', debit: 4000, credit: 0, description: expect.any(String) },
        { accountCode: '1100', debit: 0, credit: 4000, description: expect.any(String) },
      ]);
    });

    it('rolls back everything when the recovery posting fails', async () => {
      const { service, financePosting, db, histories } = await setup(ADMIN_USER, makeAdvance({ status: 'DISBURSED', approvedAmount: 10000, disbursedAmount: 10000 }));
      financePosting.postAutoJournal.mockRejectedValueOnce(new Error('period closed'));
      await expect(service.recover('auth-1', 'adv-1', { amount: 4000 })).rejects.toThrow('period closed');
      expect(db.advance.status).toBe('DISBURSED');
      expect(db.advance.recoveredAmount).toBe(0);
      expect(db.advance.recoveredAt).toBeNull();
      expect(histories.length).toBe(0);
    });

    it('blocks recovery after the advance is fully recovered', async () => {
      const { service, financePosting } = await setup(ADMIN_USER, makeAdvance({ status: 'RECOVERED', approvedAmount: 10000, disbursedAmount: 10000, recoveredAmount: 10000 }));
      await expect(service.recover('auth-1', 'adv-1', { amount: 100 })).rejects.toThrow(BadRequestException);
      expect(financePosting.postAutoJournal).not.toHaveBeenCalled();
    });
  });

  describe('guards / isolation / balance', () => {
    it('enforces invalid status transitions', async () => {
      const rejected = await setup(ADMIN_USER, makeAdvance({ status: 'REJECTED' }));
      await expect(rejected.service.approve('auth-1', 'adv-1', {})).rejects.toThrow(BadRequestException);
      const recovered = await setup(ADMIN_USER, makeAdvance({ status: 'RECOVERED', approvedAmount: 10000, disbursedAmount: 10000, recoveredAmount: 10000 }));
      await expect(recovered.service.recover('auth-1', 'adv-1', { amount: 1 })).rejects.toThrow(BadRequestException);
      const disbursed = await setup(ADMIN_USER, makeAdvance({ status: 'DISBURSED', approvedAmount: 10000, disbursedAmount: 10000 }));
      await expect(disbursed.service.disburse('auth-1', 'adv-1', {})).rejects.toThrow(BadRequestException);
      await expect(disbursed.service.approve('auth-1', 'adv-1', {})).rejects.toThrow(BadRequestException);
    });

    it('does not leak records across companies (detail + money moves)', async () => {
      const other = await setup(OTHER_USER, makeAdvance({ status: 'APPROVED', approvedAmount: 5000 }));
      other.m.advanceRepo.createQueryBuilder.mockReturnValue(makeQb({ getRawOne: jest.fn().mockResolvedValue(undefined) }));
      await expect(other.service.getById('auth-9', 'adv-1')).rejects.toThrow(NotFoundException);
      await expect(other.service.disburse('auth-9', 'adv-1', {})).rejects.toThrow(NotFoundException);
      expect(other.financePosting.postAutoJournal).not.toHaveBeenCalled();
    });

    it('derives outstandingAmount from disbursed - recovered (never stored)', async () => {
      const { service, db } = await setup(ADMIN_USER, makeAdvance({ status: 'DISBURSED', approvedAmount: 10000, disbursedAmount: 10000, recoveredAmount: 4000 }));
      const result = await service.getById('auth-1', 'adv-1');
      expect(result.outstandingAmount).toBe(6000);
      expect(result.status).toBe('DISBURSED');
      expect('outstandingAmount' in db.advance).toBe(false);
    });

    it('writes history rows atomically through the transaction manager only', async () => {
      const { service, m, histories } = await setup(ADMIN_USER, makeAdvance({ status: 'PENDING', requestedAmount: 5000 }));
      await service.approve('auth-1', 'adv-1', {});
      expect(histories).toHaveLength(1);
      expect(m.historyRepo.save).not.toHaveBeenCalled();
      expect(histories[0].eventType).toBe('APPROVED');
      expect(histories[0].requestedAmount).toBe(5000);
      expect(histories[0].approvedAmount).toBe(5000);
    });

    it('rejects self-service users operating on another employee’s advance', async () => {
      const { service } = await setup(SELF_USER, makeAdvance({ status: 'PENDING', createdBy: 'someone-else' }));
      await expect(service.update('auth-2', 'adv-1', { reason: 'hijacked' } as any)).rejects.toThrow(ForbiddenException);
    });
  });
});