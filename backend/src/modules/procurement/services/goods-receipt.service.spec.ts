import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { GoodsReceiptService } from './goods-receipt.service';
import { GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine } from '../entities';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';

const cloneReceipt = (r: any) => ({
  ...r,
  lines: (r.lines || []).map((l: any) => ({ ...l, poLine: l.poLine ? { ...l.poLine } : undefined })),
});

describe('GoodsReceiptService (post → inventory + PO tracking)', () => {
  let service: GoodsReceiptService;
  let repo: any;
  let lineRepo: any;
  let poRepo: any;
  let poLineRepo: any;
  let stockLedgerService: any;
  let balanceService: any;
  let managerStub: any;
  let receiptRepoInManager: any;
  let poRepoInManager: any;
  let poLineRepoInManager: any;

  const COMPANY = 'company-1';
  const RECEIPT = 'receipt-1';
  const PO = 'po-1';
  const PO_LINE = 'po-line-1';
  const ITEM = 'item-1';
  const UOM = 'uom-1';
  const WH = 'wh-1';

  const receiptFixture: any = {
    id: RECEIPT,
    companyId: COMPANY,
    receiptCode: 'GRN-001',
    poId: PO,
    grnNumber: 'GRN-001',
    warehouseId: WH,
    receiptDate: new Date('2026-01-10'),
    status: 'ACCEPTED',
    lines: [
      {
        id: 'line-1',
        receiptId: RECEIPT,
        poLineId: PO_LINE,
        itemId: ITEM,
        uomId: UOM,
        locationId: null,
        batchId: null,
        quantityAccepted: 50,
        quantityRejected: 0,
        unitPrice: 10,
        poLine: { id: PO_LINE, poId: PO, quantity: 100, receivedQuantity: 0 },
      },
    ],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    stockLedgerService = { create: jest.fn().mockResolvedValue({ id: 'ledger-1' }) };
    balanceService = { updateBalance: jest.fn().mockResolvedValue({}) };

    lineRepo = { create: jest.fn(), save: jest.fn(), find: jest.fn().mockResolvedValue([]) };

    poLineRepoInManager = {
      find: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    poRepoInManager = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    receiptRepoInManager = {};

    managerStub = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity === PurchaseOrderLine) return poLineRepoInManager;
        if (entity === PurchaseOrder) return poRepoInManager;
        return receiptRepoInManager;
      }),
    };

    repo = {
      create: jest.fn(),
      save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
      findOne: jest.fn().mockImplementation(() => Promise.resolve(cloneReceipt(receiptFixture))),
      manager: { transaction: jest.fn(async (cb: any) => cb(managerStub)) },
    };

    poRepo = { findOne: jest.fn(), save: jest.fn(), update: jest.fn() };
    poLineRepo = {
      find: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      save: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GoodsReceiptService,
        { provide: getRepositoryToken(GoodsReceipt), useValue: repo },
        { provide: getRepositoryToken(GoodsReceiptLine), useValue: lineRepo },
        { provide: getRepositoryToken(PurchaseOrder), useValue: poRepo },
        { provide: getRepositoryToken(PurchaseOrderLine), useValue: poLineRepo },
        { provide: StockLedgerService, useValue: stockLedgerService },
        { provide: InventoryBalanceService, useValue: balanceService },
      ],
    }).compile();

    service = moduleRef.get(GoodsReceiptService);
  });

  it('posts accepted quantities to the stock ledger and balance', async () => {
    poLineRepoInManager.find.mockResolvedValue([{ id: PO_LINE, poId: PO, quantity: 100, receivedQuantity: 0 }]);
    poRepoInManager.findOne.mockResolvedValue({ id: PO, status: 'APPROVED' });

    const result: any = await service.post(RECEIPT, 'user-1');

    expect(repo.manager.transaction).toHaveBeenCalled();
    expect(stockLedgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: COMPANY,
        transactionType: 'GOODS_RECEIPT',
        itemId: ITEM,
        warehouseId: WH,
        quantity: 50,
        uomId: UOM,
        direction: 'IN',
        referenceType: 'GOODS_RECEIPT',
        referenceId: RECEIPT,
        referenceNumber: 'GRN-001',
      }),
      managerStub,
    );
    expect(balanceService.updateBalance).toHaveBeenCalledWith(
      COMPANY, ITEM, WH, null, null, UOM, 50, 'IN', managerStub,
    );
    expect(result.status).toBe('POSTED');
    expect(result.postedBy).toBe('user-1');
  });

  it('accumulates received quantity on the purchase order line', async () => {
    poLineRepoInManager.find
      .mockResolvedValueOnce([{ id: PO_LINE, poId: PO, quantity: 100, receivedQuantity: 0 }])
      .mockResolvedValueOnce([{ id: PO_LINE, poId: PO, quantity: 100, receivedQuantity: 50 }]);
    poRepoInManager.findOne.mockResolvedValue({ id: PO, status: 'APPROVED' });

    await service.post(RECEIPT, 'user-1');

    expect(poLineRepoInManager.update).toHaveBeenCalledWith(PO_LINE, { receivedQuantity: 50 });
  });

  it('marks the PO as FULLY_RECEIVED once every line is received in full', async () => {
    poLineRepoInManager.find
      .mockResolvedValueOnce([{ id: PO_LINE, poId: PO, quantity: 50, receivedQuantity: 0 }])
      .mockResolvedValueOnce([{ id: PO_LINE, poId: PO, quantity: 50, receivedQuantity: 50 }]);
    poRepoInManager.findOne.mockResolvedValue({ id: PO, status: 'APPROVED', receivedAmount: 0 });

    await service.post(RECEIPT);

    expect(poRepoInManager.update).toHaveBeenCalledWith(PO, expect.objectContaining({ status: 'FULLY_RECEIVED' }));
  });

  it('accumulates the received VALUE on the PO from the accepted quantity', async () => {
    poLineRepoInManager.find
      .mockResolvedValueOnce([{ id: PO_LINE, poId: PO, quantity: 100, receivedQuantity: 0, unitPrice: 20 }])
      .mockResolvedValueOnce([{ id: PO_LINE, poId: PO, quantity: 100, receivedQuantity: 50, unitPrice: 20 }]);
    poRepoInManager.findOne.mockResolvedValue({ id: PO, status: 'APPROVED', receivedAmount: 0 });

    await service.post(RECEIPT);

    expect(poRepoInManager.update).toHaveBeenCalledWith(PO, expect.objectContaining({ receivedAmount: 1000 }));
  });

  it('marks the PO as PARTIALLY_RECEIVED when only some lines are received', async () => {
    poLineRepoInManager.find
      .mockResolvedValueOnce([{ id: PO_LINE, poId: PO, quantity: 100, receivedQuantity: 0 }])
      .mockResolvedValueOnce([{ id: PO_LINE, poId: PO, quantity: 100, receivedQuantity: 50 }]);
    poRepoInManager.findOne.mockResolvedValue({ id: PO, status: 'APPROVED' });

    await service.post(RECEIPT);

    expect(poRepoInManager.update).toHaveBeenCalledWith(PO, expect.objectContaining({ status: 'PARTIALLY_RECEIVED' }));
  });

  it('rejects posting receipts not in ACCEPTED/PARTIALLY_ACCEPTED status', async () => {
    repo.findOne.mockResolvedValue({ ...receiptFixture, status: 'DRAFT' });
    await expect(service.post(RECEIPT)).rejects.toBeInstanceOf(BadRequestException);
    expect(stockLedgerService.create).not.toHaveBeenCalled();
  });
});
