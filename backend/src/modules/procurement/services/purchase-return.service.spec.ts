import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PurchaseReturnService } from './purchase-return.service';
import { PurchaseReturn, PurchaseReturnLine } from '../entities';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';

const cloneReturn = (r: any) => ({
  ...r,
  lines: (r.lines || []).map((l: any) => ({ ...l })),
});

describe('PurchaseReturnService (complete → reverse inventory / stock OUT)', () => {
  let service: PurchaseReturnService;
  let repo: any;
  let lineRepo: any;
  let stockLedgerService: any;
  let balanceService: any;
  let managerStub: any;

  const COMPANY = 'company-1';
  const RETURN = 'return-1';
  const ITEM = 'item-1';
  const UOM = 'uom-1';
  const WH = 'wh-1';

  const returnFixture: any = {
    id: RETURN,
    companyId: COMPANY,
    returnCode: 'RET-001',
    warehouseId: WH,
    returnDate: new Date('2026-01-12'),
    status: 'SHIPPED',
    lines: [
      {
        id: 'line-1',
        returnId: RETURN,
        itemId: ITEM,
        uomId: UOM,
        quantity: 10,
        unitPrice: 15,
      },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    stockLedgerService = { create: jest.fn().mockResolvedValue({ id: 'ledger-1' }) };
    balanceService = { updateBalance: jest.fn().mockResolvedValue({}) };

    lineRepo = { create: jest.fn(), save: jest.fn(), find: jest.fn().mockResolvedValue([]) };

    managerStub = { getRepository: jest.fn() };

    repo = {
      create: jest.fn(),
      save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
      findOne: jest.fn().mockImplementation(() => Promise.resolve(cloneReturn(returnFixture))),
      manager: { transaction: jest.fn(async (cb: any) => cb(managerStub)) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchaseReturnService,
        { provide: getRepositoryToken(PurchaseReturn), useValue: repo },
        { provide: getRepositoryToken(PurchaseReturnLine), useValue: lineRepo },
        { provide: StockLedgerService, useValue: stockLedgerService },
        { provide: InventoryBalanceService, useValue: balanceService },
      ],
    }).compile();

    service = moduleRef.get(PurchaseReturnService);
  });

  it('posts each returned quantity to the stock ledger as an OUT reversal', async () => {
    const result: any = await service.complete(RETURN, 'user-1');

    expect(repo.manager.transaction).toHaveBeenCalled();
    expect(stockLedgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: COMPANY,
        transactionType: 'PURCHASE_RETURN',
        itemId: ITEM,
        warehouseId: WH,
        quantity: 10,
        uomId: UOM,
        direction: 'OUT',
        referenceType: 'PURCHASE_RETURN',
        referenceId: RETURN,
        referenceNumber: 'RET-001',
        createdBy: 'user-1',
      }),
      managerStub,
    );
    expect(balanceService.updateBalance).toHaveBeenCalledWith(
      COMPANY, ITEM, WH, null, null, UOM, 10, 'OUT', managerStub,
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.postedBy).toBe('user-1');
  });

  it('reverses every line of a multi-line return', async () => {
    repo.findOne.mockResolvedValue({
      ...returnFixture,
      lines: [
        { id: 'line-1', itemId: ITEM, uomId: UOM, quantity: 10, unitPrice: 15 },
        { id: 'line-2', itemId: 'item-2', uomId: UOM, quantity: 5, unitPrice: 20 },
      ],
    });

    await service.complete(RETURN);

    expect(stockLedgerService.create).toHaveBeenCalledTimes(2);
    expect(stockLedgerService.create).toHaveBeenNthCalledWith(
      1, expect.objectContaining({ itemId: ITEM, quantity: 10, direction: 'OUT' }), managerStub,
    );
    expect(stockLedgerService.create).toHaveBeenNthCalledWith(
      2, expect.objectContaining({ itemId: 'item-2', quantity: 5, direction: 'OUT' }), managerStub,
    );
    expect(balanceService.updateBalance).toHaveBeenCalledTimes(2);
  });

  it('skips zero/empty lines without creating a ledger entry', async () => {
    repo.findOne.mockResolvedValue({
      ...returnFixture,
      lines: [
        { id: 'line-1', itemId: ITEM, uomId: UOM, quantity: 0, unitPrice: 15 },
      ],
    });

    await service.complete(RETURN);

    expect(stockLedgerService.create).not.toHaveBeenCalled();
    expect(balanceService.updateBalance).not.toHaveBeenCalled();
  });

  it('does NOT reverse stock when the return is not in SHIPPED status', async () => {
    repo.findOne.mockResolvedValue({ ...returnFixture, status: 'DRAFT' });
    await expect(service.complete(RETURN)).rejects.toBeInstanceOf(BadRequestException);
    expect(stockLedgerService.create).not.toHaveBeenCalled();
    expect(balanceService.updateBalance).not.toHaveBeenCalled();
  });
});
