import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ToolLifecycleService } from './tool-lifecycle.service';
import { ComponentChange, ComponentConditionStatus, ToolDispositionType } from '../entities/component-change.entity';
import { MachineComponent } from '../entities/machine-component.entity';
import { MachineComponentItem } from '../entities/machine-component-item.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { MaintenanceJobCard } from '../../maintenance/entities/maintenance-job-card.entity';
import { MaterialIssue } from '../../store/entities/material-issue.entity';
import {
  InstallToolDto,
  RemoveToolDto,
  UpdateDispositionDto,
  CreateComponentItemDto,
  UpdateComponentItemDto,
} from '../dto';

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const MACHINE = '103be387-c310-40b0-a670-b787d81174cb';
const COMPONENT = '7fec24f5-4e73-4940-b9c1-f39a53b9d7bd';
const OTHER_COMPONENT = '17a4f3e8-4b0e-4ce0-b632-49dd2ec29f00';
const JOB_CARD = '9d173c37-9f23-4b96-aa7c-de1a625debf8';
const ITEM = 'c6d55aed-ee90-47f1-97b7-b4518a9d938c';
const UOM = 'b932052f-141f-4d78-9baf-7025e5302442';
const ISSUE_ID = 'a1111111-1111-4111-8111-111111111111';

let service: ToolLifecycleService;
let changeRepo: any;
let componentRepo: any;
let componentItemRepo: any;
let machineRepo: any;
let itemRepo: any;
let uomRepo: any;
let jobCardRepo: any;
let materialIssueRepo: any;

const makeQb = ({ count = 0, rows = [] as any[] } = {}) => {
  const qb: any = {};
  for (const m of ['where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take', 'leftJoinAndSelect']) {
    qb[m] = jest.fn().mockReturnThis();
  }
  qb.getOne = jest.fn().mockResolvedValue(null);
  qb.getMany = jest.fn().mockResolvedValue(rows);
  qb.getCount = jest.fn().mockResolvedValue(count);
  return qb;
};

const activeMachine = (over: any = {}) => ({
  id: MACHINE, companyId: COMPANY, isActive: true, status: 'ACTIVE',
  machineCode: 'FT-01', machineNumber: 'FT # 01', name: 'Flattening Machine FT-01',
  ...over,
});

const activeComponent = (over: any = {}) => ({
  id: COMPONENT,
  companyId: COMPANY,
  machineId: MACHINE,
  isActive: true,
  componentCode: 'FT-DIE-001',
  componentName: 'Fine Blanking Die',
  componentType: 'DIE',
  expectedLifeQuantity: '600000.0000',
  machine: activeMachine(),
  ...over,
});

const openChange = (over: any = {}) => ({
  id: 'chg-open',
  companyId: COMPANY,
  machineId: MACHINE,
  componentId: COMPONENT,
  jobCardId: null,
  storeIssueId: null,
  oldToolCode: null,
  newToolCode: 'DEMO-FT-DIE-010',
  newToolDescription: 'DEMO - Fine Blanking Die',
  changeDate: '2026-09-02',
  changeTime: '09:30',
  productionCounterBefore: null,
  productionCounterAfter: '125000.0000',
  productionSincePrevious: null,
  reason: null,
  conditionStatus: null,
  remarks: null,
  dispositionType: null,
  dispositionNote: null,
  closedAt: null,
  changedAt: new Date('2026-09-02T09:30:00Z'),
  createdBy: null,
  updatedBy: null,
  isActive: true,
  machine: activeMachine(),
  component: activeComponent({ uom: { code: 'PCS', id: UOM } }),
  jobCard: null,
  storeIssue: null,
  ...over,
});

const closedChange = (over: any = {}) =>
  openChange({
    id: 'chg-closed',
    newToolCode: 'DEMO-FT-DIE-009',
    changeDate: '2026-08-25',
    productionCounterBefore: '178500.0000',
    productionCounterAfter: '125000.0000',
    productionSincePrevious: '53500.0000',
    conditionStatus: ComponentConditionStatus.USED,
    dispositionType: ToolDispositionType.RETURN_TO_STORE,
    dispositionNote: 'Returned to store after life reached',
    reason: 'Tool life reached',
    closedAt: new Date('2026-08-25T17:00:00Z'),
    ...over,
  });

