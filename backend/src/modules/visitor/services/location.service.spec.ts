import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LocationService } from './location.service';
import { Location, LocationStatus } from '../entities';
import { Division } from '../../organization/entities/division.entity';
import { CreateLocationDto, UpdateLocationDto } from '../dto';

/**
 * Prompt #17 §3/§12/§21 — Location master behaviour.
 *
 * The Location master is additive (a new `locations` table): nothing existing
 * is renamed or repurposed, code uniqueness follows the master-data convention
 * (unique per company → 409 on duplicate), and every row is division-scoped.
 */
describe('LocationService', () => {
  const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
  const CCD = 'd1000000-0000-0000-0000-000000000002';
  const SPD = 'd1000000-0000-0000-0000-000000000001';
  const LOC = 'a1000000-0000-0000-0000-00000000000c';
  const USER = 'u1000000-0000-0000-0000-000000000001';

  let service: LocationService;
  let locationRepo: any;
  let divisionRepo: any;

  const makeQb = () => {
    const qb: any = { whereCalls: [] as Array<[string, any]> };
    const chain = (record = false) =>
      jest.fn().mockImplementation((...args: any[]) => {
        if (record) qb.whereCalls.push([args[0], args[1]]);
        return qb;
      });
    qb.where = chain(true);
    qb.andWhere = chain(true);
    qb.leftJoinAndSelect = chain();
    qb.leftJoin = chain();
    qb.orderBy = chain();
    qb.skip = chain();
    qb.take = chain();
    qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
    qb.getOne = jest.fn().mockResolvedValue(null);
    return qb;
  };

  const division = { id: CCD, companyId: COMPANY, divisionCode: 'DIV-CCD', name: 'Control Cable Division' } as Division;
  const location = {
    id: LOC, companyId: COMPANY, divisionId: CCD, locationCode: 'GATE-01', name: 'Main Gate',
    status: LocationStatus.ACTIVE, description: null, division,
  } as Location;

  beforeEach(async () => {
    locationRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((input: any) => ({ ...input })),
      save: jest.fn().mockImplementation(async (row: any) => ({ ...row })),
      remove: jest.fn().mockImplementation(async (row: any) => row),
      createQueryBuilder: jest.fn(),
    };
    divisionRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationService,
        { provide: getRepositoryToken(Location), useValue: locationRepo },
        { provide: getRepositoryToken(Division), useValue: divisionRepo },
      ],
    }).compile();

    service = module.get<LocationService>(LocationService);
    divisionRepo.findOne.mockResolvedValue(division);
    locationRepo.findOne.mockResolvedValue(location);
  });

  const dto: CreateLocationDto = { divisionId: CCD, locationCode: 'GATE-01', name: 'Main Gate' };

  it('creates a location and derives the company from the division', async () => {
    locationRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const created = await service.create(dto, COMPANY, USER);

    expect(locationRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      companyId: COMPANY,
      divisionId: CCD,
      locationCode: 'GATE-01',
      createdBy: USER,
    }));
    expect(created.name).toBe('Main Gate');
  });

  it('rejects a duplicate location code with 409 (existing master-data convention)', async () => {
    locationRepo.findOne.mockResolvedValueOnce(location);
    await expect(service.create(dto, COMPANY, USER)).rejects.toThrow(ConflictException);
  });

  it('rejects a location under a division from another company', async () => {
    divisionRepo.findOne.mockResolvedValue(null);
    await expect(service.create(dto, COMPANY, USER)).rejects.toThrow(BadRequestException);
    expect(locationRepo.create).not.toHaveBeenCalled();
  });

  it('filters the list to the authorized divisions', async () => {
    const qb = makeQb();
    locationRepo.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ companyId: COMPANY, allowedDivisionIds: [CCD] });

    const clause = qb.whereCalls.find(([sql]: [string, any]) =>
      sql.includes('loc.divisionId IN (:...allowedDivisionIds)'),
    );
    expect(clause![1].allowedDivisionIds).toEqual([CCD]);
  });

  it('returns every row to an unrestricted caller', async () => {
    const qb = makeQb();
    locationRepo.createQueryBuilder.mockReturnValue(qb);

    await service.findAll({ companyId: COMPANY });

    expect(qb.whereCalls.some(([sql]: [string, any]) => sql.includes('divisionId IN'))).toBe(false);
  });

  it('refuses a location outside the caller divisions (403) and an unknown id (404)', async () => {
    locationRepo.findOne.mockResolvedValue({ ...location, divisionId: SPD });
    await expect(service.findOne(LOC, COMPANY, [CCD])).rejects.toThrow(ForbiddenException);

    locationRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne(LOC, COMPANY, [CCD])).rejects.toThrow(NotFoundException);

    await expect(service.findOne('nope', COMPANY, [CCD])).rejects.toThrow(NotFoundException);
  });

  it('refuses to delete a location that visitor entries reference (409)', async () => {
    const qb = makeQb();
    locationRepo.createQueryBuilder.mockReturnValue(qb);
    qb.getOne.mockResolvedValue(location);

    await expect(service.remove(LOC, COMPANY, [CCD])).rejects.toThrow(ConflictException);
    expect(locationRepo.remove).not.toHaveBeenCalled();
  });

  it('deletes an unreferenced location', async () => {
    const qb = makeQb();
    locationRepo.createQueryBuilder.mockReturnValue(qb);
    qb.getOne.mockResolvedValue(null);

    await expect(service.remove(LOC, COMPANY, [CCD])).resolves.toBeUndefined();
    expect(locationRepo.remove).toHaveBeenCalledWith(expect.objectContaining({ id: LOC }));
  });

  it('applies an update only to the allowed fields', async () => {
    const update: UpdateLocationDto = { name: 'New Name', description: 'Gate 1' };
    const saved = await service.update(LOC, update, COMPANY, USER, [CCD]);

    expect(saved.name).toBe('New Name');
    expect(saved.description).toBe('Gate 1');
    expect(saved.updatedBy).toBe(USER);
    expect((saved as any).companyId).toBe(COMPANY);
  });
});
