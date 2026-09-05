import { getMetadataArgsStorage } from 'typeorm';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProductionEntryService } from './production-entry.service';
import { ProductionEntry, ProductionEntryItem, ProductionEntryDowntime, Machine, Shift, DowntimeReason, ProductionOrder, ProductionOrderOperation } from '../entities';
import { Item, Uom, UomConversion } from '../../item/entities';
import { Division, Section, Department, Warehouse } from '../../organization/entities';
import { BillOfMaterials, BomLine } from '../../bom/entities';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { MachineTargetService } from '../../machine-target/services/machine-target.service';
import { ProductionRoutingService } from '../../production-routing/services/production-routing.service';

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';

const makeOrgMocks = () => {
  divisionRepo.findOne.mockResolvedValue({ id: 'div-1', name: 'Control Cable Division', status: 'ACTIVE' });
  sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', name: 'Spiral', divisionId: 'div-1' });
  departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', name: 'Spiral', divisionId: 'div-1', sectionId: 'sec-1', status: 'ACTIVE' });
};

let service: ProductionEntryService;
let entryRepo: any;
let machineRepo: any;
let shiftRepo: any;
let downtimeReasonRepo: any;
let itemRepo: any;
let uomConversionRepo: any;
let divisionRepo: any;
let sectionRepo: any;
let departmentRepo: any;
let productionOrderRepo: any;
let productionOrderOperationRepo: any;
let entryItemRepo: any;
let entryDowntimeRepo: any;
let stockLedgerService: any;
let balanceService: any;
let machineTargetService: any;
let productionRoutingService: any;
let bomRepo: any;
let bomLineRepo: any;
let warehouseRepo: any;
let uomRepo: any;

const validDto = () => ({
  divisionId: 'div-1',
  sectionId: 'sec-1',
  departmentId: 'dept-1',
  entryDate: '2026-08-21',
  shiftId: 'shift-1',
  machineNo: 'SR-01',
  operatorName: 'Ali Raza',
  supervisorName: 'Kamran Sheikh',
  itemId: 'item-1',
  uomId: 'uom-m',
  targetQuantity: 8000,
  actualQuantity: 7200,
  runningHours: 7,
  downtimeHours: 1,
  scrapQuantity: 150,
});

beforeEach(async () => {
  entryRepo = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ ...x, id: x.id ?? 'entry-1' })),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(),
    // Minimal in-transaction manager so `entryRepo.manager.transaction(...)`
    // (used by atomic inventory posting) is exercised in unit tests.
    manager: {
      transaction: jest.fn(async (cb: (m: any) => Promise<any>) =>
        cb({
          getRepository: jest.fn((e: any) => ({
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            save: jest.fn((x: any) => ({ ...x, id: x.id ?? 'entry-1' })),
            findOne: jest.fn().mockResolvedValue(null),
          })),
        })),
    },
  };
  const machineQb = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
  });
  machineRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => x),
    createQueryBuilder: jest.fn(() => machineQb()),
  };
  shiftRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'shift-1', companyId: COMPANY, plannedHours: 8, isActive: true }),
    find: jest.fn().mockResolvedValue([]),
  };
  downtimeReasonRepo = { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]) };
  itemRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'item-1', companyId: COMPANY, itemCode: 'CC-SPIRAL', baseUomId: 'uom-m', status: 'ACTIVE' }),
  };
  uomConversionRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    manager: { getRepository: jest.fn().mockReturnValue({ findOne: jest.fn().mockResolvedValue(null) }) },
  };
  divisionRepo = { findOne: jest.fn() };
  sectionRepo = { findOne: jest.fn() };
  departmentRepo = { findOne: jest.fn() };
  productionOrderRepo = { findOne: jest.fn() };
  productionOrderOperationRepo = { findOne: jest.fn() };
  entryItemRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => x), delete: jest.fn().mockResolvedValue({ affected: 0 }), find: jest.fn().mockResolvedValue([]) };
  entryDowntimeRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => x), delete: jest.fn().mockResolvedValue({ affected: 0 }), find: jest.fn().mockResolvedValue([]) };
  stockLedgerService = { create: jest.fn().mockResolvedValue({ id: 'ledger-ref-1' }) };
  balanceService = { updateBalance: jest.fn(), getAvailableStock: jest.fn() };
  bomRepo = { find: jest.fn().mockResolvedValue([]) };
  bomLineRepo = { find: jest.fn().mockResolvedValue([]) };
  warehouseRepo = { findOne: jest.fn().mockResolvedValue(null) };
  uomRepo = { findOne: jest.fn().mockResolvedValue(null) };
  machineTargetService = {
    resolveEffectiveEntity: jest.fn().mockResolvedValue({ target: null, usedGeneralFallback: false }),
    resolve: jest.fn().mockResolvedValue({ effectiveTargetRecordId: 'mt-1', usedGeneralFallback: false }),
  };
  productionRoutingService = {
    getEffectiveRouteForItem: jest.fn().mockRejectedValue(new NotFoundException('no routing')),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ProductionEntryService,
      { provide: getRepositoryToken(ProductionEntry), useValue: entryRepo },
      { provide: getRepositoryToken(Machine), useValue: machineRepo },
      { provide: getRepositoryToken(Shift), useValue: shiftRepo },
      { provide: getRepositoryToken(DowntimeReason), useValue: downtimeReasonRepo },
      { provide: getRepositoryToken(Item), useValue: itemRepo },
      { provide: getRepositoryToken(UomConversion), useValue: uomConversionRepo },
      { provide: getRepositoryToken(Division), useValue: divisionRepo },
      { provide: getRepositoryToken(Section), useValue: sectionRepo },
      { provide: getRepositoryToken(Department), useValue: departmentRepo },
      { provide: getRepositoryToken(ProductionOrder), useValue: productionOrderRepo },
      { provide: getRepositoryToken(ProductionOrderOperation), useValue: productionOrderOperationRepo },
      { provide: getRepositoryToken(ProductionEntryItem), useValue: entryItemRepo },
      { provide: getRepositoryToken(ProductionEntryDowntime), useValue: entryDowntimeRepo },
      { provide: getRepositoryToken(BillOfMaterials), useValue: bomRepo },
      { provide: getRepositoryToken(BomLine), useValue: bomLineRepo },
      { provide: getRepositoryToken(Warehouse), useValue: warehouseRepo },
      { provide: getRepositoryToken(Uom), useValue: uomRepo },
      { provide: StockLedgerService, useValue: stockLedgerService },
      { provide: InventoryBalanceService, useValue: balanceService },
      {
        provide: MachineTargetService,
        useValue: machineTargetService,
      },
      { provide: ProductionRoutingService, useValue: productionRoutingService },
    ],
  }).compile();

  service = moduleRef.get(ProductionEntryService);
});

describe('ProductionEntryService — calculations', () => {
  it('computes achievement % as actual/target×100 (7200/8000 = 90)', async () => {
    makeOrgMocks();
    const saved = await service.create(validDto() as any, COMPANY);
    expect(saved.achievementPercentage).toBe(90);
  });

  it('computes achievement with decimals (4500/5000 = 90; 5500/6000 = 91.67)', async () => {
    makeOrgMocks();
    const a = await service.create({ ...validDto(), actualQuantity: 4500, targetQuantity: 5000 } as any, COMPANY);
    expect(a.achievementPercentage).toBe(90);
    const b = await service.create({ ...validDto(), actualQuantity: 5500, targetQuantity: 6000 } as any, COMPANY);
    expect(b.achievementPercentage).toBe(91.67);
  });

  it('computes efficiency % from running hours vs shift planned hours (7/8 = 87.5)', async () => {
    makeOrgMocks();
    const saved = await service.create(validDto() as any, COMPANY);
    expect(saved.efficiencyPercentage).toBe(87.5);
  });

  it('falls back to running+downtime when shift has no planned hours', async () => {
    makeOrgMocks();
    shiftRepo.findOne.mockResolvedValue({ id: 'shift-1', companyId: COMPANY, plannedHours: 0, isActive: true });
    const saved = await service.create(validDto() as any, COMPANY);
    expect(saved.efficiencyPercentage).toBe(Math.round((7 / 8) * 100 * 100) / 100);
  });
});

