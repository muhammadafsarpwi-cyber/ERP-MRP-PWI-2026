import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MachineService } from './machine.service';
import { Machine } from '../../production/entities/machine.entity';
import { ProductionEntry } from '../../production/entities/production-entry.entity';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(async () => 'data:image/png;base64,QRCODE'),
}));

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const DEPT = 'd3000000-0000-0000-0000-000000000001';
const DIV = 'd1000000-0000-0000-0000-000000000001';
const SEC = 'd2000000-0000-0000-0000-000000000001';

let service: MachineService;
let machineRepo: any;
let departmentRepo: any;
let divisionRepo: any;
let sectionRepo: any;
let productionEntryRepo: any;
let configService: any;

const makeQb = () => {
  const qb: any = {};
  for (const m of ['where', 'andWhere', 'leftJoinAndSelect', 'orderBy', 'skip', 'take']) {
    qb[m] = jest.fn().mockReturnThis();
  }
  qb.getOne = jest.fn().mockResolvedValue(null);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  return qb;
};

const validDto = () => ({
  machineCode: 'E2E-X1',
  name: 'Test Machine',
  departmentId: DEPT,
});

const orgMocks = (overrides: any = {}) => {
  departmentRepo.findOne.mockResolvedValue(
    overrides.dept ?? { id: DEPT, companyId: COMPANY, divisionId: DIV, sectionId: SEC, status: 'ACTIVE' },
  );
  divisionRepo.findOne.mockResolvedValue(overrides.div ?? { id: DIV, companyId: COMPANY, divisionId: DIV });
  sectionRepo.findOne.mockResolvedValue(overrides.sec ?? { id: SEC, companyId: COMPANY, divisionId: DIV });
};

beforeEach(async () => {
  machineRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    findOneBy: jest.fn(async ({ id }: any) => (id ? { id, machineId: 'MCH099' } : null)),
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((x) => ({ ...x })),
    save: jest.fn(async (x) => ({ ...x, id: x.id ?? 'm-new' })),
    createQueryBuilder: jest.fn(() => makeQb()),
  };
  departmentRepo = { findOne: jest.fn() };
  divisionRepo = { findOne: jest.fn() };
  sectionRepo = { findOne: jest.fn() };
  productionEntryRepo = { count: jest.fn().mockResolvedValue(0) };
  configService = { get: jest.fn(() => 'http://test.local') };

  const moduleRef = await Test.createTestingModule({
    providers: [
      MachineService,
      { provide: getRepositoryToken(Machine), useValue: machineRepo },
      { provide: getRepositoryToken(Department), useValue: departmentRepo },
      { provide: getRepositoryToken(Division), useValue: divisionRepo },
      { provide: getRepositoryToken(Section), useValue: sectionRepo },
      { provide: getRepositoryToken(ProductionEntry), useValue: productionEntryRepo },
      { provide: ConfigService, useValue: configService },
    ],
  }).compile();

  service = moduleRef.get(MachineService);
});

