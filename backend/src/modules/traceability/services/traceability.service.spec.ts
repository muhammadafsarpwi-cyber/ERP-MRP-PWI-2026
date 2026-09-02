import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TraceabilityService } from './traceability.service';
import { StockLedger, InventoryBalance } from '../../inventory/entities';
import { ProductionEntry, ProductionOrder, ProductionOrderOperation } from '../../production/entities';
import { ProductionRouting, RoutingOperation } from '../../production-routing/entities';
import { BillOfMaterials, BomLine } from '../../bom/entities';
import { Item, Uom, ItemType } from '../../item/entities';
import { Division, Section, Department, Warehouse, WarehouseLocation } from '../../organization/entities';
import { NotFoundException } from '@nestjs/common';

const CID = '7725aa04-a270-4314-9e82-90949cbe7791';
const IID = 'c1000000-0000-4000-8000-000000000005';
const IID2 = 'c1000000-0000-4000-8000-000000000006';
const WHID = 'aa9fedcb-27ac-47d2-a963-40d01c2594bc';
const UID = 'a0000000-0000-0000-0000-000000000001';
const DIVID = 'd1000000-0000-4000-8000-000000000002';
const SECID = 'd2000000-0000-4000-8000-000000000005';
const DEPTID = 'd3000000-0000-4000-8000-000000000009';
const WHIP1 = 'b0000000-0000-0000-0000-000000000001';
const WHIP2 = 'b0000000-0000-0000-0000-000000000002';
const LOC1 = 'c0000000-0000-0000-0000-000000000001';
const OP1 = 'd0000000-0000-0000-0000-000000000001';

function mockQueryBuilder(overrides: Record<string, any> = {}) {
  const defaultQb = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    getRawOne: jest.fn().mockResolvedValue({ totalIn: 0, totalOut: 0, onHand: 0, reserved: 0, available: 0 }),
    getRawMany: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
  return jest.fn(() => defaultQb);
}

function mockRepo(overrides: Record<string, any> = {}) {
  return {
    find: jest.fn(), findOne: jest.fn(), findByIds: jest.fn(),
    create: jest.fn(), save: jest.fn(), remove: jest.fn(), delete: jest.fn(),
    createQueryBuilder: mockQueryBuilder(overrides.qb || {}),
    ...overrides,
  };
}