describe('ProductionEntryService — validation', () => {
  it('rejects invalid Division → Section chain', async () => {
    divisionRepo.findOne.mockResolvedValue({ id: 'div-1', name: 'D', status: 'ACTIVE' });
    sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', name: 'S', divisionId: 'OTHER-DIVISION' });
    await expect(service.create(validDto() as any, COMPANY)).rejects.toThrow(BadRequestException);
  });

  it('rejects Department outside the selected Section/Division', async () => {
    makeOrgMocks();
    departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', name: 'X', divisionId: 'div-1', sectionId: 'OTHER-SECTION', status: 'ACTIVE' });
    await expect(service.create(validDto() as any, COMPANY)).rejects.toThrow(BadRequestException);
  });

  it('rejects unknown division', async () => {
    divisionRepo.findOne.mockResolvedValue(null);
    await expect(service.create(validDto() as any, COMPANY)).rejects.toThrow(NotFoundException);
  });

  it('rejects inactive division', async () => {
    divisionRepo.findOne.mockResolvedValue({ id: 'div-1', name: 'D', status: 'INACTIVE' });
    await expect(service.create(validDto() as any, COMPANY)).rejects.toThrow(BadRequestException);
  });

  it('rejects item not found in company (company isolation on items)', async () => {
    makeOrgMocks();
    itemRepo.findOne.mockResolvedValue(null);
    await expect(service.create(validDto() as any, COMPANY)).rejects.toThrow(NotFoundException);
  });

  it('rejects UOM that is neither the item base UOM nor convertible', async () => {
    makeOrgMocks();
    await expect(service.create({ ...validDto(), uomId: 'uom-bad' } as any, COMPANY)).rejects.toThrow(BadRequestException);
  });

  it('accepts a UOM that has an inverse conversion defined to base UOM', async () => {
    makeOrgMocks();
    uomConversionRepo.findOne.mockImplementation(async (opts: { where: { fromUomId: string; toUomId: string } }) =>
      opts.where.fromUomId === 'item-1-base-x' ? null : { id: 'conv', conversionFactor: 2 });
    itemRepo.findOne.mockResolvedValue({ id: 'item-1', companyId: COMPANY, itemCode: 'CC', baseUomId: 'item-1-base-x', status: 'ACTIVE' });
    const saved = await service.create(validDto() as any, COMPANY);
    expect(saved.uomId).toBe('uom-m');
  });

  it('rejects targetQuantity <= 0', async () => {
    makeOrgMocks();
    await expect(service.create({ ...validDto(), targetQuantity: 0 } as any, COMPANY)).rejects.toThrow(BadRequestException);
    await expect(service.create({ ...validDto(), targetQuantity: -5 } as any, COMPANY)).rejects.toThrow(BadRequestException);
  });

  it('rejects negative actual/scrap/hours', async () => {
    makeOrgMocks();
    await expect(service.create({ ...validDto(), actualQuantity: -1 } as any, COMPANY)).rejects.toThrow(BadRequestException);
    await expect(service.create({ ...validDto(), scrapQuantity: -1 } as any, COMPANY)).rejects.toThrow(BadRequestException);
    await expect(service.create({ ...validDto(), runningHours: -1 } as any, COMPANY)).rejects.toThrow(BadRequestException);
    await expect(service.create({ ...validDto(), downtimeHours: -1 } as any, COMPANY)).rejects.toThrow(BadRequestException);
  });

  it('rejects downtime exceeding the shift planned hours (13h downtime on an 8h shift)', async () => {
    makeOrgMocks();
    await expect(
      service.create({ ...validDto(), runningHours: 0, downtimeHours: 9 } as any, COMPANY),
    ).rejects.toThrow(/cannot exceed the selected shift's planned hours/);
  });

  it('accepts downtime equal to the shift planned hours boundary (running becomes 0)', async () => {
    makeOrgMocks();
    const saved = await service.create({ ...validDto(), runningHours: 0, downtimeHours: 8 } as any, COMPANY);
    expect(saved.efficiencyPercentage).toBe(0);
  });

  it('rejects duplicate submission for same dept/date/shift/machine/item', async () => {
    makeOrgMocks();
    entryRepo.findOne.mockImplementation(async (opts: { where: { itemId?: string } }) =>
      opts.where.itemId ? { id: 'existing-entry' } : null);
    await expect(service.create(validDto() as any, COMPANY)).rejects.toThrow(ConflictException);
  });
});

describe('ProductionEntryService — production order linkage', () => {
  it('rejects order linkage when order not found in company', async () => {
    makeOrgMocks();
    productionOrderRepo.findOne.mockResolvedValue(null);
    await expect(service.create({ ...validDto(), productionOrderId: 'po-x' } as any, COMPANY)).rejects.toThrow(NotFoundException);
  });

  it('rejects entry whose item differs from the production order product', async () => {
    makeOrgMocks();
    productionOrderRepo.findOne.mockResolvedValue({ id: 'po-x', companyId: COMPANY, productId: 'other-product' });
    await expect(service.create({ ...validDto(), productionOrderId: 'po-x' } as any, COMPANY)).rejects.toThrow(BadRequestException);
  });

  it('accepts valid order linkage and validates operation belongs to the order', async () => {
    makeOrgMocks();
    productionOrderRepo.findOne.mockResolvedValue({ id: 'po-x', companyId: COMPANY, productId: 'item-1' });
    await expect(
      service.create({ ...validDto(), productionOrderId: 'po-x', productionOrderOperationId: 'op-x' } as any, COMPANY),
    ).rejects.toThrow(NotFoundException);
    productionOrderOperationRepo.findOne.mockResolvedValue({ id: 'op-x', productionOrderId: 'po-x' });
    await service.create({ ...validDto(), productionOrderId: 'po-x', productionOrderOperationId: 'op-x' } as any, COMPANY);
    expect(entryRepo.save).toHaveBeenCalled();
  });

  it('rejects postToInventory together with a production order (double-posting guard)', async () => {
    makeOrgMocks();
    productionOrderRepo.findOne.mockResolvedValue({ id: 'po-x', companyId: COMPANY, productId: 'item-1' });
    await expect(
      service.create({ ...validDto(), productionOrderId: 'po-x', postToInventory: true, warehouseId: 'wh-1' } as any, COMPANY),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ProductionEntryService — inventory integration (make-to-stock)', () => {
  it('posts PRODUCTION_RECEIPT IN + scrap OUT via existing ledger when postToInventory is true', async () => {
    makeOrgMocks();
    const saved = await service.create({ ...validDto(), postToInventory: true, warehouseId: 'wh-1' } as any, COMPANY);
    expect(stockLedgerService.create).toHaveBeenCalledTimes(2);
    expect(stockLedgerService.create.mock.calls[0][0]).toMatchObject({
      transactionType: 'PRODUCTION_RECEIPT',
      direction: 'IN',
      itemId: 'item-1',
      warehouseId: 'wh-1',
      quantity: 7200,
      referenceType: 'PRODUCTION_ENTRY',
    });
    expect(stockLedgerService.create.mock.calls[1][0]).toMatchObject({
      transactionType: 'PRODUCTION_SCRAP',
      direction: 'OUT',
      quantity: 150,
    });
    expect(balanceService.updateBalance).toHaveBeenCalledWith(COMPANY, 'item-1', 'wh-1', null, null, 'uom-m', 7200, 'IN', expect.anything());
    expect(saved.id).toBe('entry-1');
  });

  it('requires warehouse when postToInventory is true and skips posting otherwise', async () => {
    makeOrgMocks();
    await expect(service.create({ ...validDto(), postToInventory: true } as any, COMPANY)).rejects.toThrow(BadRequestException);
    await service.create(validDto() as any, COMPANY);
    expect(stockLedgerService.create).not.toHaveBeenCalled();
  });

  it('skips scrap ledger entry when scrap is zero', async () => {
    makeOrgMocks();
    await service.create({ ...validDto(), scrapQuantity: 0, postToInventory: true, warehouseId: 'wh-1' } as any, COMPANY);
    expect(stockLedgerService.create).toHaveBeenCalledTimes(1);
  });
});

describe('ProductionEntryService — queries & masters', () => {
  it('findAll applies filters and company isolation', async () => {
    const qbMock = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'e1' }], 1]),
    };
    entryRepo.createQueryBuilder.mockReturnValue(qbMock);
    const res = await service.findAll(COMPANY, { departmentId: 'dept-1', dateFrom: '2026-08-01', dateTo: '2026-08-21', shiftId: 'shift-1', machineNo: 'SR', itemId: 'item-1', productionOrderId: 'po-1', divisionId: 'div-1', sectionId: 'sec-1' });
    expect(res.total).toBe(1);
    expect(qbMock.where).toHaveBeenCalledWith('pe.companyId = :companyId', { companyId: COMPANY });
    expect(qbMock.andWhere).toHaveBeenCalledTimes(10);
  });

  it('findOne enforces company isolation', async () => {
    entryRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne('e1', COMPANY)).rejects.toThrow(NotFoundException);
  });

  it('machine master rejects duplicate code per company', async () => {
    machineRepo.findOne.mockResolvedValueOnce({ id: 'm1', machineCode: 'SR-01' });
    await expect(service.createMachine({ machineCode: 'SR-01', name: 'Spiral 1' } as any, COMPANY)).rejects.toThrow(ConflictException);
  });

  it('machine master creates machine scoped to company + department', async () => {
    departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', status: 'ACTIVE', name: 'Spiral' });
    await service.createMachine({ machineCode: 'SR-09', name: 'Spiral 9', departmentId: 'dept-1' } as any, COMPANY);
    expect(machineRepo.save).toHaveBeenCalled();
  });
});

