import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { Item, ItemStatus, ItemType } from '../../item/entities';
import { ProductionRouting, RoutingOperation, RoutingStatus } from '../../production-routing/entities';
import { ProductionEntry } from '../../production/entities/production-entry.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Shift } from '../../production/entities/shift.entity';
import { MachineTarget } from '../../machine-target/entities/machine-target.entity';
import { StockLedger } from '../../inventory/entities/stock-ledger.entity';
import { InventoryBalance } from '../../inventory/entities/inventory-balance.entity';
import { PurchaseOrder } from '../../procurement/entities/purchase-order.entity';
import { PurchaseOrderLine } from '../../procurement/entities/purchase-order-line.entity';
import { SalesOrder } from '../../sales/entities/sales-order.entity';
import { ActivityLog } from '../../audit/entities/activity-log.entity';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { BomLine } from '../../bom/entities/bom-line.entity';
import { ItemBarcode } from '../../item/entities/item-barcode.entity';
import { UomConversion } from '../../item/entities/uom-conversion.entity';

describe('DashboardService - getItemRoute (TASK #45)', () => {
  let service: DashboardService;
  let itemRepo: any;
  let routingRepo: any;

  const mockItemRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockRoutingRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(Item), useValue: mockItemRepo },
        { provide: getRepositoryToken(ProductionRouting), useValue: mockRoutingRepo },
        { provide: getRepositoryToken(ProductionEntry), useValue: {} },
        { provide: getRepositoryToken(Machine), useValue: {} },
        { provide: getRepositoryToken(Shift), useValue: {} },
        { provide: getRepositoryToken(MachineTarget), useValue: {} },
        { provide: getRepositoryToken(StockLedger), useValue: {} },
        { provide: getRepositoryToken(InventoryBalance), useValue: {} },
        { provide: getRepositoryToken(PurchaseOrder), useValue: {} },
        { provide: getRepositoryToken(PurchaseOrderLine), useValue: {} },
        { provide: getRepositoryToken(SalesOrder), useValue: {} },
        { provide: getRepositoryToken(ActivityLog), useValue: {} },
        { provide: getRepositoryToken(Department), useValue: {} },
        { provide: getRepositoryToken(Division), useValue: {} },
        { provide: getRepositoryToken(Section), useValue: {} },
        { provide: getRepositoryToken(Warehouse), useValue: {} },
        { provide: getRepositoryToken(BomLine), useValue: {} },
        { provide: getRepositoryToken(RoutingOperation), useValue: {} },
        { provide: getRepositoryToken(ItemBarcode), useValue: {} },
        { provide: getRepositoryToken(UomConversion), useValue: {} },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    itemRepo = module.get(getRepositoryToken(Item));
    routingRepo = module.get(getRepositoryToken(ProductionRouting));
  });

  const setupRoutingQb = (routing: any = null) => {
    const qb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(routing),
    };
    routingRepo.createQueryBuilder.mockReturnValue(qb);
    return qb;
  };

  it('TASK45-1: returns Raw Material status for raw material items with no upstream route', async () => {
    const rmItem = {
      id: 'rm-001',
      itemCode: 'RM-WIRE-001',
      name: '1.20 mm-B4 Wire',
      itemType: ItemType.RAW_MATERIAL,
      isManufacturable: false,
      productionInItemId: null,
      department: { name: 'CCD Stores' },
      baseUom: { code: 'KG' },
      wireSizeMm: 1.2,
    };
    itemRepo.findOne.mockResolvedValueOnce(rmItem);
    setupRoutingQb(null);

    const result = await service.getItemRoute('company-1', 'rm-001');

    expect(result.productionFlow?.isRawMaterial).toBe(true);
    expect(result.productionFlow?.hasConfiguredRoute).toBe(false);
    expect(result.productionFlow?.statusMessage).toBe('Raw Material / No upstream production route');
    expect(result.productionFlow?.inputItem).toBeNull();
    expect(result.productionFlow?.outputItem.itemCode).toBe('RM-WIRE-001');
  });

  it('TASK45-2: resolves Flattening stage: exact raw material input + Flattening operation + current output', async () => {
    const rmItem = {
      id: 'rm-001',
      itemCode: 'RM-WIRE-001',
      name: '1.20 mm-B4 Wire',
      itemType: ItemType.RAW_MATERIAL,
      isManufacturable: false,
      productionInItemId: null,
      department: { name: 'CCD Stores' },
      baseUom: { code: 'KG' },
      wireSizeMm: 1.2,
    };

    const flatItem = {
      id: 'flat-001',
      itemCode: 'FLAT-WIRE-001',
      name: 'Flat Wire T 0.40 × W 2.60 mm',
      itemType: ItemType.WORK_IN_PROGRESS,
      isManufacturable: true,
      departmentId: 'dept-flat',
      department: { name: 'Flattening', departmentCode: 'CCD-DEPT001' },
      baseUom: { code: 'KG' },
      productionInItemId: 'rm-001',
      productionInItem: rmItem,
      productionOutItemId: 'flat-001',
    };

    itemRepo.findOne
      .mockResolvedValueOnce(flatItem) // target item
      .mockResolvedValueOnce(rmItem)   // upstream chain walk
      .mockResolvedValueOnce(null);    // downstream chain walk (no child)

    setupRoutingQb(null);

    const result = await service.getItemRoute('company-1', 'flat-001');

    expect(result.productionFlow?.isRawMaterial).toBe(false);
    expect(result.productionFlow?.hasConfiguredRoute).toBe(true);
    expect(result.productionFlow?.statusMessage).toBe('Configured');
    expect(result.productionFlow?.operationName).toBe('Flattening');
    expect(result.productionFlow?.departmentName).toBe('Flattening');

    // Exact input material
    expect(result.productionFlow?.inputItem?.id).toBe('rm-001');
    expect(result.productionFlow?.inputItem?.itemCode).toBe('RM-WIRE-001');

    // Current output
    expect(result.productionFlow?.outputItem?.id).toBe('flat-001');
    expect(result.productionFlow?.outputItem?.itemCode).toBe('FLAT-WIRE-001');

    // Synthesized legacy operations for backward compatibility
    expect(result.operations.length).toBe(1);
    expect(result.operations[0].operationName).toBe('Flattening');
    expect(result.routing?.name).toContain('Flattening');

    // Chain: RM -> Flattening
    expect(result.productionFlow?.chain.length).toBe(2);
    expect(result.productionFlow?.chain[0].stageName).toBe('RAW MATERIAL / STORE');
    expect(result.productionFlow?.chain[0].itemCode).toBe('RM-WIRE-001');
    expect(result.productionFlow?.chain[1].stageName).toBe('FLATTENING');
    expect(result.productionFlow?.chain[1].itemCode).toBe('FLAT-WIRE-001');
    expect(result.productionFlow?.chain[1].isCurrent).toBe(true);
  });

  it('TASK45-3: resolves Spiral stage with previous-stage Flattening output used as exact input', async () => {
    const rmItem = {
      id: 'rm-001',
      itemCode: 'RM-WIRE-001',
      name: '1.20 mm-B4 Wire',
      itemType: ItemType.RAW_MATERIAL,
      isManufacturable: false,
      productionInItemId: null,
      department: { name: 'CCD Stores' },
      baseUom: { code: 'KG' },
    };

    const flatItem = {
      id: 'flat-001',
      itemCode: 'FLAT-WIRE-001',
      name: 'Flat Wire T 0.40 × W 2.60 mm',
      itemType: ItemType.WORK_IN_PROGRESS,
      isManufacturable: true,
      department: { name: 'Flattening' },
      baseUom: { code: 'KG' },
      productionInItemId: 'rm-001',
    };

    const spiralItem = {
      id: 'spiral-001',
      itemCode: 'WIP-CS-001',
      name: 'Spiral Core 3.75 mm 2P',
      itemType: ItemType.SEMI_FINISHED,
      isManufacturable: true,
      departmentId: 'dept-spiral',
      department: { name: 'Spiral', departmentCode: 'CCD-DEPT002' },
      baseUom: { code: 'METER' },
      productionInItemId: 'flat-001',
      productionInItem: flatItem,
      productionOutItemId: 'spiral-001',
      wireSizeMm: 3.75,
    };

    itemRepo.findOne
      .mockResolvedValueOnce(spiralItem) // target item
      .mockResolvedValueOnce(flatItem)   // upstream hop 1: flat
      .mockResolvedValueOnce(rmItem)     // upstream hop 2: rm
      .mockResolvedValueOnce(null);      // downstream: none

    setupRoutingQb(null);

    const result = await service.getItemRoute('company-1', 'spiral-001');

    expect(result.productionFlow?.operationName).toBe('Spiral');
    expect(result.productionFlow?.inputItem?.id).toBe('flat-001');
    expect(result.productionFlow?.inputItem?.itemCode).toBe('FLAT-WIRE-001');
    expect(result.productionFlow?.outputItem?.id).toBe('spiral-001');

    // Multi-stage chain: RM -> Flattening -> Spiral
    expect(result.productionFlow?.chain.length).toBe(3);
    expect(result.productionFlow?.chain[0].stageName).toBe('RAW MATERIAL / STORE');
    expect(result.productionFlow?.chain[1].stageName).toBe('FLATTENING');
    expect(result.productionFlow?.chain[2].stageName).toBe('SPIRAL');
    expect(result.productionFlow?.chain[2].isCurrent).toBe(true);
  });

  it('TASK45-4: resolves PVC stage with Spiral output as exact input and full multi-stage chain', async () => {
    const rm = { id: 'rm-120', itemCode: 'RM-WIRE-120', name: 'RM 1.20', itemType: ItemType.RAW_MATERIAL, department: { name: 'CCD Stores' }, productionInItemId: null };
    const flat = { id: 'flat-009', itemCode: 'FLAT-WIRE-009', name: 'Flat 0.40', itemType: ItemType.SEMI_FINISHED, department: { name: 'Flattening' }, productionInItemId: 'rm-120' };
    const spiral = { id: 'wip-007', itemCode: 'WIP-CS-007', name: 'Spiral 3.75', itemType: ItemType.SEMI_FINISHED, department: { name: 'Spiral' }, productionInItemId: 'flat-009' };
    const pvc = {
      id: 'pvc-480',
      itemCode: 'PVC-480',
      name: '4.75 mm',
      itemType: ItemType.FINISHED_GOOD,
      departmentId: 'dept-pvc',
      department: { name: 'PVC', departmentCode: 'CCD-DEPT003' },
      productionInItemId: 'wip-007',
      productionInItem: spiral,
      productionOutItemId: 'pvc-480',
      wireSizeMm: 4.75,
      isManufacturable: true,
    };

    itemRepo.findOne
      .mockResolvedValueOnce(pvc)    // target
      .mockResolvedValueOnce(spiral) // upstream: spiral
      .mockResolvedValueOnce(flat)   // upstream: flat
      .mockResolvedValueOnce(rm)     // upstream: rm
      .mockResolvedValueOnce(null);  // downstream: none

    setupRoutingQb(null);

    const result = await service.getItemRoute('company-1', 'pvc-480');

    expect(result.productionFlow?.operationName).toBe('PVC');
    expect(result.productionFlow?.inputItem?.id).toBe('wip-007');
    expect(result.productionFlow?.inputItem?.itemCode).toBe('WIP-CS-007');
    expect(result.productionFlow?.outputItem?.id).toBe('pvc-480');

    // Full chain: RM -> FLATTENING -> SPIRAL -> PVC (dynamic department names,
    // no hard-coded operation labels)
    expect(result.productionFlow?.chain.length).toBe(4);
    expect(result.productionFlow?.chain[0].stageName).toBe('RAW MATERIAL / STORE');
    expect(result.productionFlow?.chain[1].stageName).toBe('FLATTENING');
    expect(result.productionFlow?.chain[2].stageName).toBe('SPIRAL');
    expect(result.productionFlow?.chain[3].stageName).toBe('PVC');
    expect(result.productionFlow?.chain[3].isCurrent).toBe(true);
  });

  it('TASK45-5: warns on manufactured item with missing route configuration', async () => {
    const unconfigured = {
      id: 'wip-unconf',
      itemCode: 'WIP-NEW',
      name: 'Unconfigured WIP',
      itemType: ItemType.SEMI_FINISHED,
      isManufacturable: true,
      productionInItemId: null,
      department: { name: 'Spiral' },
    };

    itemRepo.findOne.mockResolvedValueOnce(unconfigured);
    setupRoutingQb(null);

    const result = await service.getItemRoute('company-1', 'wip-unconf');

    expect(result.productionFlow?.isRawMaterial).toBe(false);
    expect(result.productionFlow?.hasConfiguredRoute).toBe(false);
    expect(result.productionFlow?.statusMessage).toBe('Manufacturing Item with missing route configuration');
    expect(result.operations.length).toBe(0);
  });
});