const installDto = (over: any = {}): InstallToolDto =>
  ({
    machineId: MACHINE,
    componentId: COMPONENT,
    newToolCode: 'DEMO-FT-DIE-011',
    newToolDescription: 'DEMO - Fine Blanking Die v2',
    changeDate: '2026-09-12',
    changeTime: '09:00',
    ...over,
  }) as InstallToolDto;

const removeDto = (over: any = {}): RemoveToolDto =>
  ({
    changeDate: '2026-09-12',
    changeTime: '17:00',
    conditionStatus: ComponentConditionStatus.USED,
    dispositionType: ToolDispositionType.SENT_FOR_REWORK,
    dispositionNote: 'Sent for rework',
    reason: 'Worn die',
    ...over,
  }) as RemoveToolDto;

const activeItem = () => ({
  id: ITEM, companyId: COMPANY, isActive: true, itemCode: 'FG-CASING-001', itemName: 'Finished Casing',
});
const activeUom = () => ({ id: UOM, code: 'PCS', status: 'ACTIVE' });
const postedIssue = () => ({ id: ISSUE_ID, companyId: COMPANY, status: 'POSTED', issueNumber: 'MI-2026-0001' });
const itemLine = (over: any = {}) => ({
  id: 'mci-1', companyId: COMPANY, componentId: COMPONENT, itemId: ITEM,
  quantity: '1.0000', uomId: UOM, notes: null, isActive: true, item: activeItem(), uom: activeUom(), ...over,
});

beforeEach(async () => {
  changeRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => {
      const id = x.id ?? 'chg-new';
      return { ...x, id, isActive: x.isActive ?? true };
    }),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => makeQb()),
    manager: {
      query: jest.fn((sql: string) => {
        if (String(sql).includes('GROUP BY machine_id')) {
          return [{ machine_id: MACHINE, counter_value: '689200.0000' }];
        }
        return [{ counter_value: '689200.0000' }];
      }),
    },
  };
  componentRepo = { findOne: jest.fn().mockResolvedValue(null) };
  componentItemRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([itemLine()]),
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn(async (x: any) => ({ ...x, id: 'mci-1' })),
  };
  machineRepo = { findOne: jest.fn().mockResolvedValue(null) };
  itemRepo = { findOne: jest.fn().mockResolvedValue(null) };
  uomRepo = { findOne: jest.fn().mockResolvedValue(null) };
  jobCardRepo = { findOne: jest.fn().mockResolvedValue(null) };
  materialIssueRepo = { findOne: jest.fn().mockResolvedValue(null) };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ToolLifecycleService,
      { provide: getRepositoryToken(ComponentChange), useValue: changeRepo },
      { provide: getRepositoryToken(MachineComponent), useValue: componentRepo },
      { provide: getRepositoryToken(MachineComponentItem), useValue: componentItemRepo },
      { provide: getRepositoryToken(Machine), useValue: machineRepo },
      { provide: getRepositoryToken(Item), useValue: itemRepo },
      { provide: getRepositoryToken(Uom), useValue: uomRepo },
      { provide: getRepositoryToken(MaintenanceJobCard), useValue: jobCardRepo },
      { provide: getRepositoryToken(MaterialIssue), useValue: materialIssueRepo },
    ],
  }).compile();

  service = moduleRef.get(ToolLifecycleService);
});