describe('ProductionEntryService — update & delete', () => {
  it('update recalculates metrics and validates merged values', async () => {
    makeOrgMocks();
    entryRepo.findOne
      .mockResolvedValueOnce({
        id: 'entry-1', companyId: COMPANY, isActive: true,
        divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dept-1',
        entryDate: '2026-08-21', shiftId: 'shift-1', machineNo: 'SR-01',
        itemId: 'item-1', uomId: 'uom-m', targetQuantity: 8000, actualQuantity: 4000,
        scrapQuantity: 0, runningHours: 4, downtimeHours: 4,
      })
      .mockResolvedValue(null);
    const qbMock = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    entryRepo.createQueryBuilder.mockReturnValue(qbMock);

    const updated = await service.update('entry-1', { actualQuantity: 8000 } as any, COMPANY);
    expect(updated.achievementPercentage).toBe(100);
    expect(updated.actualQuantity).toBe(8000);
    expect(updated.targetQuantity).toBe(8000); // target never overwritten by update of other fields
  });

  it('update keeps target separate from actual (target never overwritten silently)', async () => {
    makeOrgMocks();
    entryRepo.findOne
      .mockResolvedValueOnce({
        id: 'entry-1', companyId: COMPANY, isActive: true,
        divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dept-1',
        entryDate: '2026-08-21', shiftId: 'shift-1', machineNo: 'SR-01',
        itemId: 'item-1', uomId: 'uom-m', targetQuantity: 8000, actualQuantity: 7000,
        scrapQuantity: 10, runningHours: 7, downtimeHours: 1,
      })
      .mockResolvedValue(null);
    entryRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(null),
    });
    const updated = await service.update('entry-1', { runningHours: 6 } as any, COMPANY);
    expect(updated.targetQuantity).toBe(8000);
    expect(updated.actualQuantity).toBe(7000);
    expect(updated.runningHours).toBe(6);
    expect(updated.efficiencyPercentage).toBe(75);
  });

  it('soft-deletes instead of hard delete', async () => {
    entryRepo.findOne.mockResolvedValue({ id: 'entry-1', companyId: COMPANY, isActive: true });
    const res = await service.remove('entry-1', COMPANY);
    expect(res).toBeUndefined();
    expect(entryRepo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
  });

  it('remove enforces company isolation', async () => {
    entryRepo.findOne.mockResolvedValue(null);
    await expect(service.remove('e-other-company', COMPANY)).rejects.toThrow(NotFoundException);
  });
});

