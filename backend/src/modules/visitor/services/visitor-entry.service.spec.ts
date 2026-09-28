import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VisitorEntryService } from './visitor-entry.service';
import { VisitorEntry, VisitorEntryStatus, Location, LocationStatus } from '../entities';
import { Division } from '../../organization/entities/division.entity';
import { HrEmployee } from '../../hr/entities/hr-employee.entity';
import { ActivityLogService } from '../../audit/services/activity-log.service';
import { CreateVisitorEntryDto } from '../dto';

/**
 * Prompt #17 §21 — API security tests for Visitor Entry.
 *
 * Every requirement is exercised against the REAL service (and the real
 * `applyDivisionScopeFilter` util); only the repositories are replaced, so a
 * regression in the authorization/data rules fails these tests.
 *
 * Covered (§21 numbered list):
 *   1  authorized user can create a visitor
 *   2  unauthorized division create is rejected            (service layer)
 *   3  authorized user can list visitors
 *   4  visitor list is filtered to authorized divisions
 *   5  unauthorized visitor cannot be retrieved by ID
 *   6  authorized visitor can be retrieved by ID
 *   7  Time-In is generated server-side
 *   8  client cannot override Time-In (service ignores it; DTO rejects it)
 *   9  new visitor status is PENDING, time_out stays NULL
 *   10 invalid division/location combination is rejected
 *   11 host selection is validated
 *   14 visitor photo upload path works (camera fallback is covered by the
 *      frontend component tests)
 */
describe('VisitorEntryService', () => {
  const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
  const CCD = 'd1000000-0000-0000-0000-000000000002';
  const SPD = 'd1000000-0000-0000-0000-000000000001';
  const LOC_CCD = 'a1000000-0000-0000-0000-00000000000c';
  const LOC_SPD = 'a1000000-0000-0000-0000-00000000000d';
  const HOST_CCD = 'e1000000-0000-0000-0000-00000000000c';
  const HOST_SPD = 'e1000000-0000-0000-0000-00000000000d';
  const ENTRY = 'f1000000-0000-0000-0000-000000000001';
  const USER = 'u1000000-0000-0000-0000-000000000001';

  let service: VisitorEntryService;
  let visitorRepo: any;
  let locationRepo: any;
  let divisionRepo: any;
  let employeeRepo: any;
  let storageDir: string;

  /** Minimal chainable query builder that records every where-clause. */
  const makeQb = () => {
    const qb: any = { whereCalls: [] as Array<[string, any]> };
    const chain = (name: string, record = false) =>
      jest.fn().mockImplementation((...args: any[]) => {
        if (record) qb.whereCalls.push([args[0], args[1]]);
        return qb;
      });
    qb.where = chain('where', true);
    qb.andWhere = chain('andWhere', true);
    qb.leftJoinAndSelect = chain('leftJoinAndSelect');
    qb.leftJoin = chain('leftJoin');
    qb.select = chain('select');
    qb.orderBy = chain('orderBy');
    qb.addOrderBy = chain('addOrderBy');
    qb.skip = chain('skip');
    qb.take = chain('take');
    qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    qb.getMany = jest.fn().mockResolvedValue([]);
    qb.getOne = jest.fn().mockResolvedValue(null);
    return qb;
  };

  const divisionCcd = { id: CCD, companyId: COMPANY, divisionCode: 'DIV-CCD', name: 'Control Cable Division' } as Division;
  const divisionSpd = { id: SPD, companyId: COMPANY, divisionCode: 'DIV-SPD', name: 'Spoke Division' } as Division;

  const locationCcd = {
    id: LOC_CCD, companyId: COMPANY, divisionId: CCD, locationCode: 'GATE-01', name: 'Main Gate',
    status: LocationStatus.ACTIVE,
  } as Location;
  const locationSpd = {
    id: LOC_SPD, companyId: COMPANY, divisionId: SPD, locationCode: 'GATE-02', name: 'Spoke Gate',
    status: LocationStatus.ACTIVE,
  } as Location;

  const hostCcd = {
    id: HOST_CCD, companyId: COMPANY, employeeCode: '00400218', firstName: 'Muhammad', lastName: 'Zeeshan',
    status: 'ACTIVE', department: { id: 'd', name: 'Cutting & Packing', divisionId: CCD },
  } as unknown as HrEmployee;
  const hostSpd = {
    id: HOST_SPD, companyId: COMPANY, employeeCode: '00400264', firstName: 'Afroze', lastName: null,
    status: 'ACTIVE', department: { id: 'd2', name: 'Spoke', divisionId: SPD },
  } as unknown as HrEmployee;

  const baseDto: CreateVisitorEntryDto = {
    divisionId: CCD,
    locationId: LOC_CCD,
    visitorName: 'Muhammad Test',
    cnic: '12345-1234567-1',
    mobile: '0300-1234567',
    visitorCompany: 'PakWiz Trading',
    hostEmployeeId: HOST_CCD,
  };

  beforeAll(() => {
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p17-visitor-photos-'));
    process.env.STORAGE_PATH = storageDir;
  });

  afterAll(() => {
    delete process.env.STORAGE_PATH;
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    visitorRepo = {
      create: jest.fn().mockImplementation((input: any) => ({ ...input })),
      save: jest.fn().mockImplementation(async (row: any) => ({ ...row, id: ENTRY })),
      findOne: jest.fn(),
      // Prompt #18 §15 — the exit transition is ONE conditional UPDATE; the
      // mock reports how many rows the WHERE clause actually matched.
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };
    locationRepo = { findOne: jest.fn(), createQueryBuilder: jest.fn() };
    divisionRepo = { findOne: jest.fn() };
    employeeRepo = { findOne: jest.fn(), createQueryBuilder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitorEntryService,
        { provide: getRepositoryToken(VisitorEntry), useValue: visitorRepo },
        { provide: getRepositoryToken(Location), useValue: locationRepo },
        { provide: getRepositoryToken(Division), useValue: divisionRepo },
        { provide: getRepositoryToken(HrEmployee), useValue: employeeRepo },
        { provide: ActivityLogService, useValue: { log: jest.fn().mockResolvedValue(null) } },
      ],
    }).compile();

    service = module.get<VisitorEntryService>(VisitorEntryService);

    divisionRepo.findOne.mockImplementation((args: any) =>
      Promise.resolve(args.where.id === CCD ? divisionCcd : args.where.id === SPD ? divisionSpd : null),
    );
    locationRepo.findOne.mockImplementation((args: any) =>
      Promise.resolve(args.where.id === LOC_CCD ? locationCcd : args.where.id === LOC_SPD ? locationSpd : null),
    );
    employeeRepo.findOne.mockImplementation((args: any) =>
      Promise.resolve(args.where.id === HOST_CCD ? hostCcd : args.where.id === HOST_SPD ? hostSpd : null),
    );
  });

  // ── 1 ────────────────────────────────────────────────────────────────────
  it('1. lets an authorized user create a visitor entry', async () => {
    const saved = await service.create(baseDto, COMPANY, USER, [CCD]);

    expect(saved).toMatchObject({
      companyId: COMPANY,
      divisionId: CCD,
      locationId: LOC_CCD,
      visitorName: 'Muhammad Test',
      hostEmployeeId: HOST_CCD,
      status: VisitorEntryStatus.PENDING,
      createdBy: USER,
    });
    expect(visitorRepo.save).toHaveBeenCalledTimes(1);
  });

  // ── 2 ────────────────────────────────────────────────────────────────────
  it('2. rejects a create for a division outside the authorized set (403)', async () => {
    await expect(
      service.create({ ...baseDto, divisionId: SPD, locationId: LOC_SPD, hostEmployeeId: HOST_SPD }, COMPANY, USER, [CCD]),
    ).rejects.toThrow(ForbiddenException);

    // Rejected before anything is read or written.
    expect(visitorRepo.save).not.toHaveBeenCalled();
    expect(divisionRepo.findOne).not.toHaveBeenCalled();
  });

  // ── 3 / 4 ────────────────────────────────────────────────────────────────
  it('3+4. lists visitors and filters the query to the authorized divisions', async () => {
    const qb = makeQb();
    visitorRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.findAll({ companyId: COMPANY, allowedDivisionIds: [CCD] });

    expect(result).toEqual({ data: [], total: 0 });
    expect(qb.getManyAndCount).toHaveBeenCalledTimes(1);

    const divisionClause = qb.whereCalls.find(([sql]: [string, any]) =>
      sql.includes('ve.divisionId IN (:...allowedDivisionIds)'),
    );
    expect(divisionClause).toBeDefined();
    expect(divisionClause![1].allowedDivisionIds).toEqual([CCD]);
  });

  it('3+4b. does not add a division filter for an unrestricted caller', async () => {
    const qb = makeQb();
    visitorRepo.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ companyId: COMPANY });

    expect(qb.whereCalls.some(([sql]: [string, any]) => sql.includes('divisionId IN'))).toBe(false);
  });

  it('4c. denies every row when the effective division set is empty', async () => {
    const qb = makeQb();
    visitorRepo.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ companyId: COMPANY, allowedDivisionIds: [] });

    expect(qb.whereCalls.some(([sql]: [string, any]) => sql.trim() === '1 = 0')).toBe(true);
  });

  // ── 5 / 6 ────────────────────────────────────────────────────────────────
  it('5. refuses a visitor id that belongs to an unauthorized division (403)', async () => {
    visitorRepo.findOne.mockResolvedValue({
      id: ENTRY, companyId: COMPANY, divisionId: SPD, locationId: LOC_SPD, cnic: '12345-1234567-1',
      division: divisionSpd, location: locationSpd,
    });

    await expect(service.findOne(ENTRY, COMPANY, [CCD])).rejects.toThrow(ForbiddenException);
    expect(visitorRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ENTRY, companyId: COMPANY } }));
  });

  it('6. returns the full record to an authorized caller', async () => {
    visitorRepo.findOne.mockResolvedValue({
      id: ENTRY, companyId: COMPANY, divisionId: CCD, locationId: LOC_CCD, cnic: '12345-1234567-1',
      visitorName: 'Muhammad Test', photoPath: 'visitors/x/y/z.jpg',
      division: divisionCcd, location: locationCcd,
    });

    const detail = await service.findOne(ENTRY, COMPANY, [CCD]);

    expect(detail.id).toBe(ENTRY);
    // Detail keeps the CNIC (§14) but never leaks the storage path (§19).
    expect(detail.cnic).toBe('12345-1234567-1');
    expect(detail.photoPath).toBeUndefined();
    expect(detail.photoUrl).toBe(`/visitor/entries/${ENTRY}/photo`);
  });

  it('5b. returns 404 for an unknown / malformed entry id', async () => {
    visitorRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne('not-a-uuid', COMPANY, [CCD])).rejects.toThrow(NotFoundException);
    await expect(service.findOne(ENTRY, COMPANY, [CCD])).rejects.toThrow(NotFoundException);
  });

  // ── 7 / 8 / 9 ────────────────────────────────────────────────────────────
  it('7+9. generates Time-In on the server and stores status PENDING with time_out NULL', async () => {
    const before = Date.now();
    const saved = await service.create(baseDto, COMPANY, USER, [CCD]);
    const after = Date.now();

    expect(saved.timeIn).toBeInstanceOf(Date);
    expect(saved.timeIn.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(saved.timeIn.getTime()).toBeLessThanOrEqual(after + 1000);
    expect(saved.status).toBe(VisitorEntryStatus.PENDING);
    expect(saved.timeOut).toBeNull();
  });

  it('8. ignores a client-supplied time_in / status / host snapshot', async () => {
    const rogue = {
      ...baseDto,
      timeIn: new Date('1999-01-01T00:00:00Z'),
      timeOut: new Date('1999-01-01T01:00:00Z'),
      status: 'COMPLETED',
      hostNameSnapshot: 'Someone Else',
      companyId: 'another-company',
    } as unknown as CreateVisitorEntryDto;

    const saved = await service.create(rogue, COMPANY, USER, [CCD]);

    expect(saved.timeIn.getTime()).not.toEqual((rogue as any).timeIn.getTime());
    expect(saved.status).toBe(VisitorEntryStatus.PENDING);
    expect(saved.timeOut).toBeNull();
    expect(saved.hostNameSnapshot).toBe('Muhammad Zeeshan');
    expect(saved.companyId).toBe(COMPANY);
  });

  it('keeps time_out reserved for Prompt #18 (column exists, value is null)', async () => {
    const saved = await service.create(baseDto, COMPANY, USER, [CCD]);
    expect(saved).toHaveProperty('timeOut');
    expect(saved.timeOut).toBeNull();
  });

  // ── 10 ───────────────────────────────────────────────────────────────────
  it('10. rejects a location that belongs to a different division (400)', async () => {
    await expect(
      service.create({ ...baseDto, locationId: LOC_SPD }, COMPANY, USER, [CCD, SPD]),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.create({ ...baseDto, locationId: LOC_SPD }, COMPANY, USER, [CCD, SPD]),
    ).rejects.toThrow(/does not belong to the selected division/i);
    expect(visitorRepo.save).not.toHaveBeenCalled();
  });

  it('10b. rejects a location outside the caller company / an unknown division', async () => {
    await expect(service.create(baseDto, COMPANY, USER, [CCD])).resolves.toBeDefined();

    locationRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.create(baseDto, COMPANY, USER, [CCD])).rejects.toThrow(/location does not exist/i);

    divisionRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.create(baseDto, COMPANY, USER, [CCD])).rejects.toThrow(/division does not exist/i);
  });

  // ── 11 ───────────────────────────────────────────────────────────────────
  it('11. validates the host: unknown, inactive and cross-division hosts are rejected', async () => {
    employeeRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.create(baseDto, COMPANY, USER, [CCD])).rejects.toThrow(/does not exist/i);

    employeeRepo.findOne.mockResolvedValueOnce({ ...hostCcd, status: 'TERMINATED' });
    await expect(service.create(baseDto, COMPANY, USER, [CCD])).rejects.toThrow(/not an active employee/i);

    await expect(
      service.create({ ...baseDto, hostEmployeeId: HOST_SPD }, COMPANY, USER, [CCD]),
    ).rejects.toThrow(ForbiddenException);

    await expect(service.create(baseDto, COMPANY, USER, [CCD])).resolves.toBeDefined();
  });

  // ── 11 / 13 — host lookup is division filtered too ───────────────────────
  it('finds hosts only inside the authorized divisions', async () => {
    const qb = makeQb();
    employeeRepo.createQueryBuilder.mockReturnValue(qb);
    qb.getMany.mockResolvedValue([hostCcd]);

    const hosts = await service.findHosts(COMPANY, [CCD], { search: 'Zee' });

    expect(hosts).toEqual([
      {
        id: HOST_CCD,
        employeeCode: '00400218',
        name: 'Muhammad Zeeshan',
        department: 'Cutting & Packing',
        divisionId: CCD,
      },
    ]);
    const clause = qb.whereCalls.find(([sql]: [string, any]) =>
      sql.includes('dept.divisionId IN (:...allowedDivisionIds)'),
    );
    expect(clause![1].allowedDivisionIds).toEqual([CCD]);
  });

  // ── list privacy (§13 / §19) ─────────────────────────────────────────────
  it('masks the CNIC in list rows and never returns the photo storage path', async () => {
    const qb = makeQb();
    visitorRepo.createQueryBuilder.mockReturnValue(qb);
    qb.getManyAndCount.mockResolvedValue([
      [{
        id: ENTRY, companyId: COMPANY, divisionId: CCD, locationId: LOC_CCD,
        cnic: '12345-1234567-1', visitorName: 'Muhammad Test', photoPath: 'visitors/a/b/c.jpg',
        division: divisionCcd, location: locationCcd,
      }],
      1,
    ]);

    const { data } = await service.findAll({ companyId: COMPANY });

    expect(data[0].cnic).toBe('12345-*******-1');
    expect(data[0].photoPath).toBeUndefined();
    expect(data[0].hasPhoto).toBe(true);
  });

  // ── 14 — photo upload ────────────────────────────────────────────────────
  describe('visitor photo', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]);

    beforeEach(() => {
      visitorRepo.findOne.mockResolvedValue({
        id: ENTRY, companyId: COMPANY, divisionId: CCD, locationId: LOC_CCD,
        visitorName: 'Muhammad Test', photoPath: null, photoMime: null,
        division: divisionCcd, location: locationCcd,
      });
    });

    it('stores an uploaded photo inside STORAGE_PATH and returns the authorised URL', async () => {
      const detail = await service.savePhoto(ENTRY, COMPANY, USER, {
        mimetype: 'image/jpeg', originalname: 'visitor.jpg', buffer: jpeg,
      }, [CCD]);

      expect(detail.photoUrl).toBe(`/visitor/entries/${ENTRY}/photo`);
      // The storage path is an internal detail — never returned to a client.
      expect(detail.photoPath).toBeUndefined();

      const dir = path.join(storageDir, 'visitors', COMPANY, ENTRY);
      const files = fs.readdirSync(dir);
      expect(files).toHaveLength(1);
      expect(fs.readFileSync(path.join(dir, files[0]))).toEqual(jpeg);
    });

    it('rejects a non-image upload and an empty payload', async () => {
      await expect(
        service.savePhoto(ENTRY, COMPANY, USER, { mimetype: 'text/plain', buffer: Buffer.from('hi') }, [CCD]),
      ).rejects.toThrow(/JPEG, PNG or WebP/i);

      await expect(service.savePhoto(ENTRY, COMPANY, USER, undefined, [CCD])).rejects.toThrow(/file is required/i);
    });

    it('refuses to serve a photo from an unauthorized division', async () => {
      visitorRepo.findOne.mockResolvedValue({
        id: ENTRY, companyId: COMPANY, divisionId: SPD, photoPath: 'visitors/a/b/c.jpg',
        division: divisionSpd, location: locationSpd,
      });

      await expect(service.resolvePhoto(ENTRY, COMPANY, [CCD])).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // Prompt #18 §27 — Visitor Exit / Time-Out
  //
  //   1  PENDING visitor can be checked out
  //   2  Time-Out is generated server-side
  //   3  a client cannot override the Time-Out (only server-owned columns are written)
  //   4  status moves PENDING → COMPLETED
  //   5  a COMPLETED visitor cannot be checked out again
  //   6  the original Time-Out is never overwritten
  //   7  an unauthorized division cannot check the visitor out
  //   8  an unknown id in an unauthorized division is 403, not 409
  //   9  a missing / malformed id is 404
  //   10 the Pending filter also requires time_out IS NULL
  //   11 the Completed filter also requires time_out IS NOT NULL
  //   12 exit audit (exitedBy + activity log) is recorded
  //   13 a concurrent / double checkout is refused, not written twice
  //   14 the Prompt #17 create → exit lifecycle still works end to end
  //   15 the division scope of Prompt #16 is unchanged (create + exit)
  // =========================================================================
  describe('Prompt #18 — visitor exit / Time-Out', () => {
    const pendingEntry = (overrides: Record<string, any> = {}) => ({
      id: ENTRY,
      companyId: COMPANY,
      divisionId: CCD,
      locationId: LOC_CCD,
      visitorName: 'Muhammad Test',
      cnic: '12345-1234567-1',
      hostNameSnapshot: 'Muhammad Zeeshan',
      timeIn: new Date('2026-09-28T10:15:00.000Z'),
      timeOut: null,
      status: VisitorEntryStatus.PENDING,
      exitedBy: null,
      createdBy: USER,
      createdAt: new Date('2026-09-28T10:15:00.000Z'),
      updatedBy: USER,
      updatedAt: new Date('2026-09-28T10:15:00.000Z'),
      photoPath: null,
      photoMime: null,
      division: divisionCcd,
      location: locationCcd,
      ...overrides,
    });

    const completedEntry = (overrides: Record<string, any> = {}) => {
      const exitTime = new Date('2026-09-28T13:40:00.000Z');
      return pendingEntry({
        timeOut: exitTime,
        status: VisitorEntryStatus.COMPLETED,
        exitedBy: USER,
        updatedAt: exitTime,
        ...overrides,
      });
    };

    /** [where, set] of the single conditional UPDATE the service issued. */
    const updateCall = () => visitorRepo.update.mock.calls[0] as [any, any];

    beforeEach(() => {
      visitorRepo.update.mockResolvedValue({ affected: 1 });
    });

    // ── 1 / 2 / 3 / 4 / 12 ──────────────────────────────────────────────────
    it('1+2+4+12. checks a PENDING visitor out with a server-generated Time-Out and exit audit', async () => {
      const exitTime = new Date('2026-09-28T13:40:00.000Z');
      const logged: any[] = [];
      (service as any).activityLog.log = jest.fn(async (payload: any) => {
        logged.push(payload);
        return null;
      });

      visitorRepo.findOne
        .mockResolvedValueOnce(pendingEntry()) // existence + authorization check
        .mockResolvedValueOnce(completedEntry({ timeOut: exitTime, updatedAt: exitTime })); // re-read

      const before = Date.now();
      const result = await service.checkOut(ENTRY, COMPANY, USER, [CCD]);
      const after = Date.now();

      // 2 — the Time-Out came from the server clock, inside the call window.
      const [, set] = updateCall();
      expect(set.timeOut).toBeInstanceOf(Date);
      expect(set.timeOut.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(set.timeOut.getTime()).toBeLessThanOrEqual(after + 1000);

      // 4 — PENDING → COMPLETED, and 12 — the exit actor is preserved.
      expect(set.status).toBe(VisitorEntryStatus.COMPLETED);
      expect(set.exitedBy).toBe(USER);
      expect(set.updatedBy).toBe(USER);

      // 3 — nothing server-owned beyond the checkout fields is written, and
      //      company / division / location / identity / time_in are not touched.
      expect(Object.keys(set).sort()).toEqual(['exitedBy', 'status', 'timeOut', 'updatedBy']);
      for (const forbidden of ['timeIn', 'companyId', 'divisionId', 'locationId', 'visitorName', 'hostEmployeeId']) {
        expect(set).not.toHaveProperty(forbidden);
      }
      // Read-modify-write would race (§15) — the transition is one UPDATE.
      expect(visitorRepo.save).not.toHaveBeenCalled();

      // 12 — the audit trail names the actor and the action.
      expect(logged).toHaveLength(1);
      expect(logged[0]).toEqual(
        expect.objectContaining({
          actorUserId: USER,
          action: 'UPDATE',
          targetType: 'visitor_entry',
          targetId: ENTRY,
        }),
      );
      expect(logged[0].details).toMatch(/exit/i);
      // Personal data is never written to the audit log (Prompt #17 §19).
      expect(JSON.stringify(logged[0])).not.toContain('12345-1234567-1');

      // 24 — the response is the same shape the detail endpoint returns.
      expect(result).toMatchObject({
        id: ENTRY,
        status: VisitorEntryStatus.COMPLETED,
        timeOut: exitTime,
        exitedBy: USER,
        cnic: '12345-1234567-1',
        hostNameSnapshot: 'Muhammad Zeeshan',
        division: { id: CCD, divisionCode: 'DIV-CCD' },
        location: { id: LOC_CCD, locationCode: 'GATE-01' },
      });
    });

    // ── 15 / 3 — the WHERE clause is the concurrency + scope guard ──────────
    it('15+3. guards the update with the company, the open status and a NULL Time-Out', async () => {
      visitorRepo.findOne.mockResolvedValue(pendingEntry());

      await service.checkOut(ENTRY, COMPANY, USER, [CCD]);

      const [where] = updateCall();
      expect(where.id).toBe(ENTRY);
      // Another company's row can never be touched.
      expect(where.companyId).toBe(COMPANY);
      // Only an open visit is eligible …
      expect(where.status.type).toBe('in');
      expect(where.status.value).toEqual([VisitorEntryStatus.PENDING, VisitorEntryStatus.INSIDE]);
      // … and only while it has no Time-Out, which is what makes a second
      // concurrent UPDATE match 0 rows.
      expect(where.timeOut.type).toBe('isNull');
    });

    // ── 5 / 6 ─────────────────────────────────────────────────────────────
    it('5+6. refuses a visitor who already checked out and never overwrites the first Time-Out', async () => {
      visitorRepo.findOne.mockResolvedValue(completedEntry());

      await expect(service.checkOut(ENTRY, COMPANY, USER, [CCD])).rejects.toThrow(ConflictException);
      await expect(service.checkOut(ENTRY, COMPANY, USER, [CCD])).rejects.toThrow(
        /already checked out/i,
      );
      // A business-state conflict is a 409, never a 500, and nothing is written.
      expect(visitorRepo.update).not.toHaveBeenCalled();
      expect(visitorRepo.save).not.toHaveBeenCalled();
    });

    it('5b. refuses a row whose Time-Out is set even if the status still says PENDING', async () => {
      // Defence in depth: the filter definition is status AND time_out IS NULL.
      visitorRepo.findOne.mockResolvedValue(
        pendingEntry({ timeOut: new Date('2026-09-28T13:40:00.000Z') }),
      );

      await expect(service.checkOut(ENTRY, COMPANY, USER, [CCD])).rejects.toThrow(ConflictException);
      expect(visitorRepo.update).not.toHaveBeenCalled();
    });

    it('9. keeps a CANCELLED entry out of the checkout transition (§9)', async () => {
      visitorRepo.findOne.mockResolvedValue(pendingEntry({ status: VisitorEntryStatus.CANCELLED }));

      await expect(service.checkOut(ENTRY, COMPANY, USER, [CCD])).rejects.toThrow(ConflictException);
      expect(visitorRepo.update).not.toHaveBeenCalled();
    });

    it('allows an INSIDE visit to be completed (the status CHECK already allows it)', async () => {
      visitorRepo.findOne
        .mockResolvedValueOnce(pendingEntry({ status: VisitorEntryStatus.INSIDE }))
        .mockResolvedValueOnce(completedEntry({ status: VisitorEntryStatus.COMPLETED }));

      await expect(service.checkOut(ENTRY, COMPANY, USER, [CCD])).resolves.toMatchObject({
        status: VisitorEntryStatus.COMPLETED,
      });
    });

    // ── 13 ────────────────────────────────────────────────────────────────
    it('13. answers a concurrent / double checkout with a conflict and writes only once', async () => {
      // The second request passes its own state check (it read PENDING before the
      // first UPDATE committed) but its conditional UPDATE then matches 0 rows —
      // exactly the double-click / two-gate-officer race.
      visitorRepo.update.mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 });
      visitorRepo.findOne
        .mockResolvedValueOnce(pendingEntry()) // request 1 — pre-check read
        .mockResolvedValueOnce(completedEntry()) // request 1 — re-read after winning
        .mockResolvedValueOnce(pendingEntry()) // request 2 — pre-check read (stale)
        .mockResolvedValueOnce(completedEntry()) // request 2 — re-read after losing
        .mockResolvedValue(completedEntry()); // any later request sees the closed visit

      await service.checkOut(ENTRY, COMPANY, USER, [CCD]);
      await expect(service.checkOut(ENTRY, COMPANY, USER, [CCD])).rejects.toThrow(ConflictException);
      // A later third call is caught by the plain state check — still a 409.
      await expect(service.checkOut(ENTRY, COMPANY, USER, [CCD])).rejects.toThrow(/already checked out/i);

      expect(visitorRepo.update).toHaveBeenCalledTimes(2);
      // Exactly one successful write: the loser gets a controlled conflict and
      // the first Time-Out is left alone.
      expect(visitorRepo.save).not.toHaveBeenCalled();
    });

    it('13b. asks the caller to retry when the row is still open but was not updated', async () => {
      visitorRepo.update.mockResolvedValueOnce({ affected: 0 });
      visitorRepo.findOne
        .mockResolvedValueOnce(pendingEntry())
        .mockResolvedValueOnce(pendingEntry());

      await expect(service.checkOut(ENTRY, COMPANY, USER, [CCD])).rejects.toThrow(/try again/i);
    });

    // ── 7 / 8 / 9 ─────────────────────────────────────────────────────────
    it('7. refuses to check out a visitor in an unauthorized division (403) and writes nothing', async () => {
      visitorRepo.findOne.mockResolvedValue(
        pendingEntry({ divisionId: SPD, locationId: LOC_SPD, division: divisionSpd, location: locationSpd }),
      );

      await expect(service.checkOut(ENTRY, COMPANY, USER, [CCD])).rejects.toThrow(ForbiddenException);
      // Answered before the state check, so a guessed id is never confirmed.
      expect(visitorRepo.update).not.toHaveBeenCalled();
    });

    it('8. answers a foreign-division id with 403 and never leaks the visitor state', async () => {
      visitorRepo.findOne.mockResolvedValue(
        completedEntry({
          divisionId: SPD, locationId: LOC_SPD, division: divisionSpd, location: locationSpd,
        }),
      );

      await expect(service.checkOut(ENTRY, COMPANY, USER, [CCD])).rejects.toThrow(ForbiddenException);
      expect(visitorRepo.update).not.toHaveBeenCalled();
    });

    it('9b. answers a missing or malformed id with 404', async () => {
      visitorRepo.findOne.mockResolvedValue(null);
      await expect(service.checkOut('not-a-uuid', COMPANY, USER, [CCD])).rejects.toThrow(NotFoundException);
      await expect(service.checkOut(ENTRY, COMPANY, USER, [CCD])).rejects.toThrow(NotFoundException);
      expect(visitorRepo.update).not.toHaveBeenCalled();
    });

    it('denies every exit when the effective division set is empty (Prompt #16 §15)', async () => {
      visitorRepo.findOne.mockResolvedValue(pendingEntry());

      await expect(service.checkOut(ENTRY, COMPANY, USER, [])).rejects.toThrow(ForbiddenException);
      expect(visitorRepo.update).not.toHaveBeenCalled();
    });

    // ── 10 / 11 — status filters are defined by status AND time_out ────────
    it('10. the PENDING filter requires status = PENDING AND time_out IS NULL', async () => {
      const qb = makeQb();
      visitorRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ companyId: COMPANY, allowedDivisionIds: [CCD], status: VisitorEntryStatus.PENDING });

      const sql = qb.whereCalls.map(([clause]: [string, any]) => clause);
      expect(sql).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ve.status = :status'),
          've.timeOut IS NULL',
        ]),
      );
      expect(qb.whereCalls.find(([c]: [string, any]) => c === 've.status = :status')![1].status).toBe(
        VisitorEntryStatus.PENDING,
      );
    });

    it('11. the COMPLETED filter requires status = COMPLETED AND time_out IS NOT NULL', async () => {
      const qb = makeQb();
      visitorRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ companyId: COMPANY, allowedDivisionIds: [CCD], status: VisitorEntryStatus.COMPLETED });

      const sql = qb.whereCalls.map(([clause]: [string, any]) => clause);
      expect(sql).toEqual(
        expect.arrayContaining([
          expect.stringContaining('ve.status = :status'),
          've.timeOut IS NOT NULL',
        ]),
      );
    });

    it('leaves the unfiltered list alone (no implicit status or Time-Out clause)', async () => {
      const qb = makeQb();
      visitorRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ companyId: COMPANY, allowedDivisionIds: [CCD] });

      const sql = qb.whereCalls.map(([clause]: [string, any]) => clause);
      expect(sql.some((c: string) => c.includes('timeOut'))).toBe(false);
      expect(sql.some((c: string) => c.includes('ve.status'))).toBe(false);
    });

    // ── §19 current-day monitoring ─────────────────────────────────────────
    it('bounds "today" on the SERVER clock, not on anything the client sent', async () => {
      const qb = makeQb();
      visitorRepo.createQueryBuilder.mockReturnValue(qb);

      await service.findAll({ companyId: COMPANY, allowedDivisionIds: [CCD], today: true });

      const clause = qb.whereCalls.find(([sql]: [string, any]) => sql.includes('ve.timeIn >='));
      expect(clause).toBeDefined();
      const { startOfToday, startOfTomorrow } = clause![1];
      expect(startOfToday).toBeInstanceOf(Date);
      expect(startOfTomorrow).toBeInstanceOf(Date);
      expect(startOfTomorrow.getTime()).toBeGreaterThan(startOfToday.getTime());
      expect(startOfTomorrow.getTime() - startOfToday.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    // ── 10/20 — the client gets the derived on-site truth ──────────────────
    it('marks a visitor as on site only while PENDING with a NULL Time-Out', async () => {
      const qb = makeQb();
      visitorRepo.createQueryBuilder.mockReturnValue(qb);
      qb.getManyAndCount.mockResolvedValue([
        [
          pendingEntry(),
          pendingEntry({ id: 'other', status: VisitorEntryStatus.PENDING, timeOut: new Date() }),
          completedEntry(),
        ],
        3,
      ]);

      const { data } = await service.findAll({ companyId: COMPANY });

      expect(data[0].onSite).toBe(true);
      expect(data[1].onSite).toBe(false); // PENDING but already has a Time-Out
      expect(data[2].onSite).toBe(false); // COMPLETED
      expect(data[2].exitedBy).toBe(USER);
    });

    // ── 14 — the whole lifecycle on the real service ───────────────────────
    it('14. runs the Prompt #17 create → exit lifecycle on the same service', async () => {
      visitorRepo.findOne.mockResolvedValue(pendingEntry());

      const created = await service.create(baseDto, COMPANY, USER, [CCD]);
      expect(created).toMatchObject({ status: VisitorEntryStatus.PENDING, timeOut: null });
      // A new visit has no exit actor — the column stays NULL until checkout.
      expect(created.exitedBy ?? null).toBeNull();

      visitorRepo.findOne
        .mockResolvedValueOnce(created)
        .mockResolvedValueOnce({ ...created, status: VisitorEntryStatus.COMPLETED, timeOut: new Date(), exitedBy: USER });

      const checkedOut = await service.checkOut(created.id, COMPANY, USER, [CCD]);
      expect(checkedOut.status).toBe(VisitorEntryStatus.COMPLETED);
      expect(checkedOut.timeOut).toBeInstanceOf(Date);
      expect(visitorRepo.update).toHaveBeenCalledTimes(1);
    });
  });
});
