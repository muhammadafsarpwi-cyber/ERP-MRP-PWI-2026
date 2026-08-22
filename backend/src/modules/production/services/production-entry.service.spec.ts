import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProductionEntryService } from './production-entry.service';
import { ProductionEntry, Machine, Shift, DowntimeReason, ProductionOrder, ProductionOrderOperation } from '../entities';
import { Item, UomConversion } from '../../item/entities';
import { Division, Section, Department } from '../../organization/entities';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';

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
let stockLedgerService: any;
let balanceService: any;

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
  stockLedgerService = { create: jest.fn().mockResolvedValue({ id: 'ledger-ref-1' }) };
  balanceService = { updateBalance: jest.fn(), getAvailableStock: jest.fn() };

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
      { provide: StockLedgerService, useValue: stockLedgerService },
      { provide: InventoryBalanceService, useValue: balanceService },
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
    expect(balanceService.updateBalance).toHaveBeenCalledWith(COMPANY, 'item-1', 'wh-1', null, null, 'uom-m', 7200, 'IN');
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