describe('MachineService — create', () => {
  it('creates a machine with hierarchy inherited from the department and a deep-link QR payload', async () => {
    orgMocks();
    const result = await service.create(validDto(), COMPANY, 'user-1');

    expect(result.companyId).toBe(COMPANY);
    expect(result.departmentId).toBe(DEPT);
    expect(result.divisionId).toBe(DIV);
    expect(result.sectionId).toBe(SEC);
    expect(result.status).toBe('ACTIVE');
    expect(result.criticality).toBe('MEDIUM');
    expect(result.qrPayload).toBe('/production/machines/m-new');
    expect(result.createdBy).toBe('user-1');
  });

  it('is tenant-isolated: hierarchy lookups are scoped to the caller company', async () => {
    orgMocks();
    await service.create(validDto(), COMPANY);
    expect(departmentRepo.findOne).toHaveBeenCalledWith({ where: { id: DEPT, companyId: COMPANY } });
  });

  it('rejects duplicate machine code within the same department', async () => {
    orgMocks();
    const qb = makeQb();
    qb.getOne.mockResolvedValue({ id: 'existing', machineCode: 'E2E-X1' });
    machineRepo.createQueryBuilder.mockReturnValue(qb);

    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(ConflictException);
  });

  it('scopes duplicate check to the department bucket so codes may repeat across departments', async () => {
    orgMocks();
    const qb = makeQb();
    machineRepo.createQueryBuilder.mockReturnValue(qb);

    await service.create({ ...validDto(), machineCode: 'SP-01' }, COMPANY);

    const deptCall = qb.andWhere.mock.calls
      .map((c: any[]) => c[0] as string)
      .find((s: string) => s.includes('m.departmentId = :dept'));
    expect(deptCall).toBeTruthy();
    expect(qb.andWhere).toHaveBeenCalledWith('m.departmentId = :dept', expect.objectContaining({ dept: DEPT }));
  });

  it('rejects duplicate serial number in company', async () => {
    orgMocks();
    const qb = makeQb();
    // first qb call = code check (free); second = serial check (taken)
    let n = 0;
    machineRepo.createQueryBuilder.mockImplementation(() => {
      const q = makeQb();
      q.getOne.mockResolvedValue(n++ === 1 ? { id: 'other-machine' } : null);
      return q;
    });

    await expect(
      service.create({ ...validDto(), serialNumber: 'SN-001' }, COMPANY),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects warranty expiry before installation date', async () => {
    orgMocks();
    await expect(
      service.create(
        { ...validDto(), installationDate: '2030-01-01', warrantyExpiryDate: '2020-01-01' },
        COMPANY,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unknown department', async () => {
    departmentRepo.findOne.mockResolvedValue(null);
    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(BadRequestException);
  });

  it('rejects division that does not match the department chain', async () => {
    orgMocks();
    await expect(
      service.create({ ...validDto(), divisionId: 'd1000000-0000-0000-0000-000000000002' }, COMPANY),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unknown division and unknown section', async () => {
    orgMocks();
    divisionRepo.findOne.mockResolvedValue(null);
    await expect(service.create({ ...validDto(), departmentId: null, divisionId: 'nope-div' }, COMPANY))
      .rejects.toThrow(BadRequestException);

    sectionRepo.findOne.mockResolvedValue(null);
    await expect(
      service.create({ ...validDto(), departmentId: null, divisionId: DIV, sectionId: 'nope-sec' }, COMPANY),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a section belonging to another division when no department is given', async () => {
    orgMocks();
    sectionRepo.findOne.mockResolvedValue({ id: SEC, companyId: COMPANY, divisionId: 'another-div' });
    await expect(
      service.create(
        { ...validDto(), departmentId: null, divisionId: 'd1000000-0000-0000-0000-000000000002', sectionId: SEC },
        COMPANY,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('MachineService — update / status / delete', () => {
  const existing = (): any => ({
    id: 'm-1',
    companyId: COMPANY,
    machineCode: 'OLD-1',
    name: 'Old Name',
    status: 'ACTIVE',
    criticality: 'LOW',
    divisionId: DIV,
    sectionId: SEC,
    departmentId: DEPT,
    qrPayload: '/production/machines/m-1',
    isActive: true,
    save: undefined,
  });

  beforeEach(() => {
    machineRepo.findOne.mockImplementation(async ({ where }: any) =>
      where.isActive === false ? null : existing(),
    );
    orgMocks();
  });

  it('updates editable fields while preserving id and status', async () => {
    const result = await service.update('m-1', { name: 'New Name', criticality: 'CRITICAL' as any }, COMPANY, 'user-2');
    expect(result.id).toBe('m-1');
    expect(result.name).toBe('New Name');
    expect(result.criticality).toBe('CRITICAL');
    expect(result.status).toBe('ACTIVE');
    expect(result.updatedBy).toBe('user-2');
  });

  it('re-validates code uniqueness against the new department on rename', async () => {
    const qb = makeQb();
    qb.getOne.mockResolvedValue({ id: 'twin', machineCode: 'NEW-1' });
    machineRepo.createQueryBuilder.mockReturnValue(qb);

    await expect(service.update('m-1', { machineCode: 'NEW-1' }, COMPANY)).rejects.toThrow(ConflictException);
    expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ dept: DEPT }));
  });

  it('changeStatus supports ACTIVE | INACTIVE | MAINTENANCE | RETIRED', async () => {
    for (const st of ['MAINTENANCE', 'RETIRED', 'INACTIVE', 'ACTIVE'] as any[]) {
      const r = await service.changeStatus('m-1', st, COMPANY, 'user-3');
      expect(r.status).toBe(st);
    }
  });

  it('remove soft-deletes instead of hard delete', async () => {
    await service.remove('m-1', COMPANY, 'user-4');
    const saved = machineRepo.save.mock.calls.at(-1)[0];
    expect(saved.isActive).toBe(false);
    expect(saved.status).toBe('INACTIVE');
    expect(machineRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: COMPANY }) }),
    );
  });

  it('remove is blocked with a business error when production entries reference the machine', async () => {
    machineRepo.findOne.mockResolvedValue({ ...existing(), id: 'm-ref' });
    const saveSpy = machineRepo.save as jest.Mock;
    saveSpy.mockClear();
    (productionEntryRepo.count as jest.Mock).mockResolvedValueOnce(3);

    await expect(service.remove('m-ref', COMPANY, 'user-4')).rejects.toThrow(ConflictException);
    expect(productionEntryRepo.count).toHaveBeenCalledWith({
      where: { machineId: 'm-ref', isActive: true },
    });
    expect(saveSpy).not.toHaveBeenCalled();
  });
});

describe('MachineService — read / list / QR / resolution', () => {
  it('findOne throws NotFound for missing machine', async () => {
    await expect(service.findOne('missing', COMPANY)).rejects.toThrow(NotFoundException);
  });

  it('findAll applies filters, sorting and pagination', async () => {
    const qb = makeQb();
    qb.getManyAndCount.mockResolvedValue([[{ id: 'a' }, { id: 'b' }], 25]);
    machineRepo.createQueryBuilder.mockReturnValue(qb);

    const result = await service.findAll(COMPANY, {
      page: 2,
      limit: 10,
      divisionId: 'div-x',
      sectionId: 'sec-x',
      departmentId: 'dept-x',
      status: 'ACTIVE' as any,
      criticality: 'HIGH' as any,
      search: 'spiral',
      sortBy: 'name',
      sortDir: 'DESC',
    } as any);

    expect(result).toEqual({ data: [{ id: 'a' }, { id: 'b' }], total: 25, page: 2, limit: 10 });
    expect(qb.where).toHaveBeenCalledWith('m.companyId = :companyId', { companyId: COMPANY });
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(qb.orderBy).toHaveBeenCalledWith('m.name', 'DESC');
    const andWhereArgs = qb.andWhere.mock.calls.map((c: any) => c[1]);
    expect(andWhereArgs).toContainEqual({ divisionId: 'div-x' });
    expect(andWhereArgs).toContainEqual({ sectionId: 'sec-x' });
    expect(andWhereArgs).toContainEqual({ departmentId: 'dept-x' });
    expect(andWhereArgs).toContainEqual({ status: 'ACTIVE' });
    expect(andWhereArgs).toContainEqual({ criticality: 'HIGH' });
    expect(andWhereArgs).toContainEqual({ search: '%spiral%' });
  });

  it('getQr returns absolute deep-link URL encoded into the PNG data URL', async () => {
    machineRepo.findOne.mockResolvedValue({
      id: 'm-9', companyId: COMPANY, isActive: true, machineCode: 'ST-01', qrPayload: '/production/machines/m-9',
    });
    const QRCode = require('qrcode');
    const result = await service.getQr('m-9', COMPANY);

    expect(result.payload).toBe('/production/machines/m-9');
    expect(result.url).toBe('http://test.local/production/machines/m-9');
    expect(QRCode.toDataURL).toHaveBeenCalledWith('http://test.local/production/machines/m-9', expect.anything());
    expect(result.dataUrl).toBe('data:image/png;base64,QRCODE');
  });

  it('resolveByCode accepts a full scanned URL, bare uuid and case-insensitive code', async () => {
    machineRepo.findOne
      .mockResolvedValueOnce({ id: 'm-9', machineCode: 'ST-01' })
      .mockResolvedValueOnce({ id: 'm-9', machineCode: 'ST-01' })
      .mockResolvedValueOnce({ id: 'm-8', machineCode: 'SW-02' });

    await expect(
      service.resolveByCode('https://erp.example.com/production/machines/m-9?src=qr', COMPANY),
    ).resolves.toMatchObject({ id: 'm-9' });
    await expect(service.resolveByCode('m-9', COMPANY)).resolves.toMatchObject({ id: 'm-9' });
    await expect(service.resolveByCode('sw-02', COMPANY)).resolves.toMatchObject({ id: 'm-8' });
  });

  it('resolveByCode falls back to code lookup when the scanned text has no uuid', async () => {
    machineRepo.find.mockResolvedValue([{ id: 'm-7', machineCode: 'BL-12', companyId: COMPANY }]);
    await expect(service.resolveByCode('bl-12', COMPANY)).resolves.toMatchObject({ id: 'm-7' });
  });

  it('resolveByCode looks up system-generated Machine IDs (MCH###) case-insensitively and scoped to company', async () => {
    const qb = makeQb();
    qb.getOne.mockResolvedValue({ id: 'm-1', machineId: 'MCH001' });
    machineRepo.createQueryBuilder.mockReturnValue(qb);

    await expect(service.resolveByCode('mch001', COMPANY)).resolves.toMatchObject({ machineId: 'MCH001' });
    expect(qb.where).toHaveBeenCalledWith('LOWER(m.machineId) = LOWER(:mid)', { mid: 'mch001' });
    expect(qb.andWhere).toHaveBeenCalledWith('m.companyId = :companyId', expect.objectContaining({ companyId: COMPANY }));
  });

  it('throws NotFound when nothing resolves', async () => {
    machineRepo.find.mockResolvedValue([]);
    await expect(service.resolveByCode('ghost', COMPANY)).rejects.toThrow(NotFoundException);
  });
});