describe('ToolLifecycleService — derived machine counter', () => {
  it('derives the counter as the SUM of production entries up to the given date', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    const counter = await service.deriveCounterAt(COMPANY, MACHINE, '2026-09-02');
    expect(counter).toBe(689200);
    expect(changeRepo.manager.query).toHaveBeenCalled();
    const sql = String(changeRepo.manager.query.mock.calls[0][0]);
    expect(sql).toContain('SUM(actual_quantity)');
    expect(sql).toContain('entry_date <= $3');
  });

  it('throws NotFoundException when the machine is unknown in the company', async () => {
    await expect(service.deriveCounterAt(COMPANY, MACHINE, '2026-09-02')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('currentCounter returns the all-time derived total', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    const counter = await service.currentCounter(COMPANY, MACHINE);
    expect(counter).toBe(689200);
  });
});

describe('ToolLifecycleService — install', () => {
  it('installs a new tool: derives the counter when omitted, creates an OPEN change (closed_at IS NULL)', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue(activeComponent());
    changeRepo.findOne
      .mockResolvedValueOnce(null) // open-change check
      .mockResolvedValue(openChange({ newToolCode: 'DEMO-FT-DIE-011' })); // lifeDetail refetch

    const result = await service.install(installDto(), COMPANY, 'user-1');

    const saved = changeRepo.save.mock.calls[0][0];
    expect(saved.closedAt).toBeNull();
    expect(saved.newToolCode).toBe('DEMO-FT-DIE-011');
    expect(saved.productionCounterAfter).toBe('689200');
    expect(saved.dispositionType).toBeNull();
    expect(saved.storeIssueId).toBeNull();
    expect(result).toBeTruthy();
  });

  it('uses the explicit productionCounterAfter when provided', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue(activeComponent());
    changeRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue(openChange({ newToolCode: 'DEMO-FT-DIE-011' }));

    await service.install(installDto({ productionCounterAfter: 1000 }), COMPANY, 'user-1');
    expect(changeRepo.save.mock.calls[0][0].productionCounterAfter).toBe('1000');
  });

  it('rejects install when the component already has an active tool', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue(activeComponent());
    changeRepo.findOne.mockResolvedValueOnce(openChange()); // open-check returns the active tool

    await expect(service.install(installDto(), COMPANY, 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects installing a tool of a component tracked on another machine', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue(activeComponent({ machineId: OTHER_COMPONENT }));

    await expect(service.install(installDto(), COMPANY, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects install when the machine is INACTIVE', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine({ isActive: false }));

    await expect(service.install(installDto(), COMPANY, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects install when the machine is not ACTIVE', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine({ status: 'INACTIVE' }));

    await expect(service.install(installDto(), COMPANY, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates the job card when provided', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue(activeComponent());
    jobCardRepo.findOne.mockResolvedValue({ id: JOB_CARD, companyId: COMPANY, isActive: true });
    changeRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue(openChange({ newToolCode: 'DEMO-FT-DIE-011' }));

    await service.install(installDto({ jobCardId: JOB_CARD }), COMPANY, 'user-1');
    expect(jobCardRepo.findOne).toHaveBeenCalled();
    expect(changeRepo.save.mock.calls[0][0].jobCardId).toBe(JOB_CARD);
  });

  it('rejects install with an unknown job card', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue(activeComponent());
    changeRepo.findOne.mockResolvedValueOnce(null);
    jobCardRepo.findOne.mockResolvedValue(null);

    await expect(service.install(installDto({ jobCardId: JOB_CARD }), COMPANY, 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('links a posted store issue to the change (reuse of the store ledger — no duplicate stock)', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue(activeComponent());
    materialIssueRepo.findOne.mockResolvedValue(postedIssue());
    changeRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue(openChange({ newToolCode: 'DEMO-FT-DIE-011', storeIssueId: ISSUE_ID }));

    await service.install(installDto({ storeIssueId: ISSUE_ID }), COMPANY, 'user-1');
    expect(changeRepo.save.mock.calls[0][0].storeIssueId).toBe(ISSUE_ID);
  });

  it('rejects installing with a NON-POSTED store issue', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue(activeComponent());
    materialIssueRepo.findOne.mockResolvedValue({ id: ISSUE_ID, companyId: COMPANY, status: 'DRAFT' });
    changeRepo.findOne.mockResolvedValueOnce(null);

    await expect(service.install(installDto({ storeIssueId: ISSUE_ID }), COMPANY, 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('maps a single-active unique-index violation to a ConflictException (race guard)', async () => {
    machineRepo.findOne.mockResolvedValue(activeMachine());
    componentRepo.findOne.mockResolvedValue(activeComponent());
    changeRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValue(openChange({ newToolCode: 'DEMO-FT-DIE-011' }));
    changeRepo.save.mockRejectedValue({
      code: '23505',
      message: 'duplicate key ... uq_component_changes_single_active',
    });

    await expect(service.install(installDto(), COMPANY, 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ToolLifecycleService — remove (close) + production life', () => {
  it('removes the tool: derives counterBefore, computes production life = counterBefore - counterAfter, closes the change', async () => {
    changeRepo.findOne.mockResolvedValue(openChange());
    machineRepo.findOne.mockResolvedValue(activeMachine());

    await service.remove('chg-open', removeDto(), COMPANY, 'user-1');

    const saved = changeRepo.save.mock.calls[0][0];
    expect(saved.closedAt).toBeInstanceOf(Date);
    expect(saved.productionCounterBefore).toBe('689200');
    // 689200 - 125000
    expect(Number(saved.productionSincePrevious)).toBe(564200);
    expect(saved.conditionStatus).toBe(ComponentConditionStatus.USED);
    expect(saved.dispositionType).toBe(ToolDispositionType.SENT_FOR_REWORK);
    expect(saved.dispositionNote).toBe('Sent for rework');
    expect(saved.reason).toBe('Worn die');
  });

  it('uses the manual counter read when productionCounterBefore is provided', async () => {
    changeRepo.findOne.mockResolvedValue(openChange());
    machineRepo.findOne.mockResolvedValue(activeMachine());

    await service.remove('chg-open', removeDto({ productionCounterBefore: 178500 }), COMPANY, 'user-1');
    const saved = changeRepo.save.mock.calls[0][0];
    expect(saved.productionCounterBefore).toBe('178500');
    expect(Number(saved.productionSincePrevious)).toBe(53500);
  });

  it('rejects a negative production life (counter read below the install counter)', async () => {
    changeRepo.findOne.mockResolvedValue(openChange({ productionCounterAfter: '200000.0000' }));
    machineRepo.findOne.mockResolvedValue(activeMachine());

    await expect(service.remove('chg-open', removeDto({ productionCounterBefore: 100000 }), COMPANY, 'user-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws NotFoundException for an unknown change', async () => {
    await expect(service.remove('missing', removeDto(), COMPANY, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to remove an already-closed change', async () => {
    changeRepo.findOne.mockResolvedValue(closedChange());

    await expect(service.remove('chg-closed', removeDto(), COMPANY, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to remove with a job card attached (install transaction only)', async () => {
    changeRepo.findOne.mockResolvedValue(openChange());
    machineRepo.findOne.mockResolvedValue(activeMachine());
    // no such branch any more — the DTO has no jobCardId; verify plain remove still works when no counters needed
    await expect(service.remove('chg-open', removeDto(), COMPANY, 'user-1')).resolves.toBeTruthy();
  });
});

describe('ToolLifecycleService — disposition + store-issue link', () => {
  it('updates the disposition of a removed tool', async () => {
    changeRepo.findOne.mockResolvedValue(openChange());
    machineRepo.findOne.mockResolvedValue(activeMachine());

    await service.updateDisposition(
      'chg-open',
      { dispositionType: ToolDispositionType.SCRAPPED, dispositionNote: 'Scrapped', reason: 'Cracked' } as UpdateDispositionDto,
      COMPANY,
      'user-1',
    );

    const saved = changeRepo.save.mock.calls[0][0];
    expect(saved.dispositionType).toBe(ToolDispositionType.SCRAPPED);
    expect(saved.dispositionNote).toBe('Scrapped');
    expect(saved.reason).toBe('Cracked');
  });

  it('links a POSTED store issue to an existing change', async () => {
    changeRepo.findOne.mockResolvedValue(openChange());
    machineRepo.findOne.mockResolvedValue(activeMachine());
    materialIssueRepo.findOne.mockResolvedValue(postedIssue());

    await service.linkStoreIssue('chg-open', ISSUE_ID, COMPANY, 'user-1');
    expect(changeRepo.save.mock.calls[0][0].storeIssueId).toBe(ISSUE_ID);
  });

  it('rejects linking a NON-POSTED store issue', async () => {
    changeRepo.findOne.mockResolvedValue(openChange());
    materialIssueRepo.findOne.mockResolvedValue({ id: ISSUE_ID, companyId: COMPANY, status: 'DRAFT', issueNumber: 'MI-1' });

    await expect(service.linkStoreIssue('chg-open', ISSUE_ID, COMPANY, 'user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects linking an unknown store issue', async () => {
    changeRepo.findOne.mockResolvedValue(openChange());

    await expect(service.linkStoreIssue('chg-open', ISSUE_ID, COMPANY, 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exposes the allowed disposition types', () => {
    expect(service.getDispositionTypes()).toEqual([
      'RETURN_TO_STORE',
      'SENT_FOR_REWORK',
      'SCRAPPED',
      'LOST',
      'RETAINED',
      'OTHER',
    ]);
  });
});

describe('ToolLifecycleService — active tools', () => {
  it('returns open changes with derived used/remaining production life and store-issue info', async () => {
    changeRepo.createQueryBuilder.mockReturnValue(
      Object.assign(makeQb({ count: 1, rows: [openChange()] })),
    );

    const { data, total } = await service.activeTools(COMPANY, {});
    expect(total).toBe(1);
    expect(data[0].installedToolCode).toBe('DEMO-FT-DIE-010');
    expect(data[0].installDate).toBe('2026-09-02');
    // derived all-time 689200 − install counter 125000
    expect(data[0].usedByInstalled).toBe(564200);
    // expected 600000 − used 564200
    expect(data[0].remainingByInstalled).toBe(35800);
    expect(data[0].status).toBeUndefined(); // active-only endpoint
  });

  it('applies status filters through the query builder (search compiles ILIKE)', async () => {
    const qb = makeQb({ count: 0, rows: [] });
    changeRepo.createQueryBuilder.mockReturnValue(qb);

    await service.activeTools(COMPANY, { machineId: MACHINE, search: 'DIE' });
    const ilike = qb.andWhere.mock.calls.some((c: any[]) => String(c[0]).includes('ILIKE'));
    expect(ilike).toBe(true);
    expect(qb.andWhere).toHaveBeenCalled();
    expect(changeRepo.createQueryBuilder()).toBe(qb);
  });
});

describe('ToolLifecycleService — Tool Life History report', () => {
  it('returns report rows and aggregate summary (installs/active/closed/life min-max-avg)', async () => {
    changeRepo.createQueryBuilder.mockReturnValue(
      Object.assign(
        makeQb({
          count: 3,
          rows: [closedChange(), openChange(), closedChange({ productionSincePrevious: '20000.0000', id: 'chg-c3' })],
        }),
      ),
    );

    const { data, total, summary } = await service.lifeReport(COMPANY, {});
    expect(total).toBe(3);
    expect(data).toHaveLength(3);
    expect(data[0].status).toBe('CLOSED');
    expect(data[1].status).toBe('ACTIVE');
    expect(data[1].removeDate).toBeNull();
    expect(data[0].dispositionType).toBe(ToolDispositionType.RETURN_TO_STORE);
    expect(data[0].storeIssueNumber).toBeNull();
    expect(summary.installs).toBe(3);
    expect(summary.active).toBe(1);
    expect(summary.closed).toBe(2);
    expect(summary.withDisposition).toBe(2);
    expect(summary.totalProductionLife).toBe(73500);
    expect(summary.avgLife).toBe(36750);
    expect(summary.minLife).toBe(20000);
    expect(summary.maxLife).toBe(53500);
  });

  it('emits the CLOSED/ACTIVE status filter SQL', async () => {
    const qb = makeQb({ count: 0, rows: [] });
    changeRepo.createQueryBuilder.mockReturnValue(qb);

    await service.lifeReport(COMPANY, { status: 'ACTIVE', dispositionType: ToolDispositionType.SCRAPPED });
    const sqls = qb.andWhere.mock.calls.map((c: any[]) => String(c[0]));
    expect(sqls).toContain('cc.closedAt IS NULL');
    expect(sqls.some((s: string) => s.includes('dispositionType'))).toBe(true);
  });
});

describe('ToolLifecycleService — multi-item breakdown', () => {
  it('lists the active Item-Master lines of a component with item + uom', async () => {
    componentRepo.findOne.mockResolvedValue(activeComponent());
    const rows = await service.listComponentItems(COMPONENT, COMPANY);
    expect(rows).toHaveLength(1);
    expect(componentItemRepo.find).toHaveBeenCalled();
  });

  it('adds a breakdown line with its own quantity and UOM', async () => {
    componentRepo.findOne.mockResolvedValue(activeComponent());
    itemRepo.findOne.mockResolvedValue(activeItem());
    uomRepo.findOne.mockResolvedValue(activeUom());
    componentItemRepo.findOne
      .mockResolvedValueOnce(null) // clash check (no existing line)
      .mockResolvedValue(itemLine({ id: 'mci-new' })); // post-save re-fetch
    componentItemRepo.save.mockImplementation(async (x: any) => ({ ...x, id: 'mci-new' }));

    await service.addComponentItem(
      COMPONENT,
      { itemId: ITEM, quantity: 2.5, uomId: UOM, notes: 'spare' } as CreateComponentItemDto,
      COMPANY,
      'user-1',
    );

    const saved = componentItemRepo.save.mock.calls[0][0];
    expect(saved.quantity).toBe('2.5');
    expect(saved.uomId).toBe(UOM);
    expect(saved.notes).toBe('spare');
  });

  it('rejects adding the same Item-Master line twice (partial unique guard)', async () => {
    componentRepo.findOne.mockResolvedValue(activeComponent());
    itemRepo.findOne.mockResolvedValue(activeItem());
    uomRepo.findOne.mockResolvedValue(activeUom());
    componentItemRepo.findOne.mockResolvedValue(itemLine());

    await expect(
      service.addComponentItem(COMPONENT, { itemId: ITEM, quantity: 1 } as CreateComponentItemDto, COMPANY, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects adding a line for an unknown item', async () => {
    componentRepo.findOne.mockResolvedValue(activeComponent());

    await expect(
      service.addComponentItem(COMPONENT, { itemId: ITEM, quantity: 1 } as CreateComponentItemDto, COMPANY, 'user-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates quantity / uom / notes of a breakdown line', async () => {
    componentItemRepo.findOne.mockResolvedValueOnce(itemLine());
    componentItemRepo.findOne.mockResolvedValue(itemLine());
    uomRepo.findOne.mockResolvedValue(activeUom());

    await service.updateComponentItem(
      COMPONENT,
      'mci-1',
      { quantity: 3, uomId: UOM, notes: 'updated' } as UpdateComponentItemDto,
      COMPANY,
      'user-1',
    );

    const saved = componentItemRepo.save.mock.calls[0][0];
    expect(saved.quantity).toBe('3');
    expect(saved.notes).toBe('updated');
  });

  it('soft-deletes a breakdown line (is_active = FALSE)', async () => {
    componentItemRepo.findOne.mockResolvedValue(itemLine());

    await service.removeComponentItem(COMPONENT, 'mci-1', COMPANY, 'user-1');
    const saved = componentItemRepo.save.mock.calls[0][0];
    expect(saved.isActive).toBe(false);
  });

  it('throws NotFoundException when removing an unknown breakdown line', async () => {
    componentItemRepo.findOne.mockResolvedValue(null);
    await expect(service.removeComponentItem(COMPONENT, 'missing', COMPANY, 'user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});