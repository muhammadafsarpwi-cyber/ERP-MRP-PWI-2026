import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProductionOrderService } from './production-order.service';
import { ProductionOrder, ProductionOrderOperation, ProductionOrderOperationLog, ProductionOrderStatus, ProductionOperationStatus } from '../entities';
import { ProductionRouting, RoutingOperation, RoutingStatus } from '../../production-routing/entities';
import { BillOfMaterials, BomLine, BomStatus } from '../../bom/entities';
import { Item, UomConversion } from '../../item/entities';
import { Division, Section, Department, DepartmentDivisionScope, Warehouse } from '../../organization/entities';
import { SalesOrderItem } from '../../sales/entities';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';

describe('ProductionOrderService', () => {
  let service: ProductionOrderService;

  let orderRepo: any;
  let operationRepo: any;
  let logRepo: any;
  let routingRepo: any;
  let routingOpRepo: any;
  let bomRepo: any;
  let bomLineRepo: any;
  let itemRepo: any;
  let uomConversionRepo: any;
  let divisionRepo: any;
  let sectionRepo: any;
  let departmentRepo: any;
  let scopeRepo: any;
  let warehouseRepo: any;
  let salesOrderItemRepo: any;
  let stockLedgerService: any;
  let balanceService: any;

  beforeEach(async () => {
    orderRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 'po-1' })),
      findOne: jest.fn(),
      find: jest.fn(),
      count: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(),
    };
    operationRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => ({ ...x, id: 'op-1' })), findOne: jest.fn(), find: jest.fn(), count: jest.fn() };
    logRepo = { create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
    routingRepo = { findOne: jest.fn() };
    routingOpRepo = { find: jest.fn() };
    bomRepo = { findOne: jest.fn() };
    bomLineRepo = { findOne: jest.fn(), find: jest.fn() };
    itemRepo = { findOne: jest.fn() };
    uomConversionRepo = { findOne: jest.fn() };
    divisionRepo = { findOne: jest.fn() };
    sectionRepo = { findOne: jest.fn() };
    departmentRepo = { findOne: jest.fn() };
    scopeRepo = { findOne: jest.fn() };
    warehouseRepo = { findOne: jest.fn() };
    salesOrderItemRepo = { findOne: jest.fn() };
    stockLedgerService = { create: jest.fn() };
    balanceService = { updateBalance: jest.fn(), getAvailableStock: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductionOrderService,
        { provide: getRepositoryToken(ProductionOrder), useValue: orderRepo },
        { provide: getRepositoryToken(ProductionOrderOperation), useValue: operationRepo },
        { provide: getRepositoryToken(ProductionOrderOperationLog), useValue: logRepo },
        { provide: getRepositoryToken(ProductionRouting), useValue: routingRepo },
        { provide: getRepositoryToken(RoutingOperation), useValue: routingOpRepo },
        { provide: getRepositoryToken(BillOfMaterials), useValue: bomRepo },
        { provide: getRepositoryToken(BomLine), useValue: bomLineRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(UomConversion), useValue: uomConversionRepo },
        { provide: getRepositoryToken(Division), useValue: divisionRepo },
        { provide: getRepositoryToken(Section), useValue: sectionRepo },
        { provide: getRepositoryToken(Department), useValue: departmentRepo },
        { provide: getRepositoryToken(DepartmentDivisionScope), useValue: scopeRepo },
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepo },
        { provide: getRepositoryToken(SalesOrderItem), useValue: salesOrderItemRepo },
        { provide: StockLedgerService, useValue: stockLedgerService },
        { provide: InventoryBalanceService, useValue: balanceService },
      ],
    }).compile();

    service = moduleRef.get(ProductionOrderService);
  });

  it('create rejects a non-manufacturable product', async () => {
    itemRepo.findOne.mockResolvedValueOnce({ id: 'p1', companyId: COMPANY, isManufacturable: false, itemCode: 'X' });
    await expect(
      service.create({ productId: 'p1', routingId: 'r1', plannedQuantity: 10, uomId: 'u1' } as any, COMPANY),
    ).rejects.toThrow(BadRequestException);
  });

  it('create rejects routing belonging to another product', async () => {
    itemRepo.findOne
      .mockResolvedValueOnce({ id: 'p1', companyId: COMPANY, isManufacturable: true, itemCode: 'FIN' })
      .mockResolvedValueOnce({ id: 'u1' });
    routingRepo.findOne.mockResolvedValueOnce({ id: 'r1', companyId: COMPANY, productId: 'OTHER', routingCode: 'RTG-1' });
    await expect(
      service.create({ productId: 'p1', routingId: 'r1', plannedQuantity: 10, uomId: 'u1' } as any, COMPANY),
    ).rejects.toThrow(BadRequestException);
  });

  it('create generates sequential order number and saves DRAFT order', async () => {
    itemRepo.findOne.mockResolvedValue({ id: 'p1', companyId: COMPANY, isManufacturable: true });
    routingRepo.findOne.mockResolvedValue({ id: 'r1', companyId: COMPANY, productId: 'p1', routingCode: 'RTG-1' });
    orderRepo.query.mockResolvedValue([{ order_number: 'PO-000005' }, { order_number: 'PO-000003' }]);
    const result = await service.create({ productId: 'p1', routingId: 'r1', plannedQuantity: 10, uomId: 'u1' } as any, COMPANY);
    expect(result.orderNumber).toBe('PO-000006');
    expect(result.status).toBe(ProductionOrderStatus.DRAFT);
  });

  it('release rejects non-DRAFT orders', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.RELEASED });
    await expect(service.release('po-1', COMPANY)).rejects.toThrow(BadRequestException);
  });

  it('release snapshots ACTIVE routing operations and marks RELEASED', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.DRAFT, routingId: 'r1', productId: 'p1', plannedQuantity: 100, uomId: 'u1', bomId: null });
    routingRepo.findOne.mockResolvedValue({ id: 'r1', companyId: COMPANY, productId: 'p1', routingCode: 'RTG-001' });
    routingOpRepo.find.mockResolvedValue([
      { id: 'ro1', sequenceNo: 10, operationCode: 'OP-1', operationName: 'Straighten', divisionId: 'd1', status: 'ACTIVE', setupTimeMinutes: 10, runTimeMinutes: 5 },
      { id: 'ro2', sequenceNo: 20, operationCode: 'OP-2', operationName: 'Pack', divisionId: 'd1', status: 'ACTIVE', setupTimeMinutes: 0, runTimeMinutes: 2 },
    ]);
    divisionRepo.findOne.mockResolvedValue({ id: 'd1', divisionCode: 'SPD', status: 'ACTIVE' });
    operationRepo.count.mockResolvedValue(0);

    const result = await service.release('po-1', COMPANY);
    expect(operationRepo.save).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(ProductionOrderStatus.RELEASED);
  });

  it('startOperation enforces preceding operations completed', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.RELEASED });
    operationRepo.findOne.mockResolvedValue({ id: 'op2', sequenceNo: 20, operationName: 'Second', status: ProductionOperationStatus.PENDING });
    operationRepo.find.mockResolvedValue([{ sequenceNo: 10, status: ProductionOperationStatus.PENDING }]);
    await expect(service.startOperation('po-1', 'op2', COMPANY)).rejects.toThrow(/preceding/);
  });

  it('completeOperation rejects output+scrap exceeding input', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.IN_PROGRESS });
    operationRepo.findOne.mockResolvedValue({ id: 'op1', sequenceNo: 10, operationName: 'First', status: ProductionOperationStatus.IN_PROGRESS });
    await expect(
      service.completeOperation('po-1', 'op1', { inputQuantity: 100, outputQuantity: 90, scrappedQuantity: 20 } as any, COMPANY),
    ).rejects.toThrow(/exceeds input/);
  });

  it('completeOperation accepts valid quantities and writes COMPLETED log', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.IN_PROGRESS });
    operationRepo.findOne.mockResolvedValue({ id: 'op1', sequenceNo: 10, operationName: 'First', status: ProductionOperationStatus.IN_PROGRESS });
    const op = await service.completeOperation('po-1', 'op1', { inputQuantity: 100, outputQuantity: 90, scrappedQuantity: 10 } as any, COMPANY);
    expect(op.status).toBe(ProductionOperationStatus.COMPLETED);
    expect(op.outputQuantity).toBe(90);
    expect(logRepo.save).toHaveBeenCalled();
  });

  it('completeProductionOrder rejects duplicate completion', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.COMPLETED, orderNumber: 'PO-000001' });
    await expect(
      service.completeProductionOrder('po-1', { completedQuantity: 90 } as any, COMPANY),
    ).rejects.toThrow(ConflictException);
  });

  it('completeProductionOrder rejects when operations incomplete', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.IN_PROGRESS });
    operationRepo.find.mockResolvedValue([
      { sequenceNo: 10, status: ProductionOperationStatus.COMPLETED, scrappedQuantity: 0 },
      { sequenceNo: 20, status: ProductionOperationStatus.IN_PROGRESS, scrappedQuantity: 0 },
    ]);
    await expect(
      service.completeProductionOrder('po-1', { completedQuantity: 90 } as any, COMPANY),
    ).rejects.toThrow(/Pending: 20/);
  });

  it('completeProductionOrder posts FG receipt IN and marks COMPLETED', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.IN_PROGRESS, orderNumber: 'PO-000001', productId: 'p1', uomId: 'u1', finishedGoodsWarehouseId: 'fgw', rawMaterialWarehouseId: null });
    operationRepo.find.mockResolvedValue([
      { sequenceNo: 10, status: ProductionOperationStatus.COMPLETED, outputQuantity: 95, scrappedQuantity: 5 },
      { sequenceNo: 20, status: ProductionOperationStatus.COMPLETED, outputQuantity: 90, scrappedQuantity: 5 },
    ]);
    warehouseRepo.findOne.mockResolvedValue({ id: 'fgw', warehouseCode: 'FG-WH', companyId: COMPANY, status: 'ACTIVE' });

    const result = await service.completeProductionOrder('po-1', { completedQuantity: 90 } as any, COMPANY);
    expect(stockLedgerService.create).toHaveBeenCalledWith(expect.objectContaining({ transactionType: 'PRODUCTION_RECEIPT', direction: 'IN', quantity: 90 }));
    expect(balanceService.updateBalance).toHaveBeenCalledWith(COMPANY, 'p1', 'fgw', null, null, 'u1', 90, 'IN');
    expect(stockLedgerService.create).toHaveBeenCalledWith(expect.objectContaining({ transactionType: 'PRODUCTION_SCRAP', quantity: 10 }));
    expect(result.status).toBe(ProductionOrderStatus.COMPLETED);
  });

  it('completeProductionOrder requires completedQuantity to match final op output', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.IN_PROGRESS });
    operationRepo.find.mockResolvedValue([
      { sequenceNo: 10, status: ProductionOperationStatus.COMPLETED, outputQuantity: 50, scrappedQuantity: 0 },
      { sequenceNo: 20, status: ProductionOperationStatus.COMPLETED, outputQuantity: 45, scrappedQuantity: 0 },
    ]);
    await expect(
      service.completeProductionOrder('po-1', { completedQuantity: 44 } as any, COMPANY),
    ).rejects.toThrow(/must equal final operation output/);
  });

  it('cancel allows only DRAFT/RELEASED without started operations', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.IN_PROGRESS });
    await expect(service.cancel('po-1', COMPANY)).rejects.toThrow(BadRequestException);

    orderRepo.findOne.mockResolvedValue({ id: 'po-2', companyId: COMPANY, status: ProductionOrderStatus.RELEASED });
    operationRepo.count.mockResolvedValue(1);
    await expect(service.cancel('po-2', COMPANY)).rejects.toThrow(/started or completed/);

    orderRepo.findOne.mockResolvedValue({ id: 'po-3', companyId: COMPANY, status: ProductionOrderStatus.RELEASED });
    operationRepo.count.mockResolvedValue(0);
    const cancelled = await service.cancel('po-3', COMPANY);
    expect(cancelled.status).toBe(ProductionOrderStatus.CANCELLED);
  });

  it('issueMaterials rejects over-issue beyond BOM requirement', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.RELEASED, bomId: 'bom1', orderNumber: 'PO-000001', plannedQuantity: 10, rawMaterialWarehouseId: 'rmw' });
    bomLineRepo.findOne.mockResolvedValue({ id: 'bl1', itemId: 'i1', quantity: 1, scrapFactor: 0, yieldPercentage: 100, uomId: 'u1', item: { id: 'i1', itemCode: 'RM1' }, uom: { id: 'u1' } });
    itemRepo.findOne.mockResolvedValue({ id: 'i1', baseUomId: 'u1' });
    orderRepo.query.mockImplementation((_q: string, params: any[]) => {
      if (params.includes('PRODUCTION_ORDER') && params[3] === 'i1') return Promise.resolve([{ total: 12 }]);
      return Promise.resolve([]);
    });

    await expect(
      service.issueMaterials('po-1', { lines: [{ bomLineId: 'bl1', quantity: 5 }] } as any, COMPANY),
    ).rejects.toThrow(/Over-issue rejected/);
  });

  it('issueMaterials blocks insufficient stock before ledger write', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.RELEASED, bomId: 'bom1', orderNumber: 'PO-000001', plannedQuantity: 10, rawMaterialWarehouseId: 'rmw' });
    bomLineRepo.findOne.mockResolvedValue({ id: 'bl1', itemId: 'i1', quantity: 1, scrapFactor: 0, yieldPercentage: 100, uomId: 'u1', item: { id: 'i1', itemCode: 'RM1' }, uom: { id: 'u1' } });
    itemRepo.findOne.mockResolvedValue({ id: 'i1', baseUomId: 'u1' });
    orderRepo.query.mockResolvedValue([]);
    warehouseRepo.findOne.mockResolvedValue({ id: 'rmw', warehouseCode: 'RM-WH', companyId: COMPANY, status: 'ACTIVE' });
    balanceService.getAvailableStock.mockResolvedValue(4);

    await expect(
      service.issueMaterials('po-1', { lines: [{ bomLineId: 'bl1', quantity: 5 }] } as any, COMPANY),
    ).rejects.toThrow(/Insufficient stock/);
    expect(stockLedgerService.create).not.toHaveBeenCalled();
  });

  it('issueMaterials happy path writes PRODUCTION_ISSUE OUT ledger + balance', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.RELEASED, bomId: 'bom1', orderNumber: 'PO-000001', plannedQuantity: 10, rawMaterialWarehouseId: 'rmw' });
    bomLineRepo.findOne.mockResolvedValue({ id: 'bl1', itemId: 'i1', quantity: 1, scrapFactor: 0.05, yieldPercentage: 98, uomId: 'u1', item: { id: 'i1', itemCode: 'RM1' }, uom: { id: 'u1' } });
    itemRepo.findOne.mockResolvedValue({ id: 'i1', baseUomId: 'u1' });
    orderRepo.query.mockResolvedValue([]);
    warehouseRepo.findOne.mockResolvedValue({ id: 'rmw', warehouseCode: 'RM-WH', companyId: COMPANY, status: 'ACTIVE' });
    balanceService.getAvailableStock.mockResolvedValue(100);
    stockLedgerService.create.mockResolvedValue({ id: 'led-1' });

    const result = await service.issueMaterials('po-1', { lines: [{ bomLineId: 'bl1', quantity: 8 }] } as any, COMPANY);
    expect(stockLedgerService.create).toHaveBeenCalledWith(expect.objectContaining({ transactionType: 'PRODUCTION_ISSUE', direction: 'OUT', quantity: 8 }));
    expect(balanceService.updateBalance).toHaveBeenCalledWith(COMPANY, 'i1', 'rmw', null, null, 'u1', 8, 'OUT');
    expect(result.issues[0].requiredTotal).toBeCloseTo(10 * 1 * 1.05 / 0.98, 2);
  });

  it('update rejects non-DRAFT orders', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.COMPLETED });
    await expect(service.update('po-1', {} as any, COMPANY)).rejects.toThrow(/Only DRAFT/);
  });

  it('remove soft-deletes only DRAFT orders', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'po-1', companyId: COMPANY, status: ProductionOrderStatus.RELEASED });
    await expect(service.remove('po-1', COMPANY)).rejects.toThrow(/Only DRAFT/);
  });

  it('findOne throws 404 for other-company orders (tenant isolation)', async () => {
    orderRepo.findOne.mockResolvedValue(null);
    await expect(service.findOne('po-1', 'other-company')).rejects.toThrow(NotFoundException);
  });
});
