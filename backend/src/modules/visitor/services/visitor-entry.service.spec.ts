import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { VisitorEntryService, REFERENCE_MAX_ATTEMPTS } from './visitor-entry.service';
import { VisitorEntry, VisitorEntryStatus, Location, LocationStatus } from '../entities';
import { Division } from '../../organization/entities/division.entity';
import { Company } from '../../organization/entities/company.entity';
import { HrEmployee } from '../../hr/entities/hr-employee.entity';
import { ActivityLogService } from '../../audit/services/activity-log.service';
import { CreateVisitorEntryDto, MAX_SIGNATURE_BYTES } from '../dto';

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
  let companyRepo: any;
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
      // Prompt #19 §5 — create() allocates the reception reference by asking the
      // repository for the highest existing one. The default builder returns no
      // previous row, so the first reference of a company is VIS-<year>-000001.
      // Tests that care about the sequence override this.
      createQueryBuilder: jest.fn().mockImplementation(() => makeQb()),
    };
    locationRepo = { findOne: jest.fn(), createQueryBuilder: jest.fn() };
    divisionRepo = { findOne: jest.fn() };
    // Prompt #19 — the slip prints the real company legal name from the database
    // instead of a hard-coded string.
    companyRepo = { findOne: jest.fn() };
    employeeRepo = { findOne: jest.fn(), createQueryBuilder: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitorEntryService,
        { provide: getRepositoryToken(VisitorEntry), useValue: visitorRepo },
        { provide: getRepositoryToken(Location), useValue: locationRepo },
        { provide: getRepositoryToken(Division), useValue: divisionRepo },
        { provide: getRepositoryToken(Company), useValue: companyRepo },
        { provide: getRepositoryToken(HrEmployee), useValue: employeeRepo },
        { provide: ActivityLogService, useValue: { log: jest.fn().mockResolvedValue(null) } },
      ],
    }).compile();

    service = module.get<VisitorEntryService>(VisitorEntryService);

    companyRepo.findOne.mockResolvedValue({
      id: COMPANY,
      companyCode: 'PWI',
      legalName: 'Pakistan Wire Industries (Pvt) Ltd.',
      tradeName: 'PWI',
    });

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

    // §6 — a client-declared Content-Type proves nothing. Verified live against
    // the running server before this guard existed: a body of plain text sent as
    // `image/jpeg` returned 201 and was written into the private photo store,
    // which the printed slip then inlines.
    it('rejects bytes that are not the image the client declared', async () => {
      const dir = path.join(storageDir, 'visitors', COMPANY, ENTRY);
      const filesIn = () => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
      // The shared storage dir is not wiped between tests, so the assertion is
      // on the DELTA — a rejected upload must add nothing, not "empty the dir".
      const before = filesIn();

      const lies: Array<[string, Buffer, RegExp]> = [
        ['text declared as a JPEG', Buffer.from('this is not an image at all'), /not a readable JPEG, PNG or WebP/i],
        ['an empty file declared as a PNG', Buffer.alloc(0), /not a readable JPEG, PNG or WebP/i],
        ['a three-byte stub that is only the JPEG SOI marker', Buffer.from([0xff, 0xd8, 0xff]), /not a readable JPEG, PNG or WebP/i],
        ['an SVG (scriptable, so never acceptable here) declared as a WebP', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), /not a readable JPEG, PNG or WebP/i],
        ['a PDF declared as a PNG', Buffer.from('%PDF-1.7\n%...'), /not a readable JPEG, PNG or WebP/i],
      ];
      for (const [label, buffer, expected] of lies) {
        // `.rejects.toThrow` takes no message argument, so the label is asserted
        // alongside: a failure must say WHICH lie was believed.
        await expect(
          service.savePhoto(ENTRY, COMPANY, USER, { mimetype: 'image/jpeg', buffer }, [CCD]),
        ).rejects.toThrow(expected);
        if (visitorRepo.save.mock.calls.length) throw new Error(`the "${label}" upload was accepted`);
      }

      // The check happens before the file is created, so a rejected request
      // leaves no residue at all — not even a temporary file.
      expect(filesIn()).toEqual(before);
      expect(visitorRepo.save).not.toHaveBeenCalled();
    });

    it('records the mime the CONTENT proves, not the one the client claimed', async () => {
      // Declared as a JPEG, actually a PNG: the stored extension and the recorded
      // mime must both follow the bytes, so the slip and the photo endpoint can
      // never be handed a file that lies about its own type.
      const pngBytes = Buffer.concat([
        Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex'),
        Buffer.alloc(8),
      ]);
      const dir = path.join(storageDir, 'visitors', COMPANY, ENTRY);
      const before = fs.existsSync(dir) ? fs.readdirSync(dir) : [];

      await service.savePhoto(ENTRY, COMPANY, USER, { mimetype: 'image/jpeg', buffer: pngBytes }, [CCD]);

      // The repository is mocked, so the persisted payload IS the contract here.
      const persisted = visitorRepo.save.mock.calls[0][0];
      expect(persisted.photoMime).toBe('image/png');
      expect(persisted.photoPath).toMatch(/\.png$/);
      const added = fs.readdirSync(dir).filter((f) => !before.includes(f));
      expect(added).toHaveLength(1);
      expect(added[0].endsWith('.png')).toBe(true);
    });

    it('accepts a real PNG and a real WebP declared correctly', async () => {
      const webp = Buffer.concat([
        Buffer.from('5249464600000000', 'hex'), // "RIFF" + chunk size
        Buffer.from('57454250', 'hex'), //         "WEBP"
        Buffer.alloc(8),
      ]);
      const png = Buffer.concat([
        Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex'),
        Buffer.alloc(8),
      ]);
      const dir = path.join(storageDir, 'visitors', COMPANY, ENTRY);
      const before = fs.existsSync(dir) ? fs.readdirSync(dir) : [];

      // Neither format may be rejected by the content check.
      await expect(
        service.savePhoto(ENTRY, COMPANY, USER, { mimetype: 'image/webp', buffer: webp }, [CCD]),
      ).resolves.toBeDefined();
      expect(fs.readdirSync(dir).filter((f) => f.endsWith('.webp'))).toHaveLength(1);

      await expect(
        service.savePhoto(ENTRY, COMPANY, USER, { mimetype: 'image/png', buffer: png }, [CCD]),
      ).resolves.toBeDefined();

      // The second upload replaces the first, exactly as it always has — the
      // content check must not change that lifecycle.
      const added = fs.readdirSync(dir).filter((f) => !before.includes(f));
      expect(added).toHaveLength(1);
      expect(added[0].endsWith('.png')).toBe(true);
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

  // =========================================================================
  // PROMPT #19 — VISITOR SLIP + HOST CONFIRMATION (§31)
  //
  //   1  authorized user can retrieve slip data
  //   2  unauthorized division cannot retrieve slip data
  //   3  slip data contains every field the printed document needs
  //   4  the visitor reference is stable and server-generated
  //   5  a PENDING visitor is printable
  //   6  a COMPLETED visitor stays printable, with the real Time-Out
  //   7  host confirmation succeeds for an authorized user
  //   8  host confirmation records confirmed_by
  //   9  host confirmation records confirmed_at
  //   10 host confirmation does NOT change the visitor status
  //   11 host confirmation does NOT create a Time-Out
  //   12 an already confirmed visitor cannot be confirmed again
  //   13 an unauthorized user cannot confirm a host visit
  //   14 the signature is stored privately, never as base64 in the row
  //   15 existing Time-Out behaviour is unchanged after a confirmation
  //   16 existing Visitor Entry behaviour is unchanged (a reference is added)
  //   17 division-scope authorization is unchanged
  // =========================================================================
  describe('Prompt #19 — visitor slip + host confirmation', () => {
    const CONFIRMING_USER = 'u1000000-0000-0000-0000-0000000000ff';
    const confirmedAt = new Date('2026-09-28T14:05:00.000Z');

    /** A 1×1 PNG — the smallest valid file the signature path will accept. */
    const PNG_1PX =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    const entry = (overrides: Record<string, any> = {}) => ({
      id: ENTRY,
      visitorReference: 'VIS-2026-000042',
      companyId: COMPANY,
      divisionId: CCD,
      locationId: LOC_CCD,
      visitorName: 'Muhammad Test',
      cnic: '12345-1234567-1',
      mobile: '0300-1234567',
      visitorCompany: 'PakWiz Trading',
      hostEmployeeId: HOST_CCD,
      hostNameSnapshot: 'Muhammad Zeeshan',
      hostEmployee: hostCcd,
      timeIn: new Date('2026-09-28T10:15:00.000Z'),
      timeOut: null,
      status: VisitorEntryStatus.PENDING,
      hostConfirmed: false,
      hostConfirmedAt: null,
      hostConfirmedBy: null,
      signaturePath: null,
      signatureMime: null,
      signatureCapturedAt: null,
      signatureCapturedBy: null,
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

    /** [where, set] of the single conditional UPDATE the service issued. */
    const updateCall = (index = 0) => visitorRepo.update.mock.calls[index] as [any, any];

    beforeEach(() => {
      visitorRepo.update.mockResolvedValue({ affected: 1 });
    });

    // ── 1 / 2 / 3 / 5 / 6 ───────────────────────────────────────────────────
    describe('the print payload', () => {
      it('1. returns slip data to an authorized caller', async () => {
        visitorRepo.findOne.mockResolvedValue(entry());

        const slip = await service.getSlip(ENTRY, COMPANY, [CCD]);

        expect(slip.visitorReference).toBe('VIS-2026-000042');
        expect(slip.visitorName).toBe('Muhammad Test');
        expect(visitorRepo.findOne).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: ENTRY, companyId: COMPANY } }),
        );
      });

      it('2. refuses slip data for a division outside the authorized set (403)', async () => {
        visitorRepo.findOne.mockResolvedValue(
          entry({ divisionId: SPD, locationId: LOC_SPD, division: divisionSpd, location: locationSpd }),
        );

        await expect(service.getSlip(ENTRY, COMPANY, [CCD])).rejects.toThrow(ForbiddenException);
      });

      it('2b. answers a guessed id with 404, never a slip payload', async () => {
        visitorRepo.findOne.mockResolvedValue(null);

        await expect(service.getSlip(ENTRY, COMPANY, [CCD])).rejects.toThrow(NotFoundException);
        await expect(service.getSlip('not-a-uuid', COMPANY, [CCD])).rejects.toThrow(NotFoundException);
      });

      it('3. carries every field the printed slip needs', async () => {
        visitorRepo.findOne.mockResolvedValue(entry());

        const slip = await service.getSlip(ENTRY, COMPANY, [CCD]);

        // §4 — company, visitor, host, location, times, status, reference, audit.
        expect(slip.companyName).toBe('Pakistan Wire Industries (Pvt) Ltd.');
        expect(slip.companyCode).toBe('PWI');
        expect(slip).toMatchObject({
          visitorReference: 'VIS-2026-000042',
          visitorName: 'Muhammad Test',
          cnic: expect.any(String),
          mobile: '0300-1234567',
          visitorCompany: 'PakWiz Trading',
          hostName: 'Muhammad Zeeshan',
          hostDepartment: 'Cutting & Packing',
          status: VisitorEntryStatus.PENDING,
          createdBy: USER,
        });
        expect(slip.division).toEqual({ code: 'DIV-CCD', name: 'Control Cable Division' });
        expect(slip.location).toEqual({ code: 'GATE-01', name: 'Main Gate' });
        expect(slip.timeIn).toBeInstanceOf(Date);
        expect(slip.timeOut).toBeNull();
        expect(slip.createdAt).toBeInstanceOf(Date);
      });

      it('3b. masks the CNIC and never leaks an internal storage path (§30)', async () => {
        visitorRepo.findOne.mockResolvedValue(
          entry({ photoPath: 'visitors/company/entry/photo.jpg', photoMime: 'image/jpeg', signaturePath: 'visitors/company/entry/signature-x.png' }),
        );

        const slip = await service.getSlip(ENTRY, COMPANY, [CCD]);

        // The masked form the list already uses, never the stored plaintext.
        expect(slip.cnic).not.toBe('12345-1234567-1');
        expect(slip.cnic).toMatch(/\*/);
        // The private paths stay on the server; the client only learns that an
        // image exists and which AUTHORISED endpoint fetches it.
        expect(JSON.stringify(slip)).not.toContain('photo.jpg');
        expect(JSON.stringify(slip)).not.toContain('signature-x.png');
        expect(slip.hasPhoto).toBe(true);
        expect(slip.photoUrl).toBe(`/visitor/entries/${ENTRY}/photo`);
        expect(slip.hasSignature).toBe(true);
        expect(slip.signatureUrl).toBe(`/visitor/entries/${ENTRY}/signature`);
      });

      it('3c. states that host identity is NOT verified (§17)', async () => {
        visitorRepo.findOne.mockResolvedValue(entry());

        const slip = await service.getSlip(ENTRY, COMPANY, [CCD]);

        // Recorded as the acting ERP user; the host stays a separate field and
        // the system never claims the two are the same person.
        expect(slip.hostConfirmation.hostIdentityVerified).toBe(false);
        expect(slip.hostConfirmation.confirmedBy).toBeNull();
        expect(slip.hostName).toBe('Muhammad Zeeshan');
      });

      it('3d. prints a pending visitor with a NULL Time-Out (§27)', async () => {
        visitorRepo.findOne.mockResolvedValue(entry());

        const slip = await service.getSlip(ENTRY, COMPANY, [CCD]);

        expect(slip.timeOut).toBeNull();
        expect(slip.status).toBe(VisitorEntryStatus.PENDING);
      });

      it('5+6. prints a COMPLETED visitor with the stored Time-In AND Time-Out (§29)', async () => {
        const timeOut = new Date('2026-09-28T13:40:00.000Z');
        visitorRepo.findOne.mockResolvedValue(
          entry({ status: VisitorEntryStatus.COMPLETED, timeOut, exitedBy: USER }),
        );

        const slip = await service.getSlip(ENTRY, COMPANY, [CCD]);

        expect(slip.timeIn).toEqual(new Date('2026-09-28T10:15:00.000Z'));
        expect(slip.timeOut).toEqual(timeOut);
        expect(slip.status).toBe(VisitorEntryStatus.COMPLETED);
      });

      it('10. re-printing after exit still shows the stored host confirmation', async () => {
        visitorRepo.findOne.mockResolvedValue(
          entry({
            status: VisitorEntryStatus.COMPLETED,
            timeOut: new Date('2026-09-28T13:40:00.000Z'),
            hostConfirmed: true,
            hostConfirmedAt: confirmedAt,
            hostConfirmedBy: CONFIRMING_USER,
            signatureCapturedAt: confirmedAt,
            signatureCapturedBy: CONFIRMING_USER,
            signaturePath: 'visitors/c/e/signature-y.png',
            signatureMime: 'image/png',
          }),
        );

        const slip = await service.getSlip(ENTRY, COMPANY, [CCD]);

        expect(slip.hostConfirmation).toMatchObject({
          confirmed: true,
          confirmedAt,
          confirmedBy: CONFIRMING_USER,
          signatureCapturedAt: confirmedAt,
          signatureCapturedBy: CONFIRMING_USER,
        });
      });

      it('falls back to the ERP company name when the row has none', async () => {
        companyRepo.findOne.mockResolvedValue(null);
        visitorRepo.findOne.mockResolvedValue(entry());

        const slip = await service.getSlip(ENTRY, COMPANY, [CCD]);

        expect(slip.companyName).toBe('PAKISTAN WIRE INDUSTRIES (PVT) LTD.');
      });
    });

    // ── 7 / 8 / 9 / 10 / 11 / 12 ────────────────────────────────────────────
    describe('host confirmation', () => {
      it('7+8+9. confirms the visit and records who/when, on the server clock', async () => {
        const before = Date.now();
        visitorRepo.findOne
          .mockResolvedValueOnce(entry())
          .mockResolvedValueOnce(entry({ hostConfirmed: true, hostConfirmedAt: confirmedAt, hostConfirmedBy: CONFIRMING_USER }));

        const result = await service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD]);

        const [, patch] = updateCall();
        expect(patch.hostConfirmed).toBe(true);
        expect(patch.hostConfirmedBy).toBe(CONFIRMING_USER);
        expect(patch.hostConfirmedAt).toBeInstanceOf(Date);
        expect(patch.hostConfirmedAt.getTime()).toBeGreaterThanOrEqual(before);
        expect(result.hostConfirmed).toBe(true);
      });

      it('guards the transition on host_confirmed = FALSE (double-click safety)', async () => {
        visitorRepo.findOne.mockResolvedValue(entry());

        await service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD]);

        const [where] = updateCall();
        expect(where).toMatchObject({ id: ENTRY, companyId: COMPANY, hostConfirmed: false });
      });

      it('10+11. NEVER touches status, Time-In, Time-Out, division or location (§28)', async () => {
        visitorRepo.findOne
          .mockResolvedValueOnce(entry())
          .mockResolvedValueOnce(entry({ hostConfirmed: true, hostConfirmedAt: confirmedAt, hostConfirmedBy: CONFIRMING_USER }));

        await service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD]);

        const [where, patch] = updateCall();
        // The WHERE clause pins the identity of the visit...
        for (const key of ['status', 'timeOut', 'timeIn', 'divisionId', 'locationId', 'hostEmployeeId']) {
          expect(where).not.toHaveProperty(key);
        }
        // ...and the patch writes the confirmation columns and nothing else.
        expect(Object.keys(patch).sort()).toEqual([
          'hostConfirmed',
          'hostConfirmedAt',
          'hostConfirmedBy',
          'updatedBy',
        ]);
        expect(patch.timeOut).toBeUndefined();
        expect(patch.status).toBeUndefined();
        expect(visitorRepo.save).not.toHaveBeenCalled();
      });

      it('11b. a confirmed host is still an ON-SITE PENDING visitor', async () => {
        visitorRepo.findOne
          .mockResolvedValueOnce(entry())
          .mockResolvedValueOnce(entry({ hostConfirmed: true, hostConfirmedAt: confirmedAt, hostConfirmedBy: CONFIRMING_USER }));

        const result = await service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD]);

        expect(result.status).toBe(VisitorEntryStatus.PENDING);
        expect(result.timeOut).toBeNull();
        expect(result.onSite).toBe(true);
      });

      it('12. refuses a second confirmation with a conflict and writes nothing', async () => {
        visitorRepo.findOne.mockResolvedValue(
          entry({ hostConfirmed: true, hostConfirmedAt: confirmedAt, hostConfirmedBy: CONFIRMING_USER }),
        );

        await expect(service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD])).rejects.toThrow(
          ConflictException,
        );
        expect(visitorRepo.update).not.toHaveBeenCalled();
      });

      it('12b. answers a concurrent confirmation with a conflict and writes only once', async () => {
        visitorRepo.update.mockResolvedValueOnce({ affected: 1 }).mockResolvedValueOnce({ affected: 0 });
        visitorRepo.findOne
          .mockResolvedValueOnce(entry()) // request 1 — pre-check read
          .mockResolvedValueOnce(entry({ hostConfirmed: true, hostConfirmedAt: confirmedAt, hostConfirmedBy: CONFIRMING_USER })) // winner re-read
          .mockResolvedValueOnce(entry()) // request 2 — pre-check read (stale)
          .mockResolvedValueOnce(entry({ hostConfirmed: true, hostConfirmedAt: confirmedAt, hostConfirmedBy: CONFIRMING_USER })); // loser re-read

        await service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD]);
        await expect(service.confirmHostVisit(ENTRY, COMPANY, USER, [CCD])).rejects.toThrow(ConflictException);

        expect(visitorRepo.update).toHaveBeenCalledTimes(2);
      });

      it('12c. refuses to confirm a cancelled visitor entry', async () => {
        visitorRepo.findOne.mockResolvedValue(entry({ status: VisitorEntryStatus.CANCELLED }));

        await expect(service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD])).rejects.toThrow(
          /cancelled/i,
        );
        expect(visitorRepo.update).not.toHaveBeenCalled();
      });

      it('13. refuses an unauthorized division (403) and writes nothing', async () => {
        visitorRepo.findOne.mockResolvedValue(
          entry({ divisionId: SPD, locationId: LOC_SPD, division: divisionSpd, location: locationSpd }),
        );

        await expect(service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD])).rejects.toThrow(
          ForbiddenException,
        );
        expect(visitorRepo.update).not.toHaveBeenCalled();
      });

      it('13b. a confirmed visit does not remove the exit eligibility', async () => {
        visitorRepo.findOne.mockResolvedValue(
          entry({ hostConfirmed: true, hostConfirmedAt: confirmedAt, hostConfirmedBy: CONFIRMING_USER }),
        );

        // The same row still checks out: a host confirmation is not an exit.
        await expect(service.checkOut(ENTRY, COMPANY, USER, [CCD])).resolves.toBeDefined();
        expect(visitorRepo.update).toHaveBeenCalledTimes(1);
      });

      it('audits the confirmation through the existing activity log (§18/§30)', async () => {
        const logged: any[] = [];
        (service as any).activityLog.log = jest.fn(async (payload: any) => {
          logged.push(payload);
          return null;
        });
        visitorRepo.findOne
          .mockResolvedValueOnce(entry())
          .mockResolvedValueOnce(entry({ hostConfirmed: true, hostConfirmedAt: confirmedAt, hostConfirmedBy: CONFIRMING_USER }));

        await service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD], { signature: `data:image/png;base64,${PNG_1PX}` });

        expect(logged).toHaveLength(1);
        expect(logged[0]).toMatchObject({
          action: 'UPDATE',
          targetType: 'visitor_entry',
          targetId: ENTRY,
          actorUserId: CONFIRMING_USER,
        });
        expect(logged[0].details).toContain('VIS-2026-000042');
        expect(logged[0].details).toContain('digital signature captured');
        // Never any personal data or image bytes in the audit trail.
        expect(JSON.stringify(logged[0])).not.toContain('12345-1234567-1');
        expect(JSON.stringify(logged[0])).not.toContain('0300-1234567');
        expect(JSON.stringify(logged[0])).not.toContain(PNG_1PX);
      });
    });

    // ── 14 ─────────────────────────────────────────────────────────────────
    describe('digital signature storage', () => {
      const dataUrl = `data:image/png;base64,${PNG_1PX}`;

      it('14. stores the signature as a PRIVATE file, never as data in the row', async () => {
        visitorRepo.findOne
          .mockResolvedValueOnce(entry())
          .mockResolvedValueOnce(entry({ hostConfirmed: true, hostConfirmedAt: confirmedAt, hostConfirmedBy: CONFIRMING_USER }));

        await service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD], { signature: dataUrl });

        const [, patch] = updateCall();
        // Only a relative path + mime reach the row — never the base64 string.
        expect(patch.signaturePath).toMatch(new RegExp(`^visitors/${COMPANY}/${ENTRY}/signature-[0-9a-f-]+\\.png$`));
        expect(patch.signatureMime).toBe('image/png');
        expect(patch.signatureCapturedBy).toBe(CONFIRMING_USER);
        expect(patch.signatureCapturedAt).toBeInstanceOf(Date);
        expect(JSON.stringify(patch)).not.toContain('base64');

        // The file really exists on disk, under STORAGE_PATH, as a valid PNG.
        const written = path.join(storageDir, patch.signaturePath);
        expect(fs.existsSync(written)).toBe(true);
        const bytes = fs.readFileSync(written);
        expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG');
      });

      it('14b. serves the signature only through the authorised endpoint', async () => {
        const signaturePath = `visitors/${COMPANY}/${ENTRY}/signature-existing.png`;
        const written = path.join(storageDir, signaturePath);
        fs.mkdirSync(path.dirname(written), { recursive: true });
        fs.writeFileSync(written, Buffer.from(PNG_1PX, 'base64'));

        visitorRepo.findOne.mockResolvedValue(entry({ signaturePath, signatureMime: 'image/png' }));

        const ref = await service.resolveSignature(ENTRY, COMPANY, [CCD]);

        expect(ref).toEqual({ absolutePath: written, mime: 'image/png' });
        // …and an unauthorized division cannot even reach it.
        visitorRepo.findOne.mockResolvedValue(
          entry({ signaturePath, divisionId: SPD, division: divisionSpd }),
        );
        await expect(service.resolveSignature(ENTRY, COMPANY, [CCD])).rejects.toThrow(ForbiddenException);
      });

      it('14c. returns null when no signature is attached, so the slip still prints', async () => {
        visitorRepo.findOne.mockResolvedValue(entry());

        await expect(service.resolveSignature(ENTRY, COMPANY, [CCD])).resolves.toBeNull();
      });

      it('14d. refuses a non-PNG payload even when the data URL claims otherwise', async () => {
        visitorRepo.findOne.mockResolvedValue(entry());

        // Plain base64 with no data URL prefix.
        await expect(
          service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD], { signature: PNG_1PX }),
        ).rejects.toThrow(BadRequestException);

        // Correct prefix, but the bytes are not a PNG.
        await expect(
          service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD], {
            signature: `data:image/png;base64,${Buffer.from('not an image at all').toString('base64')}`,
          }),
        ).rejects.toThrow(/PNG/);

        expect(visitorRepo.update).not.toHaveBeenCalled();
      });

      it('14e. refuses an oversized signature before anything is written', async () => {
        visitorRepo.findOne.mockResolvedValue(entry());

        // 1×1 PNG scaled up past the cap: a real (oversized) buffer, so the size
        // check — not the magic-number check — is what rejects it.
        const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(MAX_SIGNATURE_BYTES + 1)]);
        await expect(
          service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD], {
            signature: `data:image/png;base64,${big.toString('base64')}`,
          }),
        ).rejects.toThrow(/too large/i);

        expect(visitorRepo.update).not.toHaveBeenCalled();
      });

      it('14f. confirms without a signature — the host may sign the printed slip instead (§13/§14)', async () => {
        visitorRepo.findOne
          .mockResolvedValueOnce(entry())
          .mockResolvedValueOnce(entry({ hostConfirmed: true, hostConfirmedAt: confirmedAt, hostConfirmedBy: CONFIRMING_USER }));

        await service.confirmHostVisit(ENTRY, COMPANY, CONFIRMING_USER, [CCD]);

        const [, patch] = updateCall();
        expect(patch.hostConfirmed).toBe(true);
        expect(patch).not.toHaveProperty('signaturePath');
      });
    });

    // ── 4 / 16 / 17 — entry behaviour + division scope are unchanged ─────────
    describe('regressions', () => {
      it('4+16. create still works and now also allocates a unique reference (§5)', async () => {
        const saved = await service.create(baseDto, COMPANY, USER, [CCD]);

        expect(saved).toMatchObject({
          companyId: COMPANY,
          divisionId: CCD,
          locationId: LOC_CCD,
          visitorName: 'Muhammad Test',
          hostEmployeeId: HOST_CCD,
          status: VisitorEntryStatus.PENDING,
          timeOut: null,
          createdBy: USER,
        });
        expect(saved.visitorReference).toBe(`VIS-${new Date().getFullYear()}-000001`);
        expect(visitorRepo.save).toHaveBeenCalledTimes(1);
      });

      it('4b. the reference continues the highest existing number of the year', async () => {
        const year = new Date().getFullYear();
        const qb = makeQb();
        qb.getOne.mockResolvedValue({ visitorReference: `VIS-${year}-000041` });
        visitorRepo.createQueryBuilder.mockReturnValue(qb);

        const saved = await service.create(baseDto, COMPANY, USER, [CCD]);

        expect(saved.visitorReference).toBe(`VIS-${year}-000042`);
      });

      it('4c. retries with a fresh number when the unique index refuses the write', async () => {
        const uniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
        visitorRepo.save
          .mockImplementationOnce(async () => {
            throw uniqueViolation;
          })
          .mockImplementationOnce(async (row: any) => ({ ...row, id: ENTRY }));

        const year = new Date().getFullYear();
        const qb = makeQb();
        // Every attempt sees the same busy high-water mark — a genuine race.
        qb.getOne.mockResolvedValue({ visitorReference: `VIS-${year}-000001` });
        visitorRepo.createQueryBuilder.mockReturnValue(qb);

        const saved = await service.create(baseDto, COMPANY, USER, [CCD]);

        expect(visitorRepo.save).toHaveBeenCalledTimes(2);
        expect(saved.visitorReference).toBe(`VIS-${year}-000002`);
      });

      it('4d. gives up with a business error instead of looping forever', async () => {
        visitorRepo.save.mockImplementation(async () => {
          throw Object.assign(new Error('duplicate key'), { code: '23505' });
        });

        await expect(service.create(baseDto, COMPANY, USER, [CCD])).rejects.toThrow(BadRequestException);
        expect(visitorRepo.save).toHaveBeenCalledTimes(REFERENCE_MAX_ATTEMPTS);
      });

      it('4e. a non-unique failure is surfaced immediately, not retried', async () => {
        visitorRepo.save.mockImplementation(async () => {
          throw new Error('connection terminated unexpectedly');
        });

        await expect(service.create(baseDto, COMPANY, USER, [CCD])).rejects.toThrow(/connection terminated/);
        expect(visitorRepo.save).toHaveBeenCalledTimes(1);
      });

      it('4f. the reference is searchable, so a printed slip can be looked up', async () => {
        const qb = makeQb();
        visitorRepo.createQueryBuilder.mockReturnValue(qb);

        await service.findAll({ companyId: COMPANY, allowedDivisionIds: [CCD], search: 'VIS-2026' });

        const clause = qb.whereCalls.find(([sql]: [string, any]) => sql.includes('visitor_reference'));
        expect(clause).toBeDefined();
        expect(clause![1].q).toBe('%VIS-2026%');
      });

      it('16b. a new entry starts with no confirmation and no signature (§15)', async () => {
        const qb = makeQb();
        qb.getManyAndCount.mockResolvedValue([[entry()], 1]);
        visitorRepo.createQueryBuilder.mockReturnValue(qb);

        const { data } = await service.findAll({ companyId: COMPANY, allowedDivisionIds: [CCD] });

        expect(data[0]).toMatchObject({
          visitorReference: 'VIS-2026-000042',
          hostConfirmed: false,
          hostConfirmedAt: null,
          hostConfirmedBy: null,
          hasSignature: false,
          status: VisitorEntryStatus.PENDING,
        });
      });

      it('15. the Prompt #18 exit still runs unchanged after a confirmation (§15/§29)', async () => {
        const timeOut = new Date('2026-09-28T13:40:00.000Z');
        const confirmed = entry({ hostConfirmed: true, hostConfirmedAt: confirmedAt, hostConfirmedBy: CONFIRMING_USER });
        // The re-read reflects the write the service just made, as a real
        // database would: the confirmation is untouched by the exit.
        visitorRepo.findOne
          .mockResolvedValueOnce(confirmed)
          .mockResolvedValueOnce({ ...confirmed, status: VisitorEntryStatus.COMPLETED, timeOut, exitedBy: USER });

        const result = await service.checkOut(ENTRY, COMPANY, USER, [CCD]);

        const [where, patch] = updateCall();
        expect(where).toMatchObject({ id: ENTRY, status: expect.anything() });
        // Still the ONE guarded conditional UPDATE of Prompt #18 — `time_out IS
        // NULL` is expressed as the `IsNull()` find operator.
        expect(where.timeOut).toBeInstanceOf(FindOperator);
        expect((where.timeOut as FindOperator<unknown>).type).toBe('isNull');
        expect(patch).toMatchObject({ status: VisitorEntryStatus.COMPLETED, exitedBy: USER });
        expect(patch.timeOut).toBeInstanceOf(Date);
        // The Time-Out is the SERVER's clock, so the re-read is the single source
        // of truth for the value the caller finally sees.
        expect(result.timeOut).toEqual(timeOut);
        expect(result).toMatchObject({
          hostConfirmed: true,
          hostConfirmedAt: confirmedAt,
          hostConfirmedBy: CONFIRMING_USER,
          status: VisitorEntryStatus.COMPLETED,
        });
      });

      it('15b. the exit never writes a confirmation column', async () => {
        visitorRepo.findOne.mockResolvedValue(entry({ hostConfirmed: true, hostConfirmedAt: confirmedAt }));

        await service.checkOut(ENTRY, COMPANY, USER, [CCD]);

        const [, patch] = updateCall();
        for (const key of ['hostConfirmed', 'hostConfirmedAt', 'hostConfirmedBy', 'signaturePath']) {
          expect(patch).not.toHaveProperty(key);
        }
      });

      it('17. division scope is still enforced for the slip, the confirmation and the signature', async () => {
        const foreign = entry({ divisionId: SPD, locationId: LOC_SPD, division: divisionSpd, location: locationSpd });
        visitorRepo.findOne.mockResolvedValue(foreign);

        await expect(service.getSlip(ENTRY, COMPANY, [CCD])).rejects.toThrow(ForbiddenException);
        await expect(service.confirmHostVisit(ENTRY, COMPANY, USER, [CCD])).rejects.toThrow(ForbiddenException);
        await expect(service.resolveSignature(ENTRY, COMPANY, [CCD])).rejects.toThrow(ForbiddenException);
        expect(visitorRepo.update).not.toHaveBeenCalled();
      });

      it('17b. the slip reads the host department through the employee master (§4)', async () => {
        visitorRepo.findOne.mockResolvedValue(entry());

        await service.getSlip(ENTRY, COMPANY, [CCD]);

        expect(visitorRepo.findOne).toHaveBeenCalledWith(
          expect.objectContaining({
            relations: expect.objectContaining({ hostEmployee: { department: true } }),
          }),
        );
      });
    });
  });
});
