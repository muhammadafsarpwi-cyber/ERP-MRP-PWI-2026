import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OpeningStockService } from './opening-stock.service';

describe('OpeningStockService — bulk posting, safe reversal & restore', () => {
  const COMPANY = 'company-1';
  const WH = 'wh-1';
  const ITEM_1 = 'item-1';
  const ITEM_2 = 'item-2';
  const UOM_KG = 'uom-kg';
  const USER_ID = 'user-admin-1';

  let mockManager: any;
  let dataSource: any;
  let ledgerService: any;
  let balanceService: any;
  let batchService: any;
  let service: OpeningStockService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockManager = {
      query: jest.fn(),
    };
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn(async (cb: (m: any) => Promise<any>) => cb(mockManager)),
    };
    ledgerService = {
      create: jest.fn().mockImplementation(async (payload: any) => ({
        id: `ledger-${payload.itemId}-${payload.direction}`,
        ...payload,
      })),
    };
    balanceService = {
      updateBalance: jest.fn().mockResolvedValue({}),
      updateWeightedAverageCost: jest.fn().mockResolvedValue({ unitCost: 100, averageCost: 100 }),
    };
    batchService = {
      create: jest.fn().mockResolvedValue({ id: 'batch-created-1' }),
    };
    service = new OpeningStockService(dataSource, ledgerService, balanceService, batchService);
  });

  it('postOpeningStock: posts bulk batch atomically inside a transaction with batch metadata and weighted avg cost', async () => {
    mockManager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM erp_users')) return [{ id: USER_ID }];
      if (sql.includes('FROM warehouses')) return [{ id: WH, name: 'Main Warehouse', division_id: 'div-ccd' }];
      if (sql.includes('FROM opening_stock_batches')) return [];
      if (sql.includes('FROM inventory_balances')) return [{ item_id: ITEM_1, prev_qty: '10' }];
      return [];
    });

    const result = await service.postOpeningStock(
      {
        companyId: COMPANY,
        warehouseId: WH,
        referenceNumber: 'OPN-20261127-101',
        source: 'IMPORT',
        lines: [
          { itemId: ITEM_1, uomId: UOM_KG, quantity: 50, unitCost: 200, notes: 'Wire lot' },
          { itemId: ITEM_2, uomId: UOM_KG, quantity: 25, unitCost: 400 },
        ],
      },
      USER_ID,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      referenceNumber: 'OPN-20261127-101',
      warehouseId: WH,
      status: 'POSTED',
      posted: 2,
      totalQuantity: 75,
      totalValue: 20000,
    });
    expect(ledgerService.create).toHaveBeenCalledTimes(2);
    expect(ledgerService.create.mock.calls[0][0]).toMatchObject({
      transactionType: 'OPENING',
      direction: 'IN',
      referenceType: 'OPENING_STOCK',
      referenceNumber: 'OPN-20261127-101',
      divisionId: 'div-ccd',
      quantity: 50,
    });
    expect(balanceService.updateBalance).toHaveBeenCalledWith(
      COMPANY,
      ITEM_1,
      WH,
      null,
      null,
      UOM_KG,
      50,
      'IN',
      mockManager,
    );
    expect(balanceService.updateWeightedAverageCost).toHaveBeenCalledWith(
      COMPANY,
      ITEM_1,
      WH,
      50,
      200,
      10,
      mockManager,
    );
  });

  it('reverseBatch: prevents negative stock and rolls back if any item balance is already consumed', async () => {
    const batchRow = {
      id: 'batch-row-1',
      company_id: COMPANY,
      reference_number: 'OPN-20261127-200',
      warehouse_id: WH,
      division_id: 'div-ccd',
      status: 'POSTED',
      total_quantity: 100,
      total_value: 15000,
    };

    mockManager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM erp_users')) return [{ id: USER_ID }];
      if (sql.includes('FROM opening_stock_batches')) return [batchRow];
      if (sql.includes('FROM opening_stock_batch_lines')) {
        return [
          {
            id: 'bl-1',
            item_id: ITEM_1,
            uom_id: UOM_KG,
            quantity: '100',
            unit_cost: '150',
            total_cost: '15000',
            batch_id: null,
            item_code: 'RM-WIRE-001',
            item_name: 'Copper Wire',
          },
        ];
      }
      if (sql.includes('FROM warehouses')) return [{ name: 'Main Warehouse' }];
      if (sql.includes('FROM inventory_policies')) return [];
      if (sql.includes('FROM inventory_balances')) return [{ on_hand: '40' }];
      return [];
    });

    await expect(
      service.reverseBatch(COMPANY, 'OPN-20261127-200', WH, USER_ID),
    ).rejects.toThrow(BadRequestException);

    expect(balanceService.updateBalance).not.toHaveBeenCalled();
    expect(ledgerService.create).not.toHaveBeenCalled();
  });

  it('reverseBatch: posts exact reversing OUT ledger rows, deducts inventory, and sets batch status to REVERSED', async () => {
    const batchRow = {
      id: 'batch-row-1',
      company_id: COMPANY,
      reference_number: 'OPN-20261127-201',
      warehouse_id: WH,
      division_id: 'div-ccd',
      status: 'POSTED',
      total_quantity: 100,
      total_value: 15000,
    };

    mockManager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM erp_users')) return [{ id: USER_ID }];
      if (sql.includes('FROM opening_stock_batches')) return [batchRow];
      if (sql.includes('FROM opening_stock_batch_lines')) {
        return [
          {
            id: 'bl-1',
            item_id: ITEM_1,
            uom_id: UOM_KG,
            quantity: '100',
            unit_cost: '150',
            total_cost: '15000',
            batch_id: null,
            item_code: 'RM-WIRE-001',
            item_name: 'Copper Wire',
          },
        ];
      }
      if (sql.includes('FROM warehouses')) return [{ name: 'Main Warehouse' }];
      if (sql.includes('FROM inventory_policies')) return [];
      if (sql.includes('FROM inventory_balances')) return [{ on_hand: '120' }];
      return [];
    });

    const res = await service.reverseBatch(COMPANY, 'OPN-20261127-201', WH, USER_ID);

    expect(res).toMatchObject({
      reversed: true,
      referenceNumber: 'OPN-20261127-201',
      status: 'REVERSED',
      lineCount: 1,
    });
    expect(balanceService.updateBalance).toHaveBeenCalledWith(
      COMPANY,
      ITEM_1,
      WH,
      null,
      null,
      UOM_KG,
      100,
      'OUT',
      mockManager,
      false,
    );
    expect(ledgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: 'OPENING',
        direction: 'OUT',
        referenceType: 'OPENING_REVERSAL',
        referenceNumber: 'OPN-20261127-201',
        quantity: 100,
      }),
      mockManager,
    );
    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'REVERSED'"),
      expect.arrayContaining([USER_ID, 'batch-row-1']),
    );
  });

  it('restoreBatch: re-posts previously REVERSED lines as IN and flips status back to POSTED', async () => {
    const batchRow = {
      id: 'batch-row-1',
      company_id: COMPANY,
      reference_number: 'OPN-20261127-201',
      warehouse_id: WH,
      division_id: 'div-ccd',
      status: 'REVERSED',
      total_quantity: 100,
      total_value: 15000,
    };

    mockManager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM erp_users')) return [{ id: USER_ID }];
      if (sql.includes('FROM opening_stock_batches')) return [batchRow];
      if (sql.includes('FROM opening_stock_batch_lines')) {
        return [
          {
            id: 'bl-1',
            item_id: ITEM_1,
            uom_id: UOM_KG,
            quantity: '100',
            unit_cost: '150',
            total_cost: '15000',
            batch_id: null,
            batch_number: null,
            serial_number: null,
            notes: 'Restored note',
          },
        ];
      }
      if (sql.includes('FROM inventory_balances')) return [{ item_id: ITEM_1, prev_qty: '20' }];
      return [];
    });

    const res = await service.restoreBatch(COMPANY, 'OPN-20261127-201', WH, USER_ID);

    expect(res).toMatchObject({
      restored: true,
      referenceNumber: 'OPN-20261127-201',
      status: 'POSTED',
      lineCount: 1,
    });
    expect(ledgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionType: 'OPENING',
        direction: 'IN',
        referenceType: 'OPENING_RESTORE',
        referenceNumber: 'OPN-20261127-201',
        quantity: 100,
      }),
      mockManager,
    );
    expect(balanceService.updateBalance).toHaveBeenCalledWith(
      COMPANY,
      ITEM_1,
      WH,
      null,
      null,
      UOM_KG,
      100,
      'IN',
      mockManager,
    );
    expect(mockManager.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'POSTED'"),
      expect.arrayContaining([USER_ID, 'batch-row-1']),
    );
  });

  it('restoreBatch: throws NotFoundException when batch does not exist and BadRequestException when already POSTED', async () => {
    mockManager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM erp_users')) return [{ id: USER_ID }];
      if (sql.includes('FROM opening_stock_batches')) return [];
      return [];
    });
    await expect(service.restoreBatch(COMPANY, 'OPN-MISSING', WH, USER_ID)).rejects.toThrow(NotFoundException);

    mockManager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM erp_users')) return [{ id: USER_ID }];
      if (sql.includes('FROM opening_stock_batches')) return [{ id: 'b1', status: 'POSTED' }];
      return [];
    });
    await expect(service.restoreBatch(COMPANY, 'OPN-ACTIVE', WH, USER_ID)).rejects.toThrow(BadRequestException);
  });
});
