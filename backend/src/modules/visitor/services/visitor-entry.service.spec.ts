import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
});