describe('ProductionEntryService — multi-item & multi-downtime child persistence', () => {
  it('create persists production item lines (multi-item production)', async () => {
    makeOrgMocks();
    entryItemRepo.save.mockClear();
    entryItemRepo.create.mockClear();

    await service.create({
      ...validDto(),
      items: [
        { lineNumber: 1, itemId: 'item-1', uomId: 'uom-m', targetQuantity: 5000, actualQuantity: 4500, scrapQuantity: 100, runningHours: 7, remarks: 'spool 1' },
        { lineNumber: 2, itemId: 'item-2', uomId: 'uom-m', targetQuantity: 3000, actualQuantity: 2700, scrapQuantity: 50, runningHours: 7, remarks: 'spool 2' },
      ],
    } as any, COMPANY);

    expect(entryItemRepo.save).toHaveBeenCalledTimes(1);
    const rows = entryItemRepo.create.mock.calls.map((c: any) => c[0]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ lineNumber: 1, itemId: 'item-1', actualQuantity: 4500, scrapQuantity: 100 });
    expect(rows[1]).toMatchObject({ lineNumber: 2, itemId: 'item-2', actualQuantity: 2700 });
  });

  it('create persists downtime lines (multi-downtime shift)', async () => {
    makeOrgMocks();
    entryDowntimeRepo.save.mockClear();
    entryDowntimeRepo.create.mockClear();

    await service.create({
      ...validDto(),
      downtimeHours: 3,
      downtimes: [
        { lineNumber: 1, downtimeReasonId: 'reason-setup', downtimeReason: null, downtimeHours: 1, remarks: 'setup' },
        { lineNumber: 2, downtimeReasonId: 'reason-power', downtimeReason: null, downtimeHours: 1, remarks: 'power failure' },
        { lineNumber: 3, downtimeReasonId: 'reason-maint', downtimeReason: null, downtimeHours: 1, remarks: 'maintenance' },
      ],
    } as any, COMPANY);

    expect(entryDowntimeRepo.save).toHaveBeenCalledTimes(1);
    const rows = entryDowntimeRepo.create.mock.calls.map((c: any) => c[0]);
    expect(rows).toHaveLength(3);
    expect(rows.reduce((s: number, r: any) => s + Number(r.downtimeHours), 0)).toBe(3);
    expect(rows[0]).toMatchObject({ downtimeReasonId: 'reason-setup', downtimeHours: 1 });
  });

  it('create persists an "Other" downtime reason text', async () => {
    makeOrgMocks();
    entryDowntimeRepo.create.mockClear();
    await service.create({
      ...validDto(),
      downtimeHours: 0.5,
      downtimes: [{ lineNumber: 1, downtimeReasonId: 'reason-other', downtimeReason: 'custom fault', downtimeHours: 0.5, remarks: '' }],
    } as any, COMPANY);
    const rows = entryDowntimeRepo.create.mock.calls.map((c: any) => c[0]);
    expect(rows[0]).toMatchObject({ downtimeReasonText: 'custom fault' });
  });

  it('findOne attaches child production item + downtime lines ordered by line number', async () => {
    makeOrgMocks();
    entryRepo.findOne.mockResolvedValue({
      id: 'entry-1', companyId: COMPANY, isActive: true, itemId: 'item-1',
      runningHours: 5, downtimeHours: 3,
    });
    entryItemRepo.find.mockResolvedValue([
      { id: 'item-line-1', lineNumber: 1, itemId: 'item-1', actualQuantity: 20, scrapQuantity: 0 },
      { id: 'item-line-2', lineNumber: 2, itemId: 'item-2', actualQuantity: 30, scrapQuantity: 0 },
    ]);
    entryDowntimeRepo.find.mockResolvedValue([
      { id: 'dt-1', lineNumber: 1, downtimeReasonId: 'reason-maint', downtimeReason: { name: 'Machine Maintenance' }, downtimeHours: 1, remarks: 'maintenance' },
      { id: 'dt-2', lineNumber: 2, downtimeReasonId: 'reason-power', downtimeReason: { name: 'Power Failure' }, downtimeHours: 1, remarks: null },
      { id: 'dt-3', lineNumber: 3, downtimeReasonId: 'reason-manpower', downtimeReason: { name: 'Manpower Unavailable' }, downtimeHours: 1, remarks: 'no operator' },
    ]);

    const found: any = await service.findOne('entry-1', COMPANY);

    expect(found.items).toHaveLength(2);
    expect(found.items[0]).toMatchObject({ lineNumber: 1, actualQuantity: 20 });
    expect(found.downtimes).toHaveLength(3);
    expect(found.downtimes.reduce((s: number, d: any) => s + Number(d.downtimeHours), 0)).toBe(3);
    // The reason relation is loaded so the View can show the human-readable name.
    expect(found.downtimes[0].downtimeReason.name).toBe('Machine Maintenance');
    expect(entryDowntimeRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { productionEntryId: 'entry-1' },
      relations: ['downtimeReason'],
    }));
  });

  it('update replaces child lines (delete then re-save)', async () => {
    makeOrgMocks();
    entryRepo.findOne
      .mockResolvedValueOnce({
        id: 'entry-1', companyId: COMPANY, isActive: true,
        divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dept-1',
        entryDate: '2026-08-21', shiftId: 'shift-1', machineNo: 'SR-01',
        itemId: 'item-1', uomId: 'uom-m', targetQuantity: 8000, actualQuantity: 7200,
        scrapQuantity: 150, runningHours: 7, downtimeHours: 1,
      })
      .mockResolvedValue(null);
    entryRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(null),
    });
    entryItemRepo.delete.mockClear();
    entryDowntimeRepo.delete.mockClear();
    entryItemRepo.save.mockClear();
    entryDowntimeRepo.save.mockClear();

    await service.update('entry-1', {
      runningHours: 6,
      items: [{ lineNumber: 1, itemId: 'item-1', uomId: 'uom-m', targetQuantity: 8000, actualQuantity: 6000, scrapQuantity: 0, runningHours: 6, remarks: null }],
      downtimes: [{ lineNumber: 1, downtimeReasonId: 'reason-setup', downtimeReason: null, downtimeHours: 2, remarks: null }],
    } as any, COMPANY);

    expect(entryItemRepo.delete).toHaveBeenCalledWith({ productionEntryId: 'entry-1' });
    expect(entryDowntimeRepo.delete).toHaveBeenCalledWith({ productionEntryId: 'entry-1' });
    expect(entryItemRepo.save).toHaveBeenCalledTimes(1);
    expect(entryDowntimeRepo.save).toHaveBeenCalledTimes(1);
  });

  it('round-trip: create persists child lines that findOne later returns (genuine save→load flow, not aggregate-derived)', async () => {
    makeOrgMocks();
    entryDowntimeRepo.create.mockClear();
    entryItemRepo.create.mockClear();
    entryDowntimeRepo.find.mockClear();
    entryItemRepo.find.mockClear();

    // Simulate the DB rows that create()'s persistChildren actually writes:
    // capture the objects handed to the child repos' create()+save().
    const persistedDowntimes: any[] = [];
    const persistedItems: any[] = [];
    entryDowntimeRepo.create.mockImplementation((row: any) => ({ id: `dt-${row.lineNumber}`, ...row }));
    entryDowntimeRepo.save.mockImplementation(async (rows: any) => (Array.isArray(rows) ? rows : rows));
    entryItemRepo.create.mockImplementation((row: any) => ({ id: `il-${row.lineNumber}`, ...row }));
    entryItemRepo.save.mockImplementation(async (rows: any) => (Array.isArray(rows) ? rows : rows));

    await service.create({
      ...validDto(),
      itemId: 'item-1', uomId: 'uom-m',
      runningHours: 5, downtimeHours: 3,
      items: [
        { lineNumber: 1, itemId: 'item-1', uomId: 'uom-m', targetQuantity: 5000, actualQuantity: 4500, scrapQuantity: 100, runningHours: 5, remarks: 'spool 1' },
        { lineNumber: 2, itemId: 'item-2', uomId: 'uom-m', targetQuantity: 3000, actualQuantity: 2700, scrapQuantity: 50, runningHours: 5, remarks: 'spool 2' },
      ],
      downtimes: [
        { lineNumber: 1, downtimeReasonId: 'reason-maint', downtimeReason: null, downtimeHours: 2, remarks: 'maintenance' },
        { lineNumber: 2, downtimeReasonId: 'reason-power', downtimeReason: null, downtimeHours: 1, remarks: 'power failure' },
      ],
    } as any, COMPANY);

    persistedDowntimes.push(...entryDowntimeRepo.create.mock.calls.map((c: any) => c[0]).flat());
    persistedItems.push(...entryItemRepo.create.mock.calls.map((c: any) => c[0]).flat());

    // Now the DB holds the persisted child rows; findOne must return exactly those.
    entryRepo.findOne.mockResolvedValue({ id: 'e-1', companyId: COMPANY, isActive: true, itemId: 'item-1', runningHours: 5, downtimeHours: 3 });
    entryItemRepo.find.mockResolvedValue(persistedItems.sort((a: any, b: any) => a.lineNumber - b.lineNumber));
    entryDowntimeRepo.find.mockResolvedValue(
      persistedDowntimes.sort((a: any, b: any) => a.lineNumber - b.lineNumber)
    );

    const found: any = await service.findOne('e-1', COMPANY);

    // The View renders these persisted child lines directly (not the aggregate downtimeHours).
    expect(found.downtimes).toHaveLength(2);
    expect(found.downtimes.reduce((s: number, d: any) => s + Number(d.downtimeHours), 0)).toBe(3);
    expect(found.items).toHaveLength(2);
    expect(found.items[0]).toMatchObject({ lineNumber: 1, actualQuantity: 4500, remarks: 'spool 1' });
    // The persisted downtime reason ids survive the full create→findOne round-trip.
    expect(found.downtimes.map((d: any) => d.downtimeReasonId).sort()).toEqual(['reason-maint', 'reason-power']);
    expect(found.downtimes.map((d: any) => d.remarks).sort()).toEqual(['maintenance', 'power failure']);
  });
});

