import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GoodsReceiptService } from './goods-receipt.service';
import { GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine } from '../entities';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { Warehouse } from '../../organization/entities/warehouse.entity';

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
  let warehouseRepoInManager: any;
  let poRepoInManager: any;
  let poLineRepoInManager: any;

  const COMPANY = 'company-1';
  const OTHER_COMPANY = 'company-2';
  const RECEIPT = 'receipt-1';
  const PO = 'po-1';
  const PO_LINE = 'po-line-1';
  const ITEM = 'item-1';
  const UOM = 'uom-1';
  const WH = 'wh-1';

  const lineFixture = (over: any = {}) => ({
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
    ...over,
  });

  const receiptFixture: any = {
    id: RECEIPT,
    companyId: COMPANY,
    receiptCode: 'GRN-001',
    poId: PO,
    grnNumber: 'GRN-001',
    warehouseId: WH,
    receiptDate: new Date('2026-01-10'),
    status: 'ACCEPTED',
    postedAt: null,
    postedBy: null,
    lines: [lineFixture()],
  };

  function lockedQueryBuilder(receipt: any) {
    const qb: any = {};
    qb.setLock = jest.fn(() => qb);
    qb.where = jest.fn(() => qb);
    qb.leftJoinAndSelect = jest.fn(() => qb);
    qb.getOne = jest.fn(() => Promise.resolve(cloneReceipt(receipt)));
    return qb;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    stockLedgerService = { create: jest.fn().mockResolvedValue({ id: 'ledger-1' }) };
    balanceService = { updateBalance: jest.fn().mockResolvedValue({}) };

    lineRepo = { create: jest.fn(), save: jest.fn(), find: jest.fn().mockResolvedValue([]) };

    poLineRepoInManager = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    };
    poRepoInManager = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    receiptRepoInManager = {
      createQueryBuilder: jest.fn(() => lockedQueryBuilder(receiptFixture)),
      update: jest.fn().mockResolvedValue({}),
    };
    warehouseRepoInManager = {
      findOne: jest.fn().mockResolvedValue({ id: WH, companyId: COMPANY, warehouseCode: 'WH-1', status: 'ACTIVE' }),
    };

    managerStub = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity === PurchaseOrderLine) return poLineRepoInManager;
        if (entity === PurchaseOrder) return poRepoInManager;
        if (entity === GoodsReceipt) return receiptRepoInManager;
        if (entity === Warehouse) return warehouseRepoInManager;
        return {};
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

  // TEST 1 + 2 + 3 — successful post creates the inventory receipt, writes the
  // ledger quantity, and updates the balance.
  it('TEST 1/2/3 — posts accepted quantities to stock ledger and inventory balance', async () => {
    poLineRepoInManager.find.mockResolvedValue([{ id: PO_LINE, poId: PO, quantity: 100, receivedQuantity: 0 }]);
    poRepoInManager.findOne.mockResolvedValue({ id: PO, status: 'APPROVED' });

    await service.post(RECEIPT, 'user-1', COMPANY);

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
    // The GRN header is flipped to POSTED inside the transaction (audit fields
    // written via the manager-scoped repo), not as a post-commit save.
    expect(receiptRepoInManager.update).toHaveBeenCalledWith(
      RECEIPT,
      expect.objectContaining({ status: 'POSTED', postedBy: 'user-1', postedAt: expect.any(Date) }),
    );
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

  // TEST 4 + 7 — double/is-already-posted rejection: a second post must not
  // create a second inventory movement.
  it('TEST 4/7 — rejects a second post of an already-posted GRN (no double inventory)', async () => {
    // Inside the transaction the locked re-read already carries posted state.
    receiptRepoInManager.createQueryBuilder = jest.fn(() =>
      lockedQueryBuilder({ ...receiptFixture, status: 'POSTED', postedAt: new Date(), postedBy: 'user-1' }),
    );

    await expect(service.post(RECEIPT, 'user-1', COMPANY)).rejects.toBeInstanceOf(BadRequestException);
    expect(stockLedgerService.create).not.toHaveBeenCalled();
    expect(balanceService.updateBalance).not.toHaveBeenCalled();
    expect(receiptRepoInManager.update).not.toHaveBeenCalled();
  });

  // TEST 4b — even a second post BEFORE the header flip still cannot double-post
  // because the guard re-checks inside the same write-locked transaction.
  it('TEST 4b — second post attempt is rejected once the receipt already shows posted state', async () => {
    await service.post(RECEIPT, 'user-1', COMPANY);
    // Simulate the second physical call observing the posted header.
    receiptRepoInManager.createQueryBuilder = jest.fn(() =>
      lockedQueryBuilder({ ...receiptFixture, status: 'POSTED', postedAt: new Date(), postedBy: 'user-1' }),
    );

    await expect(service.post(RECEIPT, 'user-1', COMPANY)).rejects.toBeInstanceOf(BadRequestException);
    // Only one ledger call happened (from the first post).
    expect(stockLedgerService.create).toHaveBeenCalledTimes(1);
  });

  // TEST 5 — multi-line GRN: every line posts exactly once with its own item/qty.
  it('TEST 5 — multi-line GRN posts every line exactly once to inventory', async () => {
    const multi: any = {
      ...receiptFixture,
      lines: [
        lineFixture({ id: 'l1', itemId: 'item-A', quantityAccepted: 100, poLine: { id: 'p1', poId: PO, quantity: 1000, receivedQuantity: 0 } }),
        lineFixture({ id: 'l2', itemId: 'item-B', quantityAccepted: 50, poLine: { id: 'p2', poId: PO, quantity: 1000, receivedQuantity: 0 } }),
        lineFixture({ id: 'l3', itemId: 'item-C', quantityAccepted: 25, poLine: { id: 'p3', poId: PO, quantity: 1000, receivedQuantity: 0 } }),
      ],
    };
    repo.findOne.mockResolvedValue(cloneReceipt(multi));
    receiptRepoInManager.createQueryBuilder = jest.fn(() => lockedQueryBuilder(multi));
    poLineRepoInManager.find.mockResolvedValue([
      { id: 'p1', poId: PO, quantity: 1000, receivedQuantity: 0, unitPrice: 1 },
      { id: 'p2', poId: PO, quantity: 1000, receivedQuantity: 0, unitPrice: 1 },
      { id: 'p3', poId: PO, quantity: 1000, receivedQuantity: 0, unitPrice: 1 },
    ]);
    poRepoInManager.findOne.mockResolvedValue({ id: PO, status: 'APPROVED', receivedAmount: 0 });

    await service.post(RECEIPT, 'user-1', COMPANY);

    expect(stockLedgerService.create).toHaveBeenCalledTimes(3);
    expect(stockLedgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-A', quantity: 100, warehouseId: WH }), managerStub);
    expect(stockLedgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-B', quantity: 50, warehouseId: WH }), managerStub);
    expect(stockLedgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 'item-C', quantity: 25, warehouseId: WH }), managerStub);
    expect(balanceService.updateBalance).toHaveBeenCalledTimes(3);
    // Reference linkage traced back to the same GRN.
    expect(stockLedgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({ referenceType: 'GOODS_RECEIPT', referenceId: RECEIPT }), managerStub);
  });

  // TEST 6 — draft GRN must not affect inventory.
  it('TEST 6 — DRAFT GRN is rejected and never touches inventory', async () => {
    repo.findOne.mockResolvedValue({ ...receiptFixture, status: 'DRAFT' });
    await expect(service.post(RECEIPT)).rejects.toBeInstanceOf(BadRequestException);
    expect(poLineRepoInManager.find).not.toHaveBeenCalled();
    expect(stockLedgerService.create).not.toHaveBeenCalled();
    expect(balanceService.updateBalance).not.toHaveBeenCalled();
  });

  // TEST 8 — atomic rollback: if inventory posting fails, the error propagates
  // and no GRN status/PO update is committed (transaction rolls back).
  it('TEST 8 — inventory posting failure rolls back atomically (no GRN POSTED, no partial ledger)', async () => {
    // The transaction callback throws when the ledger write fails; nothing else
    // is applied because the shared manager.transaction mock does not commit.
    stockLedgerService.create.mockRejectedValueOnce(new Error('ledger insert failed'));

    await expect(service.post(RECEIPT, 'user-1', COMPANY)).rejects.toThrow('ledger insert failed');
    expect(receiptRepoInManager.update).not.toHaveBeenCalled();
    expect(poRepoInManager.update).not.toHaveBeenCalled();
  });

  // TEST 9 — wrong-company / organisation isolation.
  it('TEST 9 — posting a receipt of another company is forbidden', async () => {
    await expect(service.post(RECEIPT, 'user-1', OTHER_COMPANY)).rejects.toBeInstanceOf(ForbiddenException);
    expect(stockLedgerService.create).not.toHaveBeenCalled();
    expect(receiptRepoInManager.update).not.toHaveBeenCalled();
  });

  // TEST 10 — warehouse validation: missing / not-in-company / inactive.
  it('TEST 10a — missing warehouse on the GRN is rejected', async () => {
    repo.findOne.mockResolvedValue(cloneReceipt({ ...receiptFixture, warehouseId: null }));
    receiptRepoInManager.createQueryBuilder = jest.fn(() =>
      lockedQueryBuilder({ ...receiptFixture, warehouseId: null }));
    await expect(service.post(RECEIPT, 'user-1', COMPANY)).rejects.toBeInstanceOf(BadRequestException);
    expect(stockLedgerService.create).not.toHaveBeenCalled();
  });

  it('TEST 10b — warehouse not found in the company is rejected', async () => {
    warehouseRepoInManager.findOne.mockResolvedValue(null);
    await expect(service.post(RECEIPT, 'user-1', COMPANY)).rejects.toBeInstanceOf(BadRequestException);
    expect(stockLedgerService.create).not.toHaveBeenCalled();
  });

  it('TEST 10c — inactive warehouse is rejected', async () => {
    warehouseRepoInManager.findOne.mockResolvedValue({ id: WH, companyId: COMPANY, warehouseCode: 'WH-1', status: 'INACTIVE' });
    await expect(service.post(RECEIPT, 'user-1', COMPANY)).rejects.toBeInstanceOf(BadRequestException);
    expect(stockLedgerService.create).not.toHaveBeenCalled();
  });

  // TEST 11 — correct existing receipt transaction type is used.
  it('TEST 11 — uses the existing GOODS_RECEIPT transaction type', async () => {
    poLineRepoInManager.find.mockResolvedValue([]);
    await service.post(RECEIPT, 'user-1', COMPANY);
    expect(stockLedgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({ transactionType: 'GOODS_RECEIPT', direction: 'IN' }), managerStub);
  });

  // TEST 12 — reference linkage to the source GRN.
  it('TEST 12 — ledger entry is traceable back to the GRN (referenceType/id/number)', async () => {
    poLineRepoInManager.find.mockResolvedValue([]);
    await service.post(RECEIPT, 'user-1', COMPANY);
    expect(stockLedgerService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceType: 'GOODS_RECEIPT',
        referenceId: RECEIPT,
        referenceNumber: 'GRN-001',
      }),
      managerStub,
    );
  });

  // Atomicity of the header status: the POSTED flip must happen inside the
  // transaction (receiptRepoInManager.update), never as a post-commit save.
  it('atomicity — GRN header POSTED status is written inside the transaction', async () => {
    poLineRepoInManager.find.mockResolvedValue([]);
    await service.post(RECEIPT, 'user-1', COMPANY);
    expect(receiptRepoInManager.update).toHaveBeenCalledWith(
      RECEIPT,
      expect.objectContaining({ status: 'POSTED', postedBy: 'user-1', postedAt: expect.any(Date) }),
    );
  });

  it('rejects posting receipts not in ACCEPTED/PARTIALLY_ACCEPTED status', async () => {
    repo.findOne.mockResolvedValue({ ...receiptFixture, status: 'DRAFT' });
    await expect(service.post(RECEIPT)).rejects.toBeInstanceOf(BadRequestException);
    expect(stockLedgerService.create).not.toHaveBeenCalled();
  });
});