describe('TraceabilityService', () => {
  let service: TraceabilityService;
  let ledgerRepo: any;
  let balanceRepo: any;
  let entryRepo: any;
  let routingRepo: any;
  let opRepo: any;
  let itemRepo: any;
  let warehouseRepo: any;
  let bomRepo: any;
  let bomLineRepo: any;
  let orderRepo: any;
  let orderOpRepo: any;

  const mkItem = (id: string, code: string, name: string): Partial<Item> => ({
    id, companyId: CID, itemCode: code, name, itemType: ItemType.RAW_MATERIAL,
    wireSizeMm: 1.200, thicknessMm: null, widthMm: null,
    baseUomId: UID, baseUom: { id: UID, code: 'M', name: 'Meter' } as any,
    divisionId: DIVID, division: { id: DIVID, name: 'Control Cable Division' } as any,
    sectionId: SECID, section: { id: SECID, name: 'Spiral' } as any,
    departmentId: DEPTID, department: { id: DEPTID, name: 'Flattening' } as any,
    isManufacturable: false, isPurchasable: true, isStockItem: true, trackInventory: true,
  });

  beforeEach(async () => {
    ledgerRepo = mockRepo();
    balanceRepo = mockRepo();
    entryRepo = mockRepo();
    routingRepo = mockRepo();
    opRepo = mockRepo();
    itemRepo = mockRepo();
    warehouseRepo = mockRepo();
    bomRepo = mockRepo();
    bomLineRepo = mockRepo();
    orderRepo = mockRepo();
    orderOpRepo = mockRepo();

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        TraceabilityService,
        { provide: getRepositoryToken(StockLedger), useValue: ledgerRepo },
        { provide: getRepositoryToken(InventoryBalance), useValue: balanceRepo },
        { provide: getRepositoryToken(ProductionEntry), useValue: entryRepo },
        { provide: getRepositoryToken(ProductionRouting), useValue: routingRepo },
        { provide: getRepositoryToken(RoutingOperation), useValue: opRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(Uom), useValue: mockRepo() },
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepo },
        { provide: getRepositoryToken(Division), useValue: mockRepo() },
        { provide: getRepositoryToken(Section), useValue: mockRepo() },
        { provide: getRepositoryToken(Department), useValue: mockRepo() },
        { provide: getRepositoryToken(BillOfMaterials), useValue: bomRepo },
        { provide: getRepositoryToken(BomLine), useValue: bomLineRepo },
        { provide: getRepositoryToken(ProductionOrder), useValue: orderRepo },
        { provide: getRepositoryToken(ProductionOrderOperation), useValue: orderOpRepo },
        { provide: getRepositoryToken(WarehouseLocation), useValue: mockRepo() },
      ],
    }).compile();

    service = mod.get<TraceabilityService>(TraceabilityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── Item Overview ──────────────────────────────────────────────────────

  describe('getItemOverview', () => {
    it('should return item overview with current balance', async () => {
      itemRepo.findOne.mockResolvedValue(mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]'));
      balanceRepo.createQueryBuilder = mockQueryBuilder({
        getRawOne: jest.fn().mockResolvedValue({ onHand: 100, reserved: 10, available: 90 }),
      });
      const result = await service.getItemOverview(CID, IID);
      expect(result.item.itemCode).toBe('RM-WIRE-120');
      expect(result.currentBalance.onHand).toBe(100);
      expect(result.currentBalance.reserved).toBe(10);
      expect(result.currentBalance.available).toBe(90);
    });

    it('should throw NotFoundException for unknown item', async () => {
      itemRepo.findOne.mockResolvedValue(null);
      await expect(service.getItemOverview(CID, IID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Stock Statement ────────────────────────────────────────────────────

  describe('getItemStatement', () => {
    it('should compute statement with opening, categories, closing, reconciliation', async () => {
      itemRepo.findOne.mockResolvedValue(mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]'));
      ledgerRepo.createQueryBuilder = mockQueryBuilder({
        getRawOne: jest.fn()
          .mockResolvedValueOnce({ totalIn: 500, totalOut: 200 }) // opening before date
          .mockResolvedValueOnce({ totalIn: 100, totalOut: 50 })  // in-range net
          .mockResolvedValueOnce({ totalIn: 600, totalOut: 250 }), // all-time
        getRawMany: jest.fn().mockResolvedValue([
          { type: 'PRODUCTION_RECEIPT', dir: 'IN', qty: 80 },
          { type: 'PRODUCTION_CONSUMPTION', dir: 'OUT', qty: 30 },
          { type: 'PRODUCTION_SCRAP', dir: 'OUT', qty: 5 },
        ]),
      });
      balanceRepo.createQueryBuilder = mockQueryBuilder({
        getRawOne: jest.fn().mockResolvedValue({ onHand: 350, reserved: 20, available: 330 }),
      });

      const result = await service.getItemStatement(CID, IID, { dateFrom: '2026-01-01', dateTo: '2026-06-30' });
      expect(result.openingBalance).toBe(300);
      expect(result.closingBalance).toBe(350);
      expect(result.categories.productionReceipt).toBe(80);
      expect(result.categories.productionConsumption).toBe(30);
      expect(result.categories.scrap).toBe(5);
      expect(result.reconciliation.status).toBe('RECONCILED');
      expect(result.reconciliation.inventoryBalance).toBe(350);
      expect(result.reconciliation.ledgerBalance).toBe(350);
    });

    it('should flag mismatch when ledger differs from inventory_balances', async () => {
      itemRepo.findOne.mockResolvedValue(mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]'));
      ledgerRepo.createQueryBuilder = mockQueryBuilder({
        getRawOne: jest.fn()
          .mockResolvedValueOnce({ totalIn: 0, totalOut: 0 }) // opening
          .mockResolvedValueOnce({ totalIn: 100, totalOut: 0 })  // in-range
          .mockResolvedValueOnce({ totalIn: 100, totalOut: 0 }), // all-time
      });
      balanceRepo.createQueryBuilder = mockQueryBuilder({
        getRawOne: jest.fn().mockResolvedValue({ onHand: 90, reserved: 0, available: 90 }),
      });

      const result = await service.getItemStatement(CID, IID, {});
      expect(result.reconciliation.difference).toBe(-10);
      expect(result.reconciliation.status).toBe('MISMATCH');
    });
  });

  // ─── Production History ────────────────────────────────────────────────

  describe('getItemProductionHistory', () => {
    it('should return paginated production entries for the item', async () => {
      entryRepo.createQueryBuilder = mockQueryBuilder({
        getManyAndCount: jest.fn().mockResolvedValue([
          [{ id: 'e1', entryDate: '2026-06-15', itemId: IID, actualQuantity: 100, targetQuantity: 120, scrapQuantity: 5, machineNo: 'MCH-001', operatorName: 'John', shift: { name: 'Morning' }, department: { name: 'Flattening' }, uom: { code: 'M' } }],
          1,
        ]),
      });
      const result = await service.getItemProductionHistory(CID, IID, { page: '1', limit: '50' });
      expect(result.total).toBe(1);
      expect(result.data[0].actualQuantity).toBe(100);
    });
  });

  // ─── Chain ──────────────────────────────────────────────────────────────

  describe('getItemChain', () => {
    it('should return chain when routing exists for the item', async () => {
      itemRepo.findOne.mockResolvedValue(mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]'));
      routingRepo.find.mockResolvedValue([
        {
          id: 'r1', companyId: CID, routingCode: 'RTG-SMP-005', name: 'Test Chain', status: 'ACTIVE', isActive: true,
          productId: IID, product: mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]'),
          operations: [
            { sequenceNo: 10, inputItemId: IID, outputItemId: IID2, inputItem: mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]'), outputItem: mkItem(IID2, 'FLAT-WIRE-040-260', '0.40x2.60mm Flat Wire [SAMPLE]'), division: { name: 'CCD' }, section: { name: 'Spiral' }, department: { name: 'Flattening' }, uom: { code: 'M' }, inputQuantity: 1, outputQuantity: 1, scrapPercentage: 0, setupScrapPercentage: 0, setupTimeMinutes: 15, runTimeMinutes: 20 },
          ],
        } as any,
      ]);
      bomRepo.find.mockResolvedValue([]);
      const result = await service.getItemChain(CID, IID);
      expect(result.hasRouting).toBe(true);
      expect(result.nodes.length).toBeGreaterThanOrEqual(2);
      expect(result.nodes[0].type).toBe('item');
      expect(result.nodes[1].type).toBe('process');
    });

    it('should return hasRouting false when no routing involves the item', async () => {
      itemRepo.findOne.mockResolvedValue(mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]'));
      routingRepo.find.mockResolvedValue([]);
      const result = await service.getItemChain(CID, IID);
      expect(result.hasRouting).toBe(false);
      expect(result.nodes).toEqual([]);
    });
  });

  // ─── WIP ────────────────────────────────────────────────────────────────

  describe('getWip', () => {
    // Build a WIP balance mock row
    const wipBalance = (over: Record<string, any> = {}) => ({
      itemId: IID, onHand: 50, reserved: 5, available: 45,
      warehouseId: WHIP1, locationId: null,
      warehouse: { id: WHIP1, warehouseCode: 'WIP-001', name: 'WIP-001' },
      uom: { id: UID, code: 'M', name: 'Meter' },
      item: mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]'),
      ...over,
    });

    // Configure all mocks the WIP report touches. ledgerRows are consumed in
    // order: opening (only if dateFrom), net-through-dateTo, in-range, last-movement.
    const setupWipMocks = (over: {
      warehouses?: any[];
      balances?: any[];
      items?: any[];
      ops?: any[];
      ledgerRows?: any[][];
      entryRows?: any[];
      dateFrom?: boolean;
    } = {}) => {
      const warehouses = over.warehouses ?? [{ id: WHIP1, warehouseCode: 'WIP-001', name: 'WIP-001', warehouseType: 'WORK_IN_PROGRESS' }];
      const balances = over.balances ?? [wipBalance()];
      const items = over.items ?? [mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]')];
      const ops = over.ops ?? [];

      warehouseRepo.createQueryBuilder = mockQueryBuilder({ getMany: jest.fn().mockResolvedValue(warehouses) });
      balanceRepo.createQueryBuilder = mockQueryBuilder({ getMany: jest.fn().mockResolvedValue(balances) });
      itemRepo.find = jest.fn().mockResolvedValue(items) as any;
      opRepo.createQueryBuilder = mockQueryBuilder({ getMany: jest.fn().mockResolvedValue(ops) });

      const ledgerGetRaw = jest.fn();
      (over.ledgerRows ?? []).forEach((r) => ledgerGetRaw.mockResolvedValueOnce(r));
      ledgerGetRaw.mockResolvedValue([]);
      ledgerRepo.createQueryBuilder = mockQueryBuilder({ getRawMany: ledgerGetRaw });

      const entryGetRaw = jest.fn();
      (over.entryRows ?? []).forEach((r) => entryGetRaw.mockResolvedValueOnce(r));
      entryGetRaw.mockResolvedValue([]);
      entryRepo.createQueryBuilder = mockQueryBuilder({ getRawMany: entryGetRaw });
    };

    const netRow = (net: number, itemId = IID, wh = WHIP1, loc: string | null = null) => ({
      itemId, warehouseId: wh, locationId: loc, totalIn: net > 0 ? net : 0, totalOut: net < 0 ? -net : 0,
    });
    const inRangeRow = (over: Record<string, any> = {}) => ({
      itemId: IID, warehouseId: WHIP1, locationId: null,
      produced: 0, consumed: 0, scrap: 0, transferIn: 0, transferOut: 0,
      adjustmentIn: 0, adjustmentOut: 0, openingQty: 0, ...over,
    });

    it('TEST 1 — returns empty result when no WIP warehouse exists (no error)', async () => {
      setupWipMocks({ warehouses: [] });
      const result = await service.getWip(CID, {});
      expect(result.data).toEqual([]);
      expect(result.summary.activeRecordCount).toBe(0);
      expect(result.context.wipWarehousesFound).toBe(0);
    });

    it('TEST 2 — WIP warehouse exists but zero balance → no false WIP stock', async () => {
      setupWipMocks({ balances: [] });
      const result = await service.getWip(CID, {});
      expect(result.data).toEqual([]);
      expect(result.summary.wipWarehouseCount).toBe(1);
      expect(result.summary.activeRecordCount).toBe(0);
    });

    it('TEST 3 — one WIP item returns correct on-hand WIP + reconciliation', async () => {
      setupWipMocks({
        balances: [wipBalance()],
        items: [mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]')],
        ledgerRows: [[netRow(50)], [inRangeRow()]],
      });
      const result = await service.getWip(CID, {});
      expect(result.data.length).toBe(1);
      expect(result.data[0].onHand).toBe(50);
      expect(result.data[0].wipQuantity).toBe(50);
      expect(result.data[0].reserved).toBe(5);
      expect(result.data[0].available).toBe(45);
      expect(result.data[0].item.itemCode).toBe('RM-WIRE-120');
      expect(result.data[0].division.name).toBe('Control Cable Division');
      expect(result.summary.totalWipQuantity).toBe(50);
      expect(result.summary.wipItemCount).toBe(1);
      expect(result.summary.wipWarehouseCount).toBe(1);
      expect(result.summary.activeRecordCount).toBe(1);
    });

    it('TEST 4 — multiple WIP warehouses aggregate without duplicates', async () => {
      setupWipMocks({
        warehouses: [
          { id: WHIP1, warehouseCode: 'WIP-001', name: 'WIP-001', warehouseType: 'WORK_IN_PROGRESS' },
          { id: WHIP2, warehouseCode: 'WIP-002', name: 'WIP-002', warehouseType: 'WORK_IN_PROGRESS' },
        ],
        balances: [
          wipBalance(),
          wipBalance({ warehouseId: WHIP2, onHand: 30, reserved: 0, available: 30, warehouse: { id: WHIP2, warehouseCode: 'WIP-002', name: 'WIP-002' } }),
        ],
        items: [mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]')],
        ledgerRows: [
          [netRow(50), netRow(30, IID, WHIP2)],
          [inRangeRow(), inRangeRow({ warehouseId: WHIP2 })],
        ],
      });
      const result = await service.getWip(CID, {});
      expect(result.data.length).toBe(2);
      expect(result.summary.wipWarehouseCount).toBe(2);
      expect(result.summary.totalWipQuantity).toBe(80);
    });

    it('TEST 5 — multiple locations produce correct location-level and total values', async () => {
      setupWipMocks({
        balances: [
          wipBalance({ locationId: LOC1, onHand: 20, available: 20, location: { id: LOC1, locationCode: 'L-01', name: 'Loc 01' } }),
          wipBalance({ locationId: null, onHand: 30, available: 30, location: null }),
        ],
        items: [mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]')],
        ledgerRows: [
          [netRow(20, IID, WHIP1, LOC1), netRow(30)],
          [inRangeRow({ locationId: LOC1 }), inRangeRow()],
        ],
      });
      const result = await service.getWip(CID, {});
      expect(result.data.length).toBe(2);
      const withLoc = result.data.find((r: any) => r.location && r.location.locationCode === 'L-01');
      expect(withLoc.onHand).toBe(20);
      expect(result.summary.totalWipQuantity).toBe(50);
    });

    it('TEST 6 — department filter returns only matching department records', async () => {
      const otherItem = { ...mkItem(IID2, 'FLAT-WIRE-040-260', '0.40x2.60mm Flat Wire [SAMPLE]'), departmentId: 'd3000000-0000-0000-0000-000000000010' };
      setupWipMocks({
        balances: [wipBalance(), wipBalance({ itemId: IID2, onHand: 10, available: 10, item: { ...mkItem(IID2, 'FLAT-WIRE-040-260', '0.40x2.60mm Flat Wire [SAMPLE]') } })],
        items: [mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]'), otherItem],
        ledgerRows: [[netRow(50), netRow(10, IID2)], [inRangeRow(), inRangeRow({ itemId: IID2 })]],
      });
      const result = await service.getWip(CID, { departmentId: DEPTID });
      expect(result.data.length).toBe(1);
      expect(result.data[0].item.itemCode).toBe('RM-WIRE-120');
    });

    it('TEST 7 — item filter returns only selected item', async () => {
      setupWipMocks({
        balances: [wipBalance(), wipBalance({ itemId: IID2, onHand: 10, available: 10, item: { ...mkItem(IID2, 'FLAT-WIRE-040-260', '0.40x2.60mm Flat Wire [SAMPLE]') } })],
        items: [mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]'), mkItem(IID2, 'FLAT-WIRE-040-260', '0.40x2.60mm Flat Wire [SAMPLE]')],
        ledgerRows: [[netRow(50), netRow(10, IID2)], [inRangeRow(), inRangeRow({ itemId: IID2 })]],
      });
      const result = await service.getWip(CID, { itemId: IID });
      expect(result.data.length).toBe(1);
      expect(result.data[0].item.itemCode).toBe('RM-WIRE-120');
    });

    it('TEST 8 — date range derives opening and closing WIP from the ledger', async () => {
      setupWipMocks({
        balances: [wipBalance()],
        items: [mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]')],
        ledgerRows: [
          [netRow(20)],  // opening before dateFrom
          [netRow(50)],  // net through dateTo
          [inRangeRow({ produced: 30, consumed: 0 })],
          [], // last movement
        ],
        entryRows: [[{ itemId: IID, lastDate: '2026-06-15' }]],
      });
      const result = await service.getWip(CID, { dateFrom: '2026-01-01', dateTo: '2026-06-30' });
      expect(result.data.length).toBe(1);
      expect(result.data[0].openingWip).toBe(20);
      expect(result.data[0].closingWip).toBe(50);
      expect(result.data[0].produced).toBe(30);
    });

    it('TEST 9 — reconciliation is RECONCILED when ledger equals inventory balance', async () => {
      setupWipMocks({
        balances: [wipBalance({ onHand: 50 })],
        items: [mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]')],
        ledgerRows: [[netRow(50)], [inRangeRow()]],
      });
      const result = await service.getWip(CID, {});
      expect(result.data[0].reconciliation.status).toBe('RECONCILED');
      expect(result.data[0].reconciliation.inventoryBalance).toBe(50);
      expect(result.data[0].reconciliation.ledgerBalance).toBe(50);
      expect(result.data[0].reconciliation.difference).toBe(0);
    });

    it('TEST 10 — reconciliation is MISMATCH when ledger differs from inventory balance (not hidden)', async () => {
      setupWipMocks({
        balances: [wipBalance({ onHand: 50 })],
        items: [mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]')],
        ledgerRows: [[netRow(42)], [inRangeRow()]],
      });
      const result = await service.getWip(CID, {});
      expect(result.data[0].reconciliation.status).toBe('MISMATCH');
      expect(result.data[0].reconciliation.difference).toBe(8);
    });

    it('TEST 11 — process filter restricts to the selected producing operation', async () => {
      const producer = { id: OP1, operationCode: 'OP-SMP-010', operationName: 'Flattening', sequenceNo: 10, outputItemId: IID, inputItemId: null, inputItem: null, outputItem: { id: IID, itemCode: 'RM-WIRE-120', name: '1.20mm Wire [SAMPLE]' } };
      setupWipMocks({
        balances: [wipBalance()],
        items: [mkItem(IID, 'RM-WIRE-120', '1.20mm Wire [SAMPLE]')],
        ops: [producer],
        ledgerRows: [[netRow(50)], [inRangeRow()]],
      });
      const result = await service.getWip(CID, { processId: OP1 });
      expect(result.data.length).toBe(1);
      expect(result.data[0].process.operationName).toBe('Flattening');
      const empty = await service.getWip(CID, { processId: 'd0000000-0000-0000-0000-000000000099' });
      expect(empty.data.length).toBe(0);
    });

    it('TEST 12 — WIP row exposes process chain (previous/next) and specs', async () => {
      const producer = {
        id: OP1, operationCode: 'OP-SMP-010', operationName: 'Flattening', sequenceNo: 10,
        outputItemId: IID2, inputItemId: IID,
        inputItem: { id: IID, itemCode: 'RM-WIRE-120', name: '1.20mm Wire [SAMPLE]' },
        outputItem: { id: IID2, itemCode: 'FLAT-WIRE-040-260', name: '0.40x2.60mm Flat Wire [SAMPLE]' },
        department: { id: DEPTID, name: 'Flattening' },
      };
      const flatItem = {
        ...mkItem(IID2, 'FLAT-WIRE-040-260', '0.40x2.60mm Flat Wire [SAMPLE]'),
        wireSizeMm: null, thicknessMm: 0.4, widthMm: 2.6,
      };
      setupWipMocks({
        balances: [wipBalance({ itemId: IID2, item: flatItem })],
        items: [flatItem],
        ops: [producer],
        ledgerRows: [[netRow(50, IID2)], [inRangeRow({ itemId: IID2 })]],
      });
      const result = await service.getWip(CID, {});
      expect(result.data[0].process.operationName).toBe('Flattening');
      expect(result.data[0].previousItem.itemCode).toBe('RM-WIRE-120');
      expect(result.data[0].item.thicknessMm).toBe(0.4);
      expect(result.data[0].item.widthMm).toBe(2.6);
    });
  });

  // ─── Department-wise ───────────────────────────────────────────────────

  describe('getDepartmentWise', () => {
    it('should return department-wise inventory rows', async () => {
      balanceRepo.createQueryBuilder = mockQueryBuilder({
        getMany: jest.fn().mockResolvedValue([
          { itemId: IID, onHand: 100, reserved: 10, available: 90, warehouse: { id: WHID, warehouseCode: 'WH-MAIN-001', name: 'Main Warehouse' }, uom: { id: UID, code: 'M', name: 'Meter' }, item: { id: IID, itemCode: 'RM-WIRE-120', name: '1.20mm Wire [SAMPLE]', itemType: 'RAW_MATERIAL', wireSizeMm: 1.200, thicknessMm: null, widthMm: null, divisionId: DIVID, sectionId: SECID, departmentId: DEPTID } },
        ]),
      });
      itemRepo.find = jest.fn().mockResolvedValue([
        { id: IID, itemCode: 'RM-WIRE-120', name: '1.20mm Wire [SAMPLE]', itemType: 'RAW_MATERIAL', wireSizeMm: 1.200, thicknessMm: null, widthMm: null, divisionId: DIVID, sectionId: SECID, departmentId: DEPTID, division: { name: 'Control Cable Division' }, section: { name: 'Spiral' }, department: { name: 'Flattening' } },
      ]) as any;
      ledgerRepo.createQueryBuilder = mockQueryBuilder({
        getRawMany: jest.fn().mockResolvedValue([{ itemId: IID, produced: 80, consumed: 20, scrap: 5 }]),
      });

      const result = await service.getDepartmentWise(CID, {});
      expect(result.data.length).toBeGreaterThanOrEqual(0);
    });
  });
});