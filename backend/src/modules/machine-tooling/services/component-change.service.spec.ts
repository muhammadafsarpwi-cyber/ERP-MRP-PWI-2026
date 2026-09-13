import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ComponentChangeService } from './component-change.service';
import { ComponentChange } from '../entities/component-change.entity';
import { MachineComponent } from '../entities/machine-component.entity';
import { Machine } from '../../production/entities/machine.entity';
import { MaintenanceJobCard } from '../../maintenance/entities/maintenance-job-card.entity';
import { CreateComponentChangeDto } from '../dto';
import { ComponentConditionStatus } from '../entities/component-change.entity';

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const MACHINE = '103be387-c310-40b0-a670-b787d81174cb';
const COMPONENT = '4ff84e90-bbb2-4ef5-9c79-e193a3ffa37e';
const JOB_CARD = '9d173c37-9f23-4b96-aa7c-de1a625debf8';

let service: ComponentChangeService;
let changeRepo: any;
let componentRepo: any;
let machineRepo: any;
let jobCardRepo: any;

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

const activeMachine = () => ({
  id: MACHINE, companyId: COMPANY, isActive: true, status: 'ACTIVE',
  machineId: 'MCH035', machineCode: 'FT-01', machineNumber: 'FT # 01', name: 'Flattening Machine FT-01',
});

const activeComponent = () => ({
  id: COMPONENT, companyId: COMPANY, machineId: MACHINE, isActive: true,
  componentCode: 'FT-DIE-001', componentName: 'Fine Blanking Die',
  component: { machine: { machineCode: 'FT-01' } },
});

const validDto = (): CreateComponentChangeDto => ({
  machineId: MACHINE,
  componentId: COMPONENT,
  newToolCode: 'DEMO-FT-DIE-010',
  oldToolCode: 'DEMO-FT-DIE-009',
  newToolDescription: 'DEMO - Fine Blanking Die',
  changeDate: '2026-09-02',
  changeTime: '09:30',
  productionCounterBefore: 178500,
  productionCounterAfter: 178500,
  reason: 'Tool life reached',
  conditionStatus: ComponentConditionStatus.USED,
});

const priorChange = (over: any = {}) => ({
  id: 'chg-1',
  companyId: COMPANY,
  machineId: MACHINE,
  componentId: COMPONENT,
  oldToolCode: null,
  newToolCode: 'DEMO-FT-DIE-009',
  changeDate: '2026-08-25',
  changeTime: '09:30',
  productionCounterBefore: null,
  productionCounterAfter: '125000.0000',
  productionSincePrevious: null,
  changedAt: new Date('2026-08-25T09:30:00Z'),
  ...over,
});

beforeEach(async () => {
  changeRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => {
      const id = x.id ?? 'chg-new';
      return { ...x, id, isActive: x.isActive ?? true };
    }),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn(() => makeQb()),
    manager: { query: jest.fn().mockResolvedValue([{ entry_count: 63, total_quantity: '689200.0000', last_entry_date: '2026-09-11' }]) },
  };
  componentRepo = { findOne: jest.fn().mockResolvedValue(null) };
  machineRepo = { findOne: jest.fn().mockResolvedValue(null) };
  jobCardRepo = { findOne: jest.fn().mockResolvedValue(null) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ComponentChangeService,
      { provide: getRepositoryToken(ComponentChange), useValue: changeRepo },
      { provide: getRepositoryToken(MachineComponent), useValue: componentRepo },
      { provide: getRepositoryToken(Machine), useValue: machineRepo },
      { provide: getRepositoryToken(MaintenanceJobCard), useValue: jobCardRepo },
    ],
  }).compile();

  service = moduleRef.get(ComponentChangeService);
});

describe('ComponentChangeService — production life (acceptance example)', () => {
  it('computes life since previous = counterBefore - previous.counterAfter (178500 - 125000 = 53500)', async () => {
    changeRepo.createQueryBuilder.mockReturnValue(
      Object.assign(makeQb(), { getMany: jest.fn().mockResolvedValue([priorChange()]) }),
    );
    const life = await service.computeLifeSincePrevious(
      COMPANY, COMPONENT, '2026-09-02', '09:30', 178500,
    );
    expect(life).toBe('53500');
  });

  it('returns null when there is no previous change (first install)', async () => {
    changeRepo.createQueryBuilder.mockReturnValue(
      Object.assign(makeQb(), { getMany: jest.fn().mockResolvedValue([]) }),
    );
    const life = await service.computeLifeSincePrevious(
      COMPANY, COMPONENT, '2026-08-25', '09:30', 125000,
    );
    expect(life).toBeNull();
  });

  it('returns null when counters are missing on either side', async () => {
    changeRepo.createQueryBuilder.mockReturnValue(
      Object.assign(makeQb(), {
        getMany: jest.fn().mockResolvedValue([priorChange({ productionCounterAfter: null })]),
      }),
    );
    const life = await service.computeLifeSincePrevious(
      COMPANY, COMPONENT, '2026-09-02', '09:30', 178500,
    );
    expect(life).toBeNull();
  });

  it('rejects a counter lower than the previous install counter (data-entry guard)', async () => {
    changeRepo.createQueryBuilder.mockReturnValue(
      Object.assign(makeQb(), { getMany: jest.fn().mockResolvedValue([priorChange()]) }),
    );
    await expect(
      service.computeLifeSincePrevious(COMPANY, COMPONENT, '2026-09-02', '09:30', 100000),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ComponentChangeService — create', () => {
  it('persists a change with derived life and audit fields', async () => {
    changeRepo.createQueryBuilder.mockReturnValue(
      Object.assign(makeQb(), { getMany: jest.fn().mockResolvedValue([priorChange()]) }),
    );
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue(activeComponent());
    changeRepo.findOne.mockResolvedValue({
      id: 'chg-new', companyId: COMPANY, machineId: MACHINE, componentId: COMPONENT, isActive: true,
      newToolCode: 'DEMO-FT-DIE-010', productionSincePrevious: '53500.0000', createdBy: 'user-1',
    });

    const result = await service.create(validDto(), COMPANY, 'user-1');
    expect(result.companyId).toBe(COMPANY);
    expect(result.createdBy).toBe('user-1');
    expect(changeRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ newToolCode: 'DEMO-FT-DIE-010', changedBy: 'user-1', productionSincePrevious: '53500' }),
    );
  });

  it('rejects machines outside the company (tenant isolation)', async () => {
    machineRepo.findOne.mockResolvedValue(null);
    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(NotFoundException);
  });

  it('rejects components tracked on a different machine', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue({
      ...activeComponent(),
      machineId: 'other-machine',
      component: { machine: { machineCode: 'SP-01' } },
    });
    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(/tracked on machine/);
  });

  it('rejects unknown components in the company', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue(null);
    await expect(service.create(validDto(), COMPANY)).rejects.toThrow(NotFoundException);
  });

  it('rejects unknown job cards when one is provided', async () => {
    changeRepo.createQueryBuilder.mockReturnValue(
      Object.assign(makeQb(), { getMany: jest.fn().mockResolvedValue([priorChange()]) }),
    );
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue(activeComponent());
    jobCardRepo.findOne.mockResolvedValue(null);
    await expect(
      service.create({ ...validDto(), jobCardId: JOB_CARD }, COMPANY),
    ).rejects.toThrow(NotFoundException);
  });

  it('accepts a valid optional job card link', async () => {
    changeRepo.createQueryBuilder.mockReturnValue(
      Object.assign(makeQb(), { getMany: jest.fn().mockResolvedValue([priorChange()]) }),
    );
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue(activeComponent());
    jobCardRepo.findOne.mockResolvedValue({ id: JOB_CARD, companyId: COMPANY, isActive: true });
    changeRepo.findOne.mockResolvedValue({ id: 'chg-new', jobCardId: JOB_CARD, productionSincePrevious: '53500.0000', isActive: true });

    const result = await service.create({ ...validDto(), jobCardId: JOB_CARD }, COMPANY);
    expect(result.jobCardId).toBe(JOB_CARD);
  });
});

describe('ComponentChangeService — current counter (documented approximation)', () => {
  it('derives the counter from the production-entries sum', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    changeRepo.createQueryBuilder.mockReturnValue(makeQb());
    const res = await service.currentCounter(COMPANY, MACHINE);
    expect(res.machine.machineCode).toBe('FT-01');
    expect(res.totalQuantity).toBe(689200);
    expect(res.entryCount).toBe(63);
    expect(res.base).toBe('PRODUCTION_ENTRIES_SUM');
    expect(changeRepo.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('production_entries'),
      [COMPANY, MACHINE],
    );
  });

  it('throws for machines outside the company', async () => {
    machineRepo.findOne.mockResolvedValue(null);
    await expect(service.currentCounter(COMPANY, MACHINE)).rejects.toThrow(NotFoundException);
  });
});

describe('ComponentChangeService — monthly consumption report', () => {
  const chg = (over: any = {}) => ({
    id: 'c',
    companyId: COMPANY,
    machineId: MACHINE,
    componentId: COMPONENT,
    machine: { id: MACHINE, machineCode: 'FT-01', name: 'Flattening Machine FT-01' },
    component: {
      id: COMPONENT, componentCode: 'FT-DIE-001', componentName: 'Fine Blanking Die',
      componentType: 'DIE', uom: { code: 'PCS' },
    },
    changeDate: '2026-09-02',
    newToolCode: 'DEMO-FT-DIE-010',
    productionSincePrevious: '53500.0000',
    ...over,
  });

  it('aggregates rows per machine+component with avg/min/max life', async () => {
    changeRepo.createQueryBuilder.mockReturnValue(
      Object.assign(makeQb(), {
        getMany: jest.fn().mockResolvedValue([
          chg(),
          chg({ id: 'c2', newToolCode: 'DEMO-FT-DIE-011', changeDate: '2026-09-10', productionSincePrevious: '64000.0000' }),
          chg({ id: 'c3', componentId: 'comp-roll', newToolCode: 'DEMO-FT-ROLL-007', component: {
            id: 'comp-roll', componentCode: 'FT-ROLL-001', componentName: 'Flattening Roller Set',
            componentType: 'TOOL', uom: { code: 'PCS' },
          } }),
        ]),
      }),
    );
    const res = await service.monthlyReport(COMPANY, '2026-09');
    expect(res.month).toBe('2026-09');
    expect(res.rows).toHaveLength(2);
    const dieRow = res.rows.find((r: any) => r.component.componentCode === 'FT-DIE-001');
    expect(dieRow.changes).toBe(2);
    expect(dieRow.productionCovered).toBe(117500);
    expect(dieRow.avgLife).toBe(58750);
    expect(dieRow.minLife).toBe(53500);
    expect(dieRow.maxLife).toBe(64000);
    expect(res.totals.changes).toBe(3);
    expect(res.totals.qtyUsed).toBe(3);
  });

  it('returns empty report when no changes fall in the month', async () => {
    changeRepo.createQueryBuilder.mockReturnValue(
      Object.assign(makeQb(), { getMany: jest.fn().mockResolvedValue([]) }),
    );
    const res = await service.monthlyReport(COMPANY, '2026-09');
    expect(res.rows).toEqual([]);
    expect(res.totals.changes).toBe(0);
  });
});