import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  MachineTargetService,
  calculateProratedTarget,
  normaliseImportHeader,
  anchorKey,
  machineItemKey,
  pickCurrentTarget,
  relaxationCandidates,
} from './machine-target.service';
import { MachineTarget } from '../entities/machine-target.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Shift } from '../../production/entities/shift.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Item } from '../../item/entities/item.entity';

jest.mock('qrcode', () => ({ toDataURL: jest.fn(async () => 'data:image/png;base64,x') }));

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const MACHINE = '103be387-c310-40b0-a670-b787d81174cb';
const SHIFT = '58d9ed01-5c7d-4b60-a748-16cb4117afdc';
const GEN = '4ff84e90-bbb2-4ef5-9c79-e193a3ffa37e';
const UOM = '9d173c37-9f23-4b96-aa7c-de1a625debf8';
const ITEM = 'd2000000-0000-0000-0000-000000000001';

let service: MachineTargetService;
let targetRepo: any;
let machineRepo: any;
let shiftRepo: any;
let uomRepo: any;
let itemRepo: any;

const makeQb = () => {
  const qb: any = {};
  for (const m of ['where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take', 'leftJoinAndSelect']) {
    qb[m] = jest.fn().mockReturnThis();
  }
  qb.getOne = jest.fn().mockResolvedValue(null);
  qb.getMany = jest.fn().mockResolvedValue([]);
  qb.getManyAndCount = jest.fn().mockResolvedValue([[], 0]);
  return qb;
};

const refsValid = () => {
  machineRepo.findOne.mockResolvedValue({
    id: MACHINE, companyId: COMPANY, isActive: true, status: 'ACTIVE', machineCode: 'ST-01',
    divisionId: null, sectionId: null, departmentId: null,
  });
  shiftRepo.findOne.mockResolvedValue({ id: SHIFT, companyId: COMPANY, isActive: true, shiftCode: 'SHIFT-1' });
  uomRepo.findOne.mockResolvedValue({ id: UOM, code: 'PCS', status: 'ACTIVE' });
  itemRepo.findOne.mockResolvedValue(activeItem());
};

/** Wire-drawing item with base UOM KG and full conversion data (PROMPT-09 style). */
const activeItem = (over: any = {}) => ({
  id: ITEM,
  companyId: COMPANY,
  itemCode: 'SAMPLE-WIRE-4.50',
  name: 'Sample Wire 4.50',
  isActive: true,
  baseUomId: 'base-kg',
  baseUom: { id: 'base-kg', code: 'KG', uomType: 'WEIGHT', status: 'ACTIVE' },
  weightPerPiece: '0.0937',
  piecesPerKg: '10.672',
  weightPerMeter: '0.1249',
  lengthPerPiece: null,
  ...over,
});

const validDto = () => ({
  machineId: MACHINE,
  shiftId: SHIFT,
  itemId: ITEM,
  uomId: UOM,
  standardHours: 8,
  targetQuantity: 5000,
  effectiveFrom: '2026-08-01',
});

beforeEach(async () => {
  // create/update/changeStatus reload via findOne(id, companyId); emulate a
  // tiny in-memory store so those reloads observe saved rows.
  const store: Record<string, any> = {};
  targetRepo = {
    findOne: jest.fn(async (opts: any) => store[opts?.where?.id] ?? null),
    create: jest.fn((x) => ({ ...x })),
    save: jest.fn(async (x) => {
      const id = x.id ?? 'mt-new';
      // emulate DB column default is_active=TRUE on insert (RETURNING)
      store[id] = { ...(store[id] ?? {}), ...x, id, isActive: x.isActive ?? true };
      return store[id];
    }),
    createQueryBuilder: jest.fn(() => makeQb()),
  };
  machineRepo = { findOne: jest.fn().mockResolvedValue(null) };
  shiftRepo = { findOne: jest.fn().mockResolvedValue(null) };
  uomRepo = { findOne: jest.fn().mockResolvedValue(null) };
  itemRepo = { findOne: jest.fn().mockResolvedValue(null) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      MachineTargetService,
      { provide: getRepositoryToken(MachineTarget), useValue: targetRepo },
      { provide: getRepositoryToken(Machine), useValue: machineRepo },
      { provide: getRepositoryToken(Shift), useValue: shiftRepo },
      { provide: getRepositoryToken(Uom), useValue: uomRepo },
      { provide: getRepositoryToken(Item), useValue: itemRepo },
    ],
  }).compile();

  service = moduleRef.get(MachineTargetService);
});

describe('calculateProratedTarget', () => {
  it('pro-rates decimal-safely: 5000 × 6 / 8 = 3750', () => {
    expect(calculateProratedTarget(5000, 8, 6)).toBe(3750);
  });
  it('full hours return the standard target: 5000 × 8 / 8 = 5000', () => {
    expect(calculateProratedTarget(5000, 8, 8)).toBe(5000);
  });
  it('overtime scales up: 5000 × 12 / 8 = 7500', () => {
    expect(calculateProratedTarget(5000, 8, 12)).toBe(7500);
  });
  it('keeps 4-dp precision for odd hours', () => {
    expect(calculateProratedTarget(5000, 7, 3)).toBe(Number((15000 / 7).toFixed(4)));
  });
});

describe('MachineTargetService — create validation', () => {
  it('creates a target with validated references and audit fields', async () => {
    refsValid();
    const result = await service.create(validDto(), COMPANY, 'user-1');
    expect(result.companyId).toBe(COMPANY);
    expect(result.targetQuantity).toBe('5000');
    expect(result.standardHours).toBe('8');
    expect(result.createdBy).toBe('user-1');
    expect(targetRepo.createQueryBuilder).toHaveBeenCalled();
  });

  it('rejects machines outside the company (tenant isolation)', async () => {
    machineRepo.findOne.mockResolvedValue(null);
    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(NotFoundException);
    expect(machineRepo.findOne).toHaveBeenCalledWith({ where: { id: MACHINE, companyId: COMPANY } });
  });

  it('rejects INACTIVE machines for new targets', async () => {
    machineRepo.findOne.mockResolvedValue({ id: MACHINE, companyId: COMPANY, isActive: true, status: 'RETIRED', machineCode: 'ST-01' });
    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(BadRequestException);
  });

  it('rejects shifts outside the company', async () => {
    refsValid();
    shiftRepo.findOne.mockResolvedValue(null);
    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(NotFoundException);
    expect(shiftRepo.findOne).toHaveBeenCalledWith({ where: { id: SHIFT, companyId: COMPANY } });
  });

  it('rejects unknown or inactive UOMs', async () => {
    refsValid();
    uomRepo.findOne.mockResolvedValue({ id: UOM, code: 'PCS', status: 'INACTIVE' });
    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(BadRequestException);
  });

  it('rejects non-production UOMs (only KG / PCS / METER allowed)', async () => {
    refsValid();
    uomRepo.findOne.mockResolvedValue({ id: UOM, code: 'BOX', status: 'ACTIVE' });
    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(/supported production target unit/);
  });

  it('accepts METER (code M) as a production UOM', async () => {
    refsValid();
    uomRepo.findOne.mockResolvedValue({ id: UOM, code: 'M', status: 'ACTIVE' });
    const result = await service.create(validDto(), COMPANY);
    expect(result.uomId).toBe(UOM);
  });

  it('rejects effectiveTo on or before effectiveFrom', async () => {
    refsValid();
    await expect(
      service.create({ ...validDto(), effectiveTo: '2026-08-01' }, COMPANY),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects overlapping ACTIVE periods for the same combo', async () => {
    refsValid();
    const qb = makeQb();
    qb.getOne.mockResolvedValue({ id: 'mt-existing', effectiveFrom: '2026-07-01', effectiveTo: null });
    targetRepo.createQueryBuilder.mockReturnValue(qb);

    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(ConflictException);
    const whereArgs = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(whereArgs.some((s: string) => s.includes('mt.effectiveFrom <= :rangeTo'))).toBe(true);
    expect(whereArgs.some((s: string) => s.includes('mt.effectiveTo >= :rangeFrom'))).toBe(true);
  });
});

describe('MachineTargetService — resolution', () => {
  const targetRow = (over: any = {}) => ({
    id: 'mt-1',
    companyId: COMPANY,
    machineId: MACHINE,
    shiftId: SHIFT,
    uomId: UOM,
    standardHours: '8',
    targetQuantity: '5000',
    effectiveFrom: '2026-08-01',
    effectiveTo: null,
    ...over,
  });

  // Returns rows for the requested shiftId (captured from andWhere params) so
  // tests stay deterministic regardless of internal query order.
  const resolveQb = (shiftRows: any[], generalRows: any[] = []) => {
    const qb = makeQb();
    let lastShiftParam: string | undefined;
    qb.andWhere.mockImplementation((expr: string, params?: any) => {
      if (params && 'shiftId' in params) lastShiftParam = params.shiftId;
      return qb;
    });
    qb.getMany.mockImplementation(async () => {
      if (lastShiftParam === SHIFT) return shiftRows;
      if (lastShiftParam === GEN) return generalRows;
      return [];
    });
    targetRepo.createQueryBuilder.mockReturnValue(qb);
    machineRepo.findOne.mockResolvedValue({
      id: MACHINE, companyId: COMPANY, isActive: true, status: 'ACTIVE',
      machineCode: 'ST-01', name: 'Straightener 01', machineNumber: 'ST # 01', machineId: 'MCH001',
    });
    return qb;
  };

  it('resolves a single applicable target without fallback', async () => {
    resolveQb([targetRow()]);
    shiftRepo.findOne.mockResolvedValue({ id: GEN, companyId: COMPANY, shiftCode: 'GENERAL' });
    const res = await service.resolve(
      { machineId: MACHINE, shiftId: SHIFT, productionDate: '2026-08-10', workingHours: 6 } as any,
      COMPANY,
    );
    expect(res.effectiveTargetRecordId).toBe('mt-1');
    expect(res.usedGeneralFallback).toBe(false);
    expect(res.standardTarget).toBe(5000);
    expect(res.calculatedTarget).toBe(3750);
  });

  it('falls back to the GENERAL shift when the selected shift has no target', async () => {
    const qb = resolveQb([], [targetRow({ shiftId: GEN })]);
    shiftRepo.findOne.mockResolvedValue({ id: GEN, companyId: COMPANY, shiftCode: 'GENERAL', name: 'General Shift' });
    const res = await service.resolve(
      { machineId: MACHINE, shiftId: SHIFT, productionDate: '2026-08-10', workingHours: 12 } as any,
      COMPANY,
    );
    expect(res.usedGeneralFallback).toBe(true);
    expect(res.calculatedTarget).toBe(7500);
    // second query must target the GENERAL shift id
    const andWhereArgs = qb.andWhere.mock.calls.map((c: any[]) => c[1]);
    expect(andWhereArgs.filter((p: any) => p && p.shiftId === GEN).length).toBeGreaterThan(0);
  });

  it('errors clearly when no target is configured anywhere', async () => {
    resolveQb([], []);
    shiftRepo.findOne.mockResolvedValue(null);
    await expect(
      service.resolve({ machineId: MACHINE, shiftId: SHIFT, productionDate: '2026-08-10' } as any, COMPANY),
    ).rejects.toThrow(/No active target is configured/);
  });

  it('errors on ambiguous configuration instead of picking randomly', async () => {
    resolveQb([targetRow({ id: 'mt-a' }), targetRow({ id: 'mt-b' })]);
    await expect(
      service.resolve({ machineId: MACHINE, shiftId: SHIFT, productionDate: '2026-08-10' } as any, COMPANY),
    ).rejects.toThrow(/Ambiguous/);
  });

  it('honours allowGeneralFallback=false (no silent cross-shift use)', async () => {
    resolveQb([], [targetRow({ shiftId: GEN })]);
    shiftRepo.findOne.mockResolvedValue({ id: GEN, shiftCode: 'GENERAL' });
    await expect(
      service.resolve(
        { machineId: MACHINE, shiftId: SHIFT, productionDate: '2026-08-10', allowGeneralFallback: false } as any,
        COMPANY,
      ),
    ).rejects.toThrow(/No active target/);
    expect(shiftRepo.findOne).not.toHaveBeenCalled();
  });
});

describe('MachineTargetService � PROMPT-10 item dimension', () => {
  it('rejects unknown items', async () => {
    refsValid();
    itemRepo.findOne.mockResolvedValue(null);
    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(NotFoundException);
    expect(itemRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ITEM, companyId: COMPANY } }),
    );
  });

  it('rejects inactive items', async () => {
    refsValid();
    itemRepo.findOne.mockResolvedValue(activeItem({ isActive: false }));
    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(NotFoundException);
  });

  it('accepts a target in the item base unit even without conversion data', async () => {
    refsValid();
    uomRepo.findOne.mockResolvedValue({ id: UOM, code: 'KG', status: 'ACTIVE' });
    itemRepo.findOne.mockResolvedValue(activeItem({
      baseUom: { id: 'base-kg', code: 'KG', uomType: 'WEIGHT', status: 'ACTIVE' },
      weightPerPiece: null, piecesPerKg: null, weightPerMeter: null, lengthPerPiece: null,
    }));
    const result = await service.create(validDto(), COMPANY);
    expect(result.itemId).toBe(ITEM);
  });

  it('accepts a cross-family target when the item conversion data supports it (KG base -> PCS)', async () => {
    refsValid(); // base KG + piecesPerKg present; UOM PCS
    const result = await service.create(validDto(), COMPANY);
    expect(result.itemId).toBe(ITEM);
  });

  it('rejects a cross-family target with no mathematically valid path (KG base -> METER)', async () => {
    refsValid();
    uomRepo.findOne.mockResolvedValue({ id: UOM, code: 'M', status: 'ACTIVE' });
    itemRepo.findOne.mockResolvedValue(activeItem({
      weightPerMeter: null, lengthPerPiece: null, // no WEIGHT->LENGTH path
    }));
    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(/cannot be used for item 'SAMPLE-WIRE-4\.50'/);
  });

  it('rejects a machine filed under a department it does not belong to', async () => {
    refsValid();
    await expect(
      service.create({ ...validDto(), departmentId: 'dep-x' } as any, COMPANY),
    ).rejects.toThrow(/does not belong to department/);
  });
});

describe('MachineTargetService � org consistency guard', () => {
  it('accepts verification fields that match the machine org chain', async () => {
    machineRepo.findOne.mockResolvedValue({
      id: MACHINE, companyId: COMPANY, isActive: true, status: 'ACTIVE', machineCode: 'ST-01',
      divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dep-1',
    });
    shiftRepo.findOne.mockResolvedValue({ id: SHIFT, companyId: COMPANY, isActive: true, shiftCode: 'SHIFT-1' });
    uomRepo.findOne.mockResolvedValue({ id: UOM, code: 'PCS', status: 'ACTIVE' });
    itemRepo.findOne.mockResolvedValue(activeItem());

    const result = await service.create(
      { ...validDto(), divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dep-1' } as any,
      COMPANY,
    );
    expect(result.machineId).toBe(MACHINE);
  });

  it('rejects a wrong section on update', async () => {
    refsValid();
    const qb = makeQb();
    targetRepo.createQueryBuilder.mockReturnValue(qb);
    const created = await service.create(validDto(), COMPANY);
    machineRepo.findOne.mockResolvedValue({
      id: MACHINE, companyId: COMPANY, isActive: true, status: 'ACTIVE', machineCode: 'ST-01',
      divisionId: 'div-1', sectionId: 'sec-real', departmentId: 'dep-1',
    });
    await expect(
      service.update(created.id, { sectionId: 'sec-other' } as any, COMPANY),
    ).rejects.toThrow(/does not belong to section/);
  });
});

describe('MachineTargetService � uniqueness includes the item', () => {
  it('scopes the overlap check to the same item', async () => {
    refsValid();
    const qb = makeQb();
    qb.getOne.mockResolvedValue(null);
    targetRepo.createQueryBuilder.mockReturnValue(qb);

    await service.create(validDto(), COMPANY);
    const whereArgs = qb.andWhere.mock.calls.map((c: any[]) => c[0]);
    expect(whereArgs.some((s: string) => s.includes('mt.itemId = :itemId'))).toBe(true);
    const paramCalls = qb.andWhere.mock.calls.map((c: any[]) => c[1]);
    expect(paramCalls.some((p: any) => p && p.itemId === ITEM)).toBe(true);
  });
});

describe('MachineTargetService � PROMPT-10 resolve with item', () => {
  const targetRow = (over: any = {}) => ({
    id: 'mt-1',
    companyId: COMPANY,
    machineId: MACHINE,
    shiftId: SHIFT,
    itemId: ITEM,
    uomId: UOM,
    standardHours: '8',
    targetQuantity: '5000',
    effectiveFrom: '2026-08-01',
    effectiveTo: null,
    ...over,
  });

  const resolveQb = (shiftRows: any[], generalRows: any[] = []) => {
    const qb = makeQb();
    let lastShiftParam: string | undefined;
    qb.andWhere.mockImplementation((expr: string, params?: any) => {
      if (params && 'shiftId' in params) lastShiftParam = params.shiftId;
      return qb;
    });
    qb.getMany.mockImplementation(async () => {
      if (lastShiftParam === SHIFT) return shiftRows;
      if (lastShiftParam === GEN) return generalRows;
      return [];
    });
    targetRepo.createQueryBuilder.mockReturnValue(qb);
    machineRepo.findOne.mockResolvedValue({
      id: MACHINE, companyId: COMPANY, isActive: true, status: 'ACTIVE',
      machineCode: 'ST-01', name: 'Straightener 01', machineNumber: 'ST # 01', machineId: 'MCH001',
    });
    return qb;
  };

  it('returns item info and targetPerHour in the resolved payload', async () => {
    resolveQb([targetRow()]);
    shiftRepo.findOne.mockResolvedValue({ id: SHIFT, companyId: COMPANY, shiftCode: 'SHIFT-A' });
    itemRepo.findOne.mockResolvedValue(activeItem());

    const res = await service.resolve(
      {
        machineId: MACHINE, shiftId: SHIFT, itemId: ITEM,
        productionDate: '2026-08-10', workingHours: 6,
      } as any,
      COMPANY,
    );
    expect(res.item.code).toBe('SAMPLE-WIRE-4.50');
    expect(res.item.baseUomId).toBe('base-kg');
    expect(res.targetPerHour).toBe(625);
    expect(res.calculatedTarget).toBe(3750);
    expect(res.standardTarget).toBe(5000);
    expect(res.usedGeneralFallback).toBe(false);
  });

  it('forwards the itemId filter into the effective-candidate query', async () => {
    const qb = resolveQb([targetRow()]);
    shiftRepo.findOne.mockResolvedValue({ id: SHIFT, companyId: COMPANY, shiftCode: 'SHIFT-A' });
    itemRepo.findOne.mockResolvedValue(activeItem());

    await service.resolve(
      { machineId: MACHINE, shiftId: SHIFT, itemId: ITEM, productionDate: '2026-08-10' } as any,
      COMPANY,
    );
    const paramCalls = qb.andWhere.mock.calls.map((c: any[]) => c[1]);
    expect(paramCalls.some((p: any) => p && p.itemId === ITEM)).toBe(true);
  });

  it('falls back to the GENERAL shift for the same item when needed', async () => {
    resolveQb([], [targetRow({ shiftId: GEN })]);
    shiftRepo.findOne.mockResolvedValue({ id: GEN, companyId: COMPANY, shiftCode: 'GENERAL', name: 'General Shift' });
    itemRepo.findOne.mockResolvedValue(activeItem());

    const res = await service.resolve(
      { machineId: MACHINE, shiftId: SHIFT, itemId: ITEM, productionDate: '2026-08-10', workingHours: 12 } as any,
      COMPANY,
    );
    expect(res.usedGeneralFallback).toBe(true);
    expect(res.calculatedTarget).toBe(7500);
    expect(res.targetPerHour).toBe(625);
  });
});

describe('import anchor helpers', () => {
  it('collapses every accepted header spelling onto one key', () => {
    expect(normaliseImportHeader('Machine Code')).toBe('machinecode');
    expect(normaliseImportHeader('machine_code')).toBe('machinecode');
    expect(normaliseImportHeader('  STANDARD-TARGET ')).toBe('standardtarget');
  });

  it('keeps anchors distinct across shift and item, including a null item', () => {
    expect(anchorKey(MACHINE, SHIFT, ITEM)).not.toBe(anchorKey(MACHINE, GEN, ITEM));
    expect(anchorKey(MACHINE, SHIFT, ITEM)).not.toBe(anchorKey(MACHINE, SHIFT, null));
    expect(anchorKey(MACHINE, SHIFT, null)).toBe(anchorKey(MACHINE, SHIFT, null));
    expect(machineItemKey(MACHINE, ITEM)).not.toBe(machineItemKey(MACHINE, null));
  });

  it('resolves an anchor to the open, in-effect, newest revision', () => {
    const rows = [
      { id: 'retired', isActive: false, status: 'INACTIVE', effectiveFrom: '2027-01-01', effectiveTo: null },
      { id: 'current', isActive: true, status: 'ACTIVE', effectiveFrom: '2026-01-01', effectiveTo: null },
      { id: 'closed', isActive: true, status: 'ACTIVE', effectiveFrom: '2025-01-01', effectiveTo: '2025-12-31' },
    ] as any[];
    expect(pickCurrentTarget(rows, '2026-10-08').id).toBe('current');
    expect(pickCurrentTarget([...rows].reverse(), '2026-10-08').id).toBe('current');
  });

  it('prefers live rows for the relaxed lookup, then falls back to history', () => {
    const live = { id: 'live', isActive: true, status: 'ACTIVE' } as any;
    const dead = { id: 'dead', isActive: false, status: 'INACTIVE' } as any;
    expect(relaxationCandidates([dead, live])).toEqual([live]);
    expect(relaxationCandidates([dead])).toEqual([dead]);
    expect(relaxationCandidates([])).toEqual([]);
    expect(relaxationCandidates(undefined)).toEqual([]);
  });
});

describe('MachineTargetService — smart upsert import', () => {
  const USER = '9f0d0000-0000-4000-8000-000000000001';
  const SHIFT2 = 'e5e5e5e5-0000-4000-8000-000000000002';

  const FULL_HEADER = [
    'Machine Code', 'Shift Code', 'UOM Code', 'Item Code', 'Standard Target',
    'Standard Hours', 'Effective From', 'Effective To', 'Status', 'Remarks',
  ];

  /** Never hand-count commas: pass the cells positionally. */
  const cells = (...values: string[]): string => values.join(',');
  const sheet = (header: string[], lines: string[]): Buffer =>
    Buffer.from([header.join(','), ...lines].join('\n'), 'utf-8');

  let tx: { updates: Array<{ id: string; patch: any }>; inserts: any[] };

  const baseRow = (over: any = {}): any => ({
    id: 'mt-1',
    companyId: COMPANY,
    machineId: MACHINE,
    shiftId: GEN,
    itemId: ITEM,
    uomId: UOM,
    targetQuantity: '5000.0000',
    standardHours: '8.0000',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    status: 'ACTIVE',
    isActive: true,
    remarks: 'original',
    ...over,
  });

  const wireImport = (existing: any[]): void => {
    machineRepo.find = jest.fn(async () => [
      { id: MACHINE, isActive: true, status: 'ACTIVE', machineCode: 'MCH032', machineNumber: null, divisionId: null },
    ]);
    shiftRepo.find = jest.fn(async () => [
      { id: GEN, isActive: true, shiftCode: 'GEN' },
      { id: SHIFT, isActive: true, shiftCode: 'SHIFT-1' },
      { id: SHIFT2, isActive: true, shiftCode: 'SHIFT-2' },
    ]);
    uomRepo.find = jest.fn(async () => [{ id: UOM, code: 'KG' }]);
    itemRepo.find = jest.fn(async () => [{ id: ITEM, isActive: true, itemCode: 'WIP-SPL-018' }]);
    targetRepo.find = jest.fn(async () => existing);

    tx = { updates: [], inserts: [] };
    targetRepo.manager = {
      transaction: jest.fn(async (cb: any) =>
        cb({
          getRepository: jest.fn(() => ({
            update: jest.fn(async (criteria: any, patch: any) => {
              tx.updates.push({ id: criteria.id, patch });
            }),
            create: jest.fn((entity: any) => ({ ...entity })),
            save: jest.fn(async (entity: any) => {
              const list = Array.isArray(entity) ? entity : [entity];
              tx.inserts.push(...list);
              return entity;
            }),
          })),
        }),
      ),
    };
  };

  const run = (header: string[], lines: string[]) =>
    service.importCsv(COMPANY, USER, sheet(header, lines));

  it('retains Standard Target / Hours when the anchor matches and the cells are blank', async () => {
    wireImport([baseRow()]);

    const res = await run(FULL_HEADER, [
      cells('MCH032', 'GEN', 'KG', 'WIP-SPL-018', '', '', '', '', 'ACTIVE', 'night run'),
    ]);

    expect(res.created).toBe(0);
    expect(res.updated).toBe(1);
    expect(tx.inserts).toHaveLength(0);
    expect(tx.updates).toHaveLength(1);
    expect(tx.updates[0].id).toBe('mt-1');
    // Zero-overwrite: neither untouched column enters the UPDATE at all.
    expect(tx.updates[0].patch).not.toHaveProperty('targetQuantity');
    expect(tx.updates[0].patch).not.toHaveProperty('standardHours');
    expect(tx.updates[0].patch.remarks).toBe('night run');
    expect(res.results[0].message).toContain('Remarks');
  });

  it('never writes a column that is excluded from the sheet', async () => {
    wireImport([baseRow()]);

    const res = await run(
      ['Machine Code', 'Shift Code', 'Item Code', 'Remarks'],
      [cells('MCH032', 'GEN', 'WIP-SPL-018', '')],
    );

    expect(res.updated).toBe(1);
    expect(tx.updates[0].patch).toEqual({ updatedBy: USER });
    expect(res.results[0].message).toMatch(/nothing changed/);
  });

  it('relaxes to [Machine + Item] and re-points the shift when the target is blank', async () => {
    wireImport([baseRow()]);

    const res = await run(FULL_HEADER, [
      cells('MCH032', 'SHIFT-1', 'KG', 'WIP-SPL-018', '', '', '', '', '', ''),
    ]);

    expect(res.created).toBe(0);
    expect(res.updated).toBe(1);
    expect(tx.updates[0].patch.shiftId).toBe(SHIFT);
    expect(tx.updates[0].patch).not.toHaveProperty('targetQuantity');
    expect(tx.updates[0].patch).not.toHaveProperty('standardHours');
  });

  it('inserts a brand-new shift target when the line carries every insert column', async () => {
    wireImport([baseRow()]);

    const res = await run(FULL_HEADER, [
      cells('MCH032', 'SHIFT-2', 'KG', 'WIP-SPL-018', '3000', '8', '2026-02-01', '', 'ACTIVE', ''),
    ]);

    expect(res.created).toBe(1);
    expect(res.updated).toBe(0);
    expect(tx.updates).toHaveLength(0);
    expect(tx.inserts).toHaveLength(1);
    expect(tx.inserts[0].shiftId).toBe(SHIFT2);
    expect(String(tx.inserts[0].targetQuantity)).toBe('3000');
    expect(tx.inserts[0].status).toBe('ACTIVE');
  });

  it('refuses to guess when the relaxed anchor matches more than one target', async () => {
    wireImport([baseRow(), baseRow({ id: 'mt-2', shiftId: SHIFT })]);

    const res = await run(FULL_HEADER, [
      cells('MCH032', 'SHIFT-2', 'KG', 'WIP-SPL-018', '', '', '', '', '', ''),
    ]);

    expect(res.updated).toBe(0);
    expect(res.created).toBe(0);
    expect(res.failed).toBe(1);
    expect(res.results[0].message).toMatch(/Ambiguous anchor/);
    expect(tx.updates).toHaveLength(0);
    expect(tx.inserts).toHaveLength(0);
  });

  it('reports an anchor the sheet cannot match and cannot create', async () => {
    wireImport([]);

    const res = await run(FULL_HEADER, [
      cells('MCH032', 'GEN', 'KG', 'WIP-SPL-018', '', '', '', '', '', ''),
    ]);

    expect(res.failed).toBe(1);
    expect(res.results[0].message).toMatch(/No existing target matches/);
    expect(res.results[0].message).toContain('Standard Target');
  });

  it('rejects a second line resolving to the same anchor', async () => {
    wireImport([baseRow()]);

    const res = await run(FULL_HEADER, [
      cells('MCH032', 'GEN', 'KG', 'WIP-SPL-018', '6000', '', '', '', '', ''),
      cells('MCH032', 'GEN', 'KG', 'WIP-SPL-018', '7000', '', '', '', '', ''),
    ]);

    expect(res.updated).toBe(1);
    expect(res.failed).toBe(1);
    const errorRow = res.results.find((r) => r.status === 'error');
    expect(errorRow?.row).toBe(3);
    expect(errorRow?.message).toMatch(/Duplicate row/);
    expect(tx.updates).toHaveLength(1);
  });

  it('rolls every write into a single transaction', async () => {
    wireImport([baseRow()]);

    await run(FULL_HEADER, [
      cells('MCH032', 'GEN', 'KG', 'WIP-SPL-018', '6000', '', '', '', '', ''),
      cells('MCH032', 'SHIFT-2', 'KG', 'WIP-SPL-018', '3000', '8', '2026-02-01', '', 'ACTIVE', ''),
    ]);

    expect(targetRepo.manager.transaction).toHaveBeenCalledTimes(1);
    expect(tx.updates).toHaveLength(1);
    expect(tx.inserts).toHaveLength(1);
  });
});