describe('ProductionEntryService — machine entry status (duplicate pre-check)', () => {
  const machines = [
    { id: 'm-uuid-1', machineId: 'MCH001', machineCode: 'SR-01', name: 'Spiral 1', isActive: true, divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dept-1', department: { id: 'dept-1', name: 'Spiral' } },
    { id: 'm-uuid-2', machineId: 'MCH002', machineCode: 'SR-02', name: 'Spiral 2', isActive: true, divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dept-1', department: { id: 'dept-1', name: 'Spiral' } },
    { id: 'm-uuid-3', machineId: 'MCH003', machineCode: 'BL-01', name: 'Barrel 1', isActive: true, divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dept-2', department: { id: 'dept-2', name: 'Plating' } },
  ];

  const mockQbs = (entryRows: any[]) => {
    const machineQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(machines),
    };
    const entryQb = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(entryRows),
    };
    machineRepo.createQueryBuilder.mockReturnValue(machineQb);
    entryRepo.createQueryBuilder.mockReturnValue(entryQb);
    return { machineQb, entryQb };
  };

  it('flags machines with an active entry as ENTERED and the rest ENTRY_REQUIRED with correct counts', async () => {
    const rows = [
      { id: 'e1', machineNo: 'SR-01', itemId: 'item-1', targetQuantity: '100', actualQuantity: '80', item: { name: 'Cable A' } },
    ];
    mockQbs(rows);

    const res = await service.getMachineEntryStatus(COMPANY, { entryDate: '2026-08-23', shiftId: 'shift-1' });

    expect(res.data).toHaveLength(3);
    expect(res.data.find((m) => m.machineCode === 'SR-01')!.status).toBe('ENTERED');
    expect(res.data.find((m) => m.machineCode === 'SR-01')!.entryCount).toBe(1);
    expect(res.data.find((m) => m.machineCode === 'SR-01')!.entries[0].itemName).toBe('Cable A');
    expect(res.data.find((m) => m.machineCode === 'SR-02')!.status).toBe('ENTRY_REQUIRED');
    expect(res.data.find((m) => m.machineCode === 'BL-01')!.status).toBe('ENTRY_REQUIRED');
    expect(res.meta).toEqual({
      totalMachines: 3, enteredCount: 1, entryRequiredCount: 2,
      entryDate: '2026-08-23', shiftId: 'shift-1',
    });
  });

  it('matches machine_no case-insensitively and groups multiple entries per machine', async () => {
    const rows = [
      { id: 'e1', machineNo: 'sr-02', itemId: 'item-1', targetQuantity: '10', actualQuantity: '5', item: null },
      { id: 'e2', machineNo: 'SR-02', itemId: 'item-2', targetQuantity: '20', actualQuantity: '9', item: null },
    ];
    mockQbs(rows);

    const res = await service.getMachineEntryStatus(COMPANY, { entryDate: '2026-08-23', shiftId: 'shift-1' });

    const sr2 = res.data.find((m) => m.machineCode === 'SR-02')!;
    expect(sr2.status).toBe('ENTERED');
    expect(sr2.entryCount).toBe(2);
    expect(sr2.entries.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('applies organizational filters to both machines and entries queries', async () => {
    const { entryQb } = mockQbs([]);

    await service.getMachineEntryStatus(COMPANY, {
      entryDate: '2026-08-23', shiftId: 'shift-1',
      divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dept-1',
    });

    const entryAndWheres = entryQb.andWhere.mock.calls.map((c) => c[0] as string);
    expect(entryAndWheres.some((s) => s.includes('pe.divisionId'))).toBe(true);
    expect(entryAndWheres.some((s) => s.includes('pe.sectionId'))).toBe(true);
    expect(entryAndWheres.some((s) => s.includes('pe.departmentId'))).toBe(true);
    expect(entryAndWheres.some((s) => s.includes('pe.entryDate'))).toBe(true);
    expect(entryAndWheres.some((s) => s.includes('pe.shiftId'))).toBe(true);
  });

  it('rejects an unknown shift for this company', async () => {
    shiftRepo.findOne.mockResolvedValue(null);
    mockQbs([]);
    await expect(
      service.getMachineEntryStatus(COMPANY, { entryDate: '2026-08-23', shiftId: 'shift-x' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ProductionEntryService — PROMPT-11: item-scoped target resolution', () => {
  const machineLinkedDto = () => ({
    ...validDto(),
    machineId: 'm-1',
    machineNo: undefined as unknown as string,
    uomId: 'uom-kg',
    targetQuantity: undefined as unknown as number,
    runningHours: 8,
  });

  const mockLinkedMachine = () => {
    machineRepo.findOne.mockResolvedValue({ id: 'm-1', companyId: COMPANY, machineCode: 'NP-02', isActive: true, departmentId: 'dept-1' });
  };

  it('prefers the item-scoped target (resolveEffectiveEntity called with itemId)', async () => {
    makeOrgMocks();
    mockLinkedMachine();
    machineTargetService.resolveEffectiveEntity.mockImplementation(async (_c: string, _m: string, _s: string, _d: string, _fb: boolean, _u: string | undefined, itemId?: string) =>
      itemId === 'item-1'
        ? { target: { id: 'mt-item', itemId: 'item-1', uomId: 'uom-kg', targetQuantity: 5000, standardHours: 8, item: { itemCode: 'WIRE' } }, usedGeneralFallback: false }
        : { target: null, usedGeneralFallback: false });
    const saved = await service.create(machineLinkedDto() as any, COMPANY);
    const firstCall = machineTargetService.resolveEffectiveEntity.mock.calls[0];
    expect(firstCall[6]).toBe('item-1');
    expect(saved.targetQuantity).toBe(5000); // 8h working hours = full standard target
    expect(saved.uomId).toBe('uom-kg'); // target UOM is authoritative
    expect(saved.machineTargetId).toBe('mt-item');
    expect(saved.calculatedTarget).toBe(5000);
  });

  it('falls back to the legacy generic target when the item has no specific one', async () => {
    makeOrgMocks();
    mockLinkedMachine();
    machineTargetService.resolveEffectiveEntity
      .mockResolvedValueOnce({ target: null, usedGeneralFallback: false }) // item-specific pass: miss
      .mockResolvedValueOnce({
        target: { id: 'mt-generic', itemId: null, uomId: 'uom-kg', targetQuantity: 4000, standardHours: 8 },
        usedGeneralFallback: false,
      }); // legacy pass: hit
    const saved = await service.create(machineLinkedDto() as any, COMPANY);
    expect(machineTargetService.resolveEffectiveEntity).toHaveBeenCalledTimes(2);
    expect(machineTargetService.resolveEffectiveEntity.mock.calls[1][6]).toBeUndefined();
    expect(saved.targetQuantity).toBe(4000);
    expect(saved.machineTargetId).toBe('mt-generic');
  });

  it('prorates the resolved target for partial working hours (6h of an 8h/5000 shift → 3750)', async () => {
    makeOrgMocks();
    mockLinkedMachine();
    machineTargetService.resolveEffectiveEntity.mockImplementation(async (_c: string, _m: string, _s: string, _d: string, _fb: boolean, _u: string | undefined, itemId?: string) =>
      itemId === 'item-1'
        ? { target: { id: 'mt-item', itemId: 'item-1', uomId: 'uom-kg', targetQuantity: 5000, standardHours: 8 }, usedGeneralFallback: false }
        : { target: null, usedGeneralFallback: false });
    const saved = await service.create({ ...machineLinkedDto(), runningHours: 6 } as any, COMPANY);
    expect(saved.targetQuantity).toBe(3750);
  });

  it('rejects a manually entered targetQuantity when a machine target governs the entry', async () => {
    makeOrgMocks();
    mockLinkedMachine();
    machineTargetService.resolveEffectiveEntity.mockImplementation(async (_c: string, _m: string, _s: string, _d: string, _fb: boolean, _u: string | undefined, itemId?: string) =>
      itemId === 'item-1'
        ? { target: { id: 'mt-item', itemId: 'item-1', uomId: 'uom-kg', targetQuantity: 5000, standardHours: 8 }, usedGeneralFallback: false }
        : { target: null, usedGeneralFallback: false });
    await expect(
      service.create({ ...machineLinkedDto(), runningHours: 7, targetQuantity: 9999 } as any, COMPANY),
    ).rejects.toThrow(/must not be entered manually/);
  });

  it('rejects entries when no target exists at all for the machine+shift', async () => {
    makeOrgMocks();
    mockLinkedMachine();
    await expect(service.create(machineLinkedDto() as any, COMPANY)).rejects.toThrow(/No active target is configured/);
  });

  it('rejects an entry whose requested UOM differs from the resolved target UOM', async () => {
    makeOrgMocks();
    mockLinkedMachine();
    machineTargetService.resolveEffectiveEntity.mockResolvedValue({
      target: { id: 'mt-item', itemId: 'item-1', uomId: 'uom-kg', targetQuantity: 5000, standardHours: 8, item: { itemCode: 'WIRE' } },
      usedGeneralFallback: false,
    });
    await expect(
      service.create({ ...machineLinkedDto(), uomId: 'uom-meter' } as any, COMPANY),
    ).rejects.toThrow(/Incompatible UOM/);
  });
});

describe('ProductionEntryService — PROMPT-11: derived-UOM validation (PROMPT-09 calculator)', () => {
  const uomById = (id: string) => {
    const map: Record<string, { code: string; uomType: string }> = {
      'uom-m': { code: 'M', uomType: 'LENGTH' },
      'uom-kg': { code: 'KG', uomType: 'WEIGHT' },
      'uom-pcs': { code: 'PCS', uomType: 'COUNT' },
    };
    return map[id] ?? null;
  };

  const enableCalculatorUoms = () => {
    uomConversionRepo.manager.getRepository = jest.fn().mockReturnValue({
      findOne: jest.fn(async (opts: { where: { id: string } }) => uomById(opts.where.id)),
    });
  };

  it('accepts KG production recorded in PCS when the item carries piecesPerKg (derived conversion, no table row)', async () => {
    makeOrgMocks();
    enableCalculatorUoms();
    itemRepo.findOne.mockResolvedValue({
      id: 'item-1', companyId: COMPANY, itemCode: 'WIRE', status: 'ACTIVE',
      baseUomId: 'uom-kg', piecesPerKg: 10.672,
    });
    const saved = await service.create({ ...validDto(), uomId: 'uom-pcs' } as any, COMPANY);
    expect(saved.uomId).toBe('uom-pcs');
  });

  it('accepts a same-family alternative UOM without any conversion data', async () => {
    makeOrgMocks();
    enableCalculatorUoms();
    itemRepo.findOne.mockResolvedValue({
      id: 'item-1', companyId: COMPANY, itemCode: 'ROD', status: 'ACTIVE',
      baseUomId: 'uom-kg',
    });
    // uom-pcs vs KG would fail, but another WEIGHT-family UOM passes via familyOf identity.
    uomConversionRepo.manager.getRepository = jest.fn().mockReturnValue({
      findOne: jest.fn(async (opts: { where: { id: string } }) =>
        opts.where.id === 'uom-kg' ? { code: 'KG', uomType: 'WEIGHT' } : opts.where.id === 'uom-lb' ? { code: 'LB', uomType: 'WEIGHT' } : null),
    });
    const saved = await service.create({ ...validDto(), uomId: 'uom-lb' } as any, COMPANY);
    expect(saved.uomId).toBe('uom-lb');
  });

  it('rejects PCS with a clear missing-data message when the LENGTH-based item has no piece data', async () => {
    makeOrgMocks();
    enableCalculatorUoms();
    itemRepo.findOne.mockResolvedValue({
      id: 'item-1', companyId: COMPANY, itemCode: 'NIPPLE', status: 'ACTIVE',
      baseUomId: 'uom-m', piecesPerKg: 400,
    });
    await expect(
      service.create({ ...validDto(), uomId: 'uom-pcs' } as any, COMPANY),
    ).rejects.toThrow(/requires conversion data that item 'NIPPLE' does not have/);
  });

  it('still rejects UOMs outside the production families entirely', async () => {
    makeOrgMocks();
    enableCalculatorUoms();
    itemRepo.findOne.mockResolvedValue({
      id: 'item-1', companyId: COMPANY, itemCode: 'WIRE', status: 'ACTIVE',
      baseUomId: 'uom-kg', piecesPerKg: 10,
    });
    await expect(
      service.create({ ...validDto(), uomId: 'uom-bad' } as any, COMPANY),
    ).rejects.toThrow(/not valid for item 'WIRE'/);
  });
});

describe('ProductionEntryService — PROMPT-11: enriched entry-context preview', () => {
  it('returns the target resolution plus shift plannedHours and the effective route', async () => {
    machineTargetService.resolve.mockResolvedValue({ effectiveTargetRecordId: 'mt-9', usedGeneralFallback: false, standardTarget: 5000 });
    productionRoutingService.getEffectiveRouteForItem.mockResolvedValue({
      id: 'route-1', routingCode: 'RT-1', name: 'Wire line',
      operations: [{ id: 'op-1', sequenceNo: 10 }],
    });
    const res = await service.resolveEntryContext(COMPANY, {
      machineId: 'm-1', shiftId: 'shift-1', productionDate: '2026-08-24', itemId: 'item-1',
    });
    expect(res.effectiveTargetRecordId).toBe('mt-9');
    expect(res.plannedHours).toBe(8);
    expect(res.route.routingCode).toBe('RT-1');
    expect(productionRoutingService.getEffectiveRouteForItem).toHaveBeenCalledWith('item-1', COMPANY);
  });

  it('treats a missing route as non-fatal (route: null) and skips lookup without an item', async () => {
    machineTargetService.resolve.mockResolvedValue({ effectiveTargetRecordId: 'mt-9', usedGeneralFallback: false });
    productionRoutingService.getEffectiveRouteForItem.mockRejectedValue(new NotFoundException('no routing'));
    const withItem = await service.resolveEntryContext(COMPANY, {
      machineId: 'm-1', shiftId: 'shift-1', productionDate: '2026-08-24', itemId: 'item-x',
    });
    expect(withItem.route).toBeNull();
    const noItem = await service.resolveEntryContext(COMPANY, {
      machineId: 'm-1', shiftId: 'shift-1', productionDate: '2026-08-24',
    });
    expect(noItem.route).toBeNull();
    expect(productionRoutingService.getEffectiveRouteForItem).toHaveBeenCalledTimes(1);
  });

  it('findAll supports the new machineId/uomId/search filters', async () => {
    const qbMock = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    entryRepo.createQueryBuilder.mockReturnValue(qbMock);
    await service.findAll(COMPANY, { machineId: 'm-1', uomId: 'uom-kg', search: 'ali' });
    const wheres = qbMock.andWhere.mock.calls.map((c: any[]) => c[0] as string);
    expect(wheres.some((w) => w.includes('pe.machineId'))).toBe(true);
    expect(wheres.some((w) => w.includes('pe.uomId'))).toBe(true);
    expect(wheres.some((w) => w.includes('ILIKE :search'))).toBe(true);
  });
});

describe('ProductionEntryService — automatic BOM consumption', () => {
  const setupBom = (opts?: { baseQuantity?: number; lines?: Array<any> }) => {
    const baseQuantity = opts?.baseQuantity ?? 1;
    bomRepo.find.mockResolvedValue([{ id: 'bom-1', productId: 'item-1', baseQuantity, status: 'ACTIVE', effectiveFrom: null, effectiveTo: null }]);
    bomLineRepo.find.mockResolvedValue(opts?.lines ?? [
      { id: 'bl-1', lineNumber: 1, itemId: 'raw-a', quantity: 0.8, uomId: 'uom-kg', scrapFactor: 0, yieldPercentage: 100 },
      { id: 'bl-2', lineNumber: 2, itemId: 'raw-b', quantity: 0.1, uomId: 'uom-kg', scrapFactor: 0, yieldPercentage: 100 },
    ]);
    itemRepo.findOne.mockImplementation(({ where }: any) =>
      where.id === 'item-1'
        ? Promise.resolve({ id: 'item-1', companyId: COMPANY, itemCode: 'FG-SPIRAL', baseUomId: 'uom-m', status: 'ACTIVE' })
        : Promise.resolve({ id: where.id, companyId: COMPANY, baseUomId: 'uom-kg', status: 'ACTIVE' }),
    );
    uomRepo.findOne.mockResolvedValue({ id: 'uom-kg', code: 'kg' });
    warehouseRepo.findOne.mockResolvedValue({ id: 'rw-wh-1', status: 'ACTIVE' });
  };
  const entry = () => ({ ...validDto(), postToInventory: true, warehouseId: 'wh-1', rawMaterialWarehouseId: 'rw-wh-1' } as any);

  it('consumes all ACTIVE BOM components and then posts the production receipt', async () => {
    makeOrgMocks();
    setupBom();
    balanceService.getAvailableStock.mockResolvedValue(100000);
    const saved = await service.create(entry(), COMPANY);

    const consumes = stockLedgerService.create.mock.calls.filter((c: any) => c[0].transactionType === 'PRODUCTION_CONSUMPTION');
    expect(consumes.length).toBe(2);
    expect(consumes[0][0]).toMatchObject({ itemId: 'raw-a', quantity: 5760, direction: 'OUT', uomId: 'uom-kg', referenceType: 'PRODUCTION_ENTRY', referenceId: 'entry-1', warehouseId: 'rw-wh-1' });
    expect(consumes[1][0]).toMatchObject({ itemId: 'raw-b', quantity: 720 });

    const receipt = stockLedgerService.create.mock.calls.find((c: any) => c[0].transactionType === 'PRODUCTION_RECEIPT');
    expect(receipt[0]).toMatchObject({ itemId: 'item-1', direction: 'IN', warehouseId: 'wh-1', quantity: 7200 });

    const outs = balanceService.updateBalance.mock.calls.filter((c: any) => c[7] === 'OUT');
    expect(outs.length).toBe(2);
    expect(outs[0]).toEqual([COMPANY, 'raw-a', 'rw-wh-1', null, null, 'uom-kg', 5760, 'OUT', expect.anything()]);
    expect(saved.rawMaterialWarehouseId).toBe('rw-wh-1');
  });

  it('rejects production when a component is insufficient — no partial deduction, no receipt', async () => {
    makeOrgMocks();
    setupBom();
    balanceService.getAvailableStock.mockImplementation((_c: any, itemId: string) =>
      Promise.resolve(itemId === 'raw-a' ? 100 : 100000));
    await expect(service.create(entry(), COMPANY)).rejects.toThrow('Raw material stock is insufficient');
    expect(stockLedgerService.create).not.toHaveBeenCalled();
    expect(balanceService.updateBalance).not.toHaveBeenCalled();
  });

  it('rejects when the production item has no ACTIVE BOM', async () => {
    makeOrgMocks();
    bomRepo.find.mockResolvedValue([]);
    warehouseRepo.findOne.mockResolvedValue({ id: 'rw-wh-1', status: 'ACTIVE' });
    await expect(service.create(entry(), COMPANY)).rejects.toThrow('No ACTIVE BOM exists');
    expect(stockLedgerService.create).not.toHaveBeenCalled();
    expect(balanceService.updateBalance).not.toHaveBeenCalled();
  });

  it('computes requirement from BOM base quantity, scrap factor and yield %', async () => {
    makeOrgMocks();
    setupBom({ baseQuantity: 2, lines: [
      { id: 'bl-1', lineNumber: 1, itemId: 'raw-a', quantity: 0.5, uomId: 'uom-kg', scrapFactor: 0.1, yieldPercentage: 80 },
    ] });
    balanceService.getAvailableStock.mockResolvedValue(100000);
    await service.create(entry(), COMPANY);
    const consumes = stockLedgerService.create.mock.calls.filter((c: any) => c[0].transactionType === 'PRODUCTION_CONSUMPTION');
    // units = 7200 / 2 = 3600; req = 3600 * 0.5 * (1.1) / 0.8 = 2475
    expect(consumes[0][0].quantity).toBe(2475);
  });

  it('rejects an invalid raw-material source warehouse', async () => {
    makeOrgMocks();
    setupBom();
    warehouseRepo.findOne.mockResolvedValue(null);
    await expect(service.create(entry(), COMPANY)).rejects.toThrow('Raw Material Source Warehouse not found');
  });

  it('TASK34B-J: consumes the exact Item Master IN Item even when the ACTIVE BOM does not list it', async () => {
    makeOrgMocks();
    setupBom();
    itemRepo.findOne.mockImplementation(({ where }: any) => {
      if (where.id === 'item-1') return Promise.resolve({ id: 'item-1', companyId: COMPANY, itemCode: 'FG-SPIRAL', baseUomId: 'uom-m', status: 'ACTIVE', productionInItemId: 'raw-x' });
      if (where.id === 'raw-a') return Promise.resolve({ id: 'raw-a', companyId: COMPANY, baseUomId: 'uom-kg', status: 'ACTIVE' });
      if (where.id === 'raw-b') return Promise.resolve({ id: 'raw-b', companyId: COMPANY, baseUomId: 'uom-kg', status: 'ACTIVE' });
      if (where.id === 'raw-x') return Promise.resolve({ id: 'raw-x', companyId: COMPANY, baseUomId: 'uom-m', status: 'ACTIVE' });
      return Promise.resolve({ id: where.id, companyId: COMPANY, baseUomId: 'uom-kg', status: 'ACTIVE' });
    });
    balanceService.getAvailableStock.mockResolvedValue(100000);
    await service.create(entry(), COMPANY);

    const consumes = stockLedgerService.create.mock.calls.filter((c: any) => c[0].transactionType === 'PRODUCTION_CONSUMPTION');
    // BOM lines (raw-a, raw-b) PLUS the authoritative Item Master IN Item (raw-x) at 1:1 per unit.
    expect(consumes.length).toBe(3);
    expect(consumes[0][0]).toMatchObject({ itemId: 'raw-a', quantity: 5760, direction: 'OUT', warehouseId: 'rw-wh-1' });
    expect(consumes[1][0]).toMatchObject({ itemId: 'raw-b', quantity: 720 });
    expect(consumes[2][0]).toMatchObject({ itemId: 'raw-x', quantity: 7200, uomId: 'uom-m', direction: 'OUT' });
  });

  it('TASK34B-K: consumes the exact Item Master IN Item even when no BOM exists', async () => {
    makeOrgMocks();
    bomRepo.find.mockResolvedValue([]);
    warehouseRepo.findOne.mockResolvedValue({ id: 'rw-wh-1', status: 'ACTIVE' });
    itemRepo.findOne.mockImplementation(({ where }: any) => {
      if (where.id === 'item-1') return Promise.resolve({ id: 'item-1', companyId: COMPANY, itemCode: 'FG-SPIRAL', baseUomId: 'uom-m', status: 'ACTIVE', productionInItemId: 'raw-x' });
      if (where.id === 'raw-x') return Promise.resolve({ id: 'raw-x', companyId: COMPANY, baseUomId: 'uom-m', status: 'ACTIVE' });
      return Promise.resolve({ id: where.id, companyId: COMPANY, baseUomId: 'uom-kg', status: 'ACTIVE' });
    });
    uomRepo.findOne.mockResolvedValue({ id: 'uom-m', code: 'M' });
    balanceService.getAvailableStock.mockResolvedValue(100000);
    await service.create(entry(), COMPANY);

    const consumes = stockLedgerService.create.mock.calls.filter((c: any) => c[0].transactionType === 'PRODUCTION_CONSUMPTION');
    expect(consumes.length).toBe(1);
    expect(consumes[0][0]).toMatchObject({ itemId: 'raw-x', quantity: 7200, direction: 'OUT', uomId: 'uom-m', referenceId: 'entry-1' });

    const receipt = stockLedgerService.create.mock.calls.find((c: any) => c[0].transactionType === 'PRODUCTION_RECEIPT');
    expect(receipt[0]).toMatchObject({ itemId: 'item-1', direction: 'IN', warehouseId: 'wh-1', quantity: 7200 });
  });
});

describe('ProductionEntryService — atomic create (no orphan entries)', () => {
  const setupBom = () => {
    bomRepo.find.mockResolvedValue([{ id: 'bom-1', productId: 'item-1', baseQuantity: 1, status: 'ACTIVE', effectiveFrom: null, effectiveTo: null }]);
    bomLineRepo.find.mockResolvedValue([
      { id: 'bl-1', lineNumber: 1, itemId: 'raw-a', quantity: 1, uomId: 'uom-m', scrapFactor: 0, yieldPercentage: 100 },
    ]);
    itemRepo.findOne.mockImplementation(({ where }: any) =>
      where.id === 'item-1'
        ? Promise.resolve({ id: 'item-1', companyId: COMPANY, itemCode: 'FG', baseUomId: 'uom-m', status: 'ACTIVE' })
        : Promise.resolve({ id: where.id, companyId: COMPANY, baseUomId: 'uom-m', status: 'ACTIVE' }),
    );
    uomRepo.findOne.mockResolvedValue({ id: 'uom-m', code: 'M' });
    warehouseRepo.findOne.mockResolvedValue({ id: 'rw-wh-1', status: 'ACTIVE' });
  };
  const entryDto = () => ({ ...validDto(), postToInventory: true, warehouseId: 'wh-1', rawMaterialWarehouseId: 'rw-wh-1' } as any);

  it('failed posting leaves NO orphan production entry (entry save is inside the atomic transaction)', async () => {
    makeOrgMocks();
    setupBom();
    balanceService.getAvailableStock.mockResolvedValue(0); // insufficient
    entryRepo.save.mockClear();

    await expect(service.create(entryDto(), COMPANY)).rejects.toThrow('Raw material stock is insufficient');

    // The entry must NOT have been committed via the plain repository —
    // it is only saved inside the transaction, which rolled back.
    expect(entryRepo.save).not.toHaveBeenCalled();
    expect(stockLedgerService.create).not.toHaveBeenCalled();
    expect(balanceService.updateBalance).not.toHaveBeenCalled();
  });

  it('retry after a failed posting succeeds once stock is available (no permanent duplicate block)', async () => {
    makeOrgMocks();
    setupBom();

    // First attempt: insufficient stock → rejected, no entry committed.
    balanceService.getAvailableStock.mockResolvedValue(0);
    await expect(service.create(entryDto(), COMPANY)).rejects.toThrow('Raw material stock is insufficient');
    expect(entryRepo.save).not.toHaveBeenCalled();

    // Second attempt: stock available → succeeds.
    balanceService.getAvailableStock.mockResolvedValue(100000);
    const saved = await service.create(entryDto(), COMPANY);
    expect(saved.id).toBe('entry-1');
    const receipt = stockLedgerService.create.mock.calls.find((c: any) => c[0].transactionType === 'PRODUCTION_RECEIPT');
    expect(receipt[0]).toMatchObject({ itemId: 'item-1', direction: 'IN', quantity: 7200 });
  });

  it('successful posting commits the entry once and sets inventory_reference_id', async () => {
    makeOrgMocks();
    setupBom();
    balanceService.getAvailableStock.mockResolvedValue(100000);
    entryRepo.save.mockClear();

    const saved = await service.create(entryDto(), COMPANY);
    // Atomic path: entry persisted through the transactional manager.
    expect(entryRepo.save).not.toHaveBeenCalled();
    expect(saved.inventoryReferenceId).toBeDefined();
  });

  it('TASK35-A: posting is idempotent — an entry with inventoryReferenceId does NOT create new stock movements', async () => {
    makeOrgMocks();
    setupBom();
    balanceService.getAvailableStock.mockResolvedValue(100000);
    stockLedgerService.create.mockClear();

    // The in-transaction save already returns a persisted entry with a ledger
    // reference (simulating a prior post/crash-retry). The idempotency guard in
    // postInventoryAndConsume must short-circuit BEFORE any ledger write.
    const originalTransaction = entryRepo.manager.transaction;
    entryRepo.manager.transaction = jest.fn(async (cb: (m: any) => Promise<any>) =>
      cb({
        getRepository: jest.fn(() => ({
          save: jest.fn((x: any) => ({ ...x, id: x.id ?? 'entry-1', inventoryReferenceId: 'ledger-already-posted' })),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
          findOne: jest.fn().mockResolvedValue(null),
        })),
      }),
    );

    const saved = await service.create(entryDto(), COMPANY);
    expect(saved.inventoryReferenceId).toBe('ledger-already-posted');
    // No PRODUCTION_RECEIPT, no PRODUCTION_CONSUMPTION, no PRODUCTION_SCRAP created.
    expect(stockLedgerService.create).not.toHaveBeenCalled();
    expect(balanceService.updateBalance).not.toHaveBeenCalled();

    entryRepo.manager.transaction = originalTransaction;
  });

  it('TASK35-B: movement references the entry and the input is the exact Item Master IN Item', async () => {
    makeOrgMocks();
    bomRepo.find.mockResolvedValue([]);
    itemRepo.findOne.mockImplementation(({ where }: any) => {
      if (where.id === 'item-1') return Promise.resolve({ id: 'item-1', companyId: COMPANY, itemCode: 'FG-SPIRAL', baseUomId: 'uom-m', status: 'ACTIVE', productionInItemId: 'raw-source' });
      if (where.id === 'raw-source') return Promise.resolve({ id: 'raw-source', companyId: COMPANY, itemCode: '1.20mm-B4', baseUomId: 'uom-m', status: 'ACTIVE' });
      return Promise.resolve({ id: where.id, companyId: COMPANY, baseUomId: 'uom-m', status: 'ACTIVE' });
    });
    uomRepo.findOne.mockResolvedValue({ id: 'uom-m', code: 'M' });
    balanceService.getAvailableStock.mockResolvedValue(100000);
    stockLedgerService.create.mockClear();
    warehouseRepo.findOne.mockResolvedValue({ id: 'rw-wh-1', status: 'ACTIVE' });

    await service.create(entryDto(), COMPANY);

    const consume = stockLedgerService.create.mock.calls.find((c: any) => c[0].transactionType === 'PRODUCTION_CONSUMPTION');
    expect(consume[0]).toMatchObject({
      itemId: 'raw-source',          // exact IN from Item Master (no BOM)
      warehouseId: 'rw-wh-1',        // source/store warehouse, NOT the production warehouse
      direction: 'OUT', referenceType: 'PRODUCTION_ENTRY', referenceId: 'entry-1',
    });
    const receipt = stockLedgerService.create.mock.calls.find((c: any) => c[0].transactionType === 'PRODUCTION_RECEIPT');
    expect(receipt[0]).toMatchObject({
      itemId: 'item-1',             // output = the current production item
      direction: 'IN', warehouseId: 'wh-1', referenceId: 'entry-1',
    });
  });
});

describe('ProductionEntry entity — column mapping regression', () => {
  it('must NOT map raw_material_warehouse_id (column does not exist in live DB)', () => {
    const cols = getMetadataArgsStorage().columns.filter(
      (c) => c.target === ProductionEntry,
    );
    const mapped = cols.map((c) => c.propertyName);
    expect(mapped).not.toContain('rawMaterialWarehouseId');
    expect(mapped).toContain('inventoryReferenceId');
  });
});
