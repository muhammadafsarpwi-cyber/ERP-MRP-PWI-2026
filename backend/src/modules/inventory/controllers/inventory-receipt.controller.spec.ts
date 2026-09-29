import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InventoryReceiptController } from './inventory-receipt.controller';
import { StockLedgerService } from '../services/stock-ledger.service';
import { InventoryBalanceService } from '../services/inventory-balance.service';
import { RawMaterialReceivingService } from '../services/raw-material-receiving.service';
import { Division, Section, Department } from '../../organization/entities';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { StockLedger } from '../entities';
import { SupabaseJwtGuard } from '../../auth/guards/supabase-jwt.guard';
import { OrgScopeGuard } from '../../auth/guards/org-scope.guard';
import { PermissionGuard } from '../../auth/guards/permission.guard';
import { DivisionScopeGuard } from '../../auth/guards/division-scope.guard';
import { DivisionAccessService } from '../../permission/services/division-access.service';

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const DIV_CCD = 'd1000000-0000-0000-0000-000000000002';

/**
 * PROMPT #26 — `makeReq()` now carries `allowedDivisionIds`, which is what
 * `DivisionScopeGuard` publishes and what the controller forwards to the
 * service. Omitting it models a guard that resolved "unrestricted", so the
 * service receives `undefined` and applies no filter.
 */
const makeReq = (allowedDivisionIds: any = 'ALL') => ({
  erpUser: { id: 'user-1', defaultCompanyId: COMPANY },
  orgScopes: [{ companyId: COMPANY }],
  allowedDivisionIds,
});

/** A caller the guard resolved to exactly one division (the reported bug). */
const makeScopedReq = (divisionIds: string[]) => makeReq(divisionIds);

const makeMockRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn((x) => x),
  save: jest.fn((x) => x),
});

describe('InventoryReceiptController (return)', () => {
  let controller: InventoryReceiptController;
  let ledgerService: any;
  let balanceService: any;
  let rawMaterialService: any;
  let ledgerRepo: any;
  let divisionRepo: any;
  let sectionRepo: any;
  let departmentRepo: any;
  let warehouseRepo: any;
  let itemRepo: any;
  let uomRepo: any;

  beforeEach(async () => {
    divisionRepo = makeMockRepo();
    sectionRepo = makeMockRepo();
    departmentRepo = makeMockRepo();
    warehouseRepo = makeMockRepo();
    itemRepo = makeMockRepo();
    uomRepo = makeMockRepo();
    rawMaterialService = {
      createReceipt: jest.fn(),
      findAllReceipts: jest.fn(),
      findReceiptById: jest.fn(),
      createReturn: jest.fn(),
      findAllReturns: jest.fn(),
      findReturnById: jest.fn(),
      getReport: jest.fn(),
      addReceiptDocument: jest.fn(),
      listReceiptDocuments: jest.fn(),
      removeReceiptDocument: jest.fn(),
      shareReceiptWhatsApp: jest.fn(),
      getReceiptInventory: jest.fn(),
      getFormReferenceData: jest.fn(),
    };
    ledgerService = { create: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
      findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findOneByCompany: jest.fn().mockResolvedValue({ id: 'ledger-1', companyId: COMPANY, transactionType: 'RECEIPT', direction: 'IN', itemId: 'item-1', warehouseId: 'wh-1', quantity: 100, uomId: 'uom-kg', divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dept-1' }),
      update: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    balanceService = {
      getAvailableStock: jest.fn().mockResolvedValue(5000),
      updateBalance: jest.fn().mockResolvedValue({ id: 'bal-1' }),
    };
    ledgerRepo = {
      manager: {
        transaction: jest.fn(async (cb: (m: any) => Promise<any>) => cb({
          getRepository: jest.fn((e: any) => ({ update: jest.fn(), save: jest.fn((x: any) => x), findOne: jest.fn() })),
        })),
      },
    };

    const module = await Test.createTestingModule({
      controllers: [InventoryReceiptController],
      providers: [
        { provide: StockLedgerService, useValue: ledgerService },
        { provide: InventoryBalanceService, useValue: balanceService },
        { provide: RawMaterialReceivingService, useValue: rawMaterialService },
        { provide: getRepositoryToken(Division), useValue: divisionRepo },
        { provide: getRepositoryToken(Section), useValue: sectionRepo },
        { provide: getRepositoryToken(Department), useValue: departmentRepo },
        { provide: getRepositoryToken(Warehouse), useValue: warehouseRepo },
        { provide: getRepositoryToken(Item), useValue: itemRepo },
        { provide: getRepositoryToken(Uom), useValue: uomRepo },
        { provide: getRepositoryToken(StockLedger), useValue: ledgerRepo },
        // PROMPT #26 — the controller now runs DivisionScopeGuard, which needs
        // DivisionAccessService. Overridden to "unrestricted" so the existing
        // happy-path assertions keep their pre-scope behaviour; the new
        // `division scope enforcement` block below exercises the restricted path.
        { provide: DivisionAccessService, useValue: { isEnforcementEnabled: () => true, resolveForRequest: async (r: any) => (r.allowedDivisionIds ?? 'ALL') } },
      ],
    })
      .overrideGuard(SupabaseJwtGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(OrgScopeGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(DivisionScopeGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<InventoryReceiptController>(InventoryReceiptController);
  });

  const validDto = () => ({
    itemId: 'item-1',
    quantity: 100,
    uomId: 'uom-kg',
    divisionId: 'div-1',
    sectionId: 'sec-1',
    departmentId: 'dept-1',
    warehouseId: 'wh-1',
    returnDate: '2026-08-31',
    reference: 'RET-TEST-001',
    reason: 'Test return',
  });

  /** Minimal multi-item Gate Pass payload (header + one line). */
  const multiReceiptDto = () => ({
    sectionId: 'sec-1',
    departmentId: 'dept-1',
    warehouseId: 'wh-1',
    items: [
      { itemId: 'item-1', quantity: 10, uomId: 'uom-kg', gatePassWeight: 12, receivedWeight: 10 },
    ],
  });

  describe('createReturn', () => {
    it('should return material when stock is sufficient', async () => {
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1' });
      itemRepo.findOne.mockResolvedValue({ id: 'item-1', companyId: COMPANY, status: 'ACTIVE', itemType: 'RAW_MATERIAL' });
      warehouseRepo.findOne.mockResolvedValue({ id: 'wh-1', companyId: COMPANY, status: 'ACTIVE' });
      uomRepo.findOne.mockResolvedValue({ id: 'uom-kg' });
      balanceService.getAvailableStock.mockResolvedValue(5000);

      const result = await controller.createReturn(validDto(), makeReq());

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('ledger-1');
      expect(ledgerService.create).toHaveBeenCalledWith(expect.objectContaining({
        transactionType: 'RETURN_OUT',
        direction: 'OUT',
        quantity: 100,
        companyId: COMPANY,
      }), expect.anything());
      expect(balanceService.updateBalance).toHaveBeenCalledWith(
        COMPANY, 'item-1', 'wh-1', null, null, 'uom-kg', 100, 'OUT', expect.anything(),
      );
      expect(ledgerRepo.manager.transaction).toHaveBeenCalled();
    });

    it('should reject with insufficient stock', async () => {
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1' });
      itemRepo.findOne.mockResolvedValue({ id: 'item-1', companyId: COMPANY, status: 'ACTIVE', itemType: 'RAW_MATERIAL' });
      warehouseRepo.findOne.mockResolvedValue({ id: 'wh-1', companyId: COMPANY, status: 'ACTIVE' });
      uomRepo.findOne.mockResolvedValue({ id: 'uom-kg' });
      balanceService.getAvailableStock.mockResolvedValue(50); // Only 50 available, request 100

      await expect(controller.createReturn(validDto(), makeReq())).rejects.toThrow(BadRequestException);
      expect(ledgerService.create).not.toHaveBeenCalled();
      expect(balanceService.updateBalance).not.toHaveBeenCalled();
    });

    it('should reject when division is not found', async () => {
      divisionRepo.findOne.mockResolvedValue(null); // Division not found

      await expect(controller.createReturn(validDto(), makeReq())).rejects.toThrow(NotFoundException);
      expect(ledgerService.create).not.toHaveBeenCalled();
    });

    it('should reject when item is not ACTIVE', async () => {
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1' });
      itemRepo.findOne.mockResolvedValue({ id: 'item-1', companyId: COMPANY, status: 'INACTIVE', itemType: 'RAW_MATERIAL' });

      await expect(controller.createReturn(validDto(), makeReq())).rejects.toThrow(BadRequestException);
      expect(ledgerService.create).not.toHaveBeenCalled();
    });

    it('should reject when item is not RAW_MATERIAL', async () => {
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1' });
      itemRepo.findOne.mockResolvedValue({ id: 'item-1', companyId: COMPANY, status: 'ACTIVE', itemType: 'FINISHED_GOOD' });

      await expect(controller.createReturn(validDto(), makeReq())).rejects.toThrow(BadRequestException);
      expect(ledgerService.create).not.toHaveBeenCalled();
    });
  });

  describe('update (edit)', () => {
    const validUpdateDto = () => ({
      itemId: 'item-2', quantity: 200, uomId: 'uom-kg',
      divisionId: 'div-1', sectionId: 'sec-1', departmentId: 'dept-1',
      warehouseId: 'wh-1', transactionDate: '2026-08-31', reference: 'EDIT-TEST', notes: 'Updated',
    });

    it('should edit a RECEIPT by reversing IN and applying new IN', async () => {
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', status: 'ACTIVE' });
      sectionRepo.findOne.mockResolvedValue({ id: 'sec-1', divisionId: 'div-1' });
      departmentRepo.findOne.mockResolvedValue({ id: 'dept-1', divisionId: 'div-1', sectionId: 'sec-1' });
      itemRepo.findOne.mockResolvedValue({ id: 'item-2', companyId: COMPANY, status: 'ACTIVE', itemType: 'RAW_MATERIAL' });
      warehouseRepo.findOne.mockResolvedValue({ id: 'wh-1', companyId: COMPANY, status: 'ACTIVE' });
      uomRepo.findOne.mockResolvedValue({ id: 'uom-kg' });

      const result = await controller.update('ledger-1', validUpdateDto(), makeReq());

      expect(result.success).toBe(true);
      // Reverse original (100 IN → OUT), then apply new (200 IN)
      expect(balanceService.updateBalance).toHaveBeenCalledTimes(2);
      expect(balanceService.updateBalance).toHaveBeenNthCalledWith(1, COMPANY, 'item-1', 'wh-1', null, null, 'uom-kg', 100, 'OUT', expect.anything());
      expect(balanceService.updateBalance).toHaveBeenNthCalledWith(2, COMPANY, 'item-2', 'wh-1', null, null, 'uom-kg', 200, 'IN', expect.anything());
      expect(ledgerService.update).toHaveBeenCalledWith('ledger-1', expect.objectContaining({ itemId: 'item-2', quantity: 200 }), expect.anything());
    });
  });

  describe('remove (delete)', () => {
    it('should delete a RECEIPT by reversing the IN effect', async () => {
      ledgerService.findOneByCompany.mockResolvedValue({ id: 'ledger-1', companyId: COMPANY, transactionType: 'RECEIPT', direction: 'IN', itemId: 'item-1', warehouseId: 'wh-1', quantity: 100, uomId: 'uom-kg' });

      const result = await controller.remove('ledger-1', makeReq());

      expect(result.success).toBe(true);
      expect(balanceService.updateBalance).toHaveBeenCalledWith(COMPANY, 'item-1', 'wh-1', null, null, 'uom-kg', 100, 'OUT', expect.anything());
      expect(ledgerService.remove).toHaveBeenCalledWith('ledger-1', expect.anything());
    });

    it('should delete a RETURN_OUT by reversing the OUT effect', async () => {
      ledgerService.findOneByCompany.mockResolvedValue({ id: 'ledger-2', companyId: COMPANY, transactionType: 'RETURN_OUT', direction: 'OUT', itemId: 'item-1', warehouseId: 'wh-1', quantity: 50, uomId: 'uom-kg' });

      const result = await controller.remove('ledger-2', makeReq());

      expect(result.success).toBe(true);
      expect(balanceService.updateBalance).toHaveBeenCalledWith(COMPANY, 'item-1', 'wh-1', null, null, 'uom-kg', 50, 'IN', expect.anything());
      expect(ledgerService.remove).toHaveBeenCalledWith('ledger-2', expect.anything());
    });

    it('should reject deleting a non-receipt/return transaction type', async () => {
      ledgerService.findOneByCompany.mockResolvedValue({ id: 'ledger-3', companyId: COMPANY, transactionType: 'OPENING', direction: 'IN', itemId: 'item-1', warehouseId: 'wh-1', quantity: 100, uomId: 'uom-kg' });

      await expect(controller.remove('ledger-3', makeReq())).rejects.toThrow(BadRequestException);
      expect(ledgerService.remove).not.toHaveBeenCalled();
    });
  });

  describe('receipt documents (photos + attachments)', () => {
    it('uploads a PHOTO document via the raw material service', async () => {
      rawMaterialService.addReceiptDocument.mockResolvedValue({ id: 'doc-1', kind: 'PHOTO' });
      const file = { originalname: 'goods.jpg', mimetype: 'image/jpeg', size: 1234, buffer: Buffer.from('ffd8ffdb', 'hex') };

      const result = await controller.uploadReceiptDocument('rec-1', file, makeReq(), 'PHOTO');

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('doc-1');
      expect(rawMaterialService.addReceiptDocument).toHaveBeenCalledWith(
        COMPANY, 'rec-1', 'PHOTO', file, 'user-1', undefined,
      );
    });

    it('defaults to ATTACHMENT when no kind field is provided', async () => {
      rawMaterialService.addReceiptDocument.mockResolvedValue({ id: 'doc-2', kind: 'ATTACHMENT' });
      const file = { originalname: 'invoice.pdf', mimetype: 'application/pdf', size: 500, buffer: Buffer.from('%PDF', 'ascii') };

      const result = await controller.uploadReceiptDocument('rec-1', file, makeReq());

      expect(rawMaterialService.addReceiptDocument).toHaveBeenCalledWith(COMPANY, 'rec-1', 'ATTACHMENT', file, 'user-1', undefined);
      expect(result.data.kind).toBe('ATTACHMENT');
    });

    it('lists documents scope-scoped to the user company', async () => {
      rawMaterialService.listReceiptDocuments.mockResolvedValue([{ id: 'doc-1', kind: 'PHOTO' }]);

      const result = await controller.listReceiptDocuments('rec-1', makeReq());

      expect(rawMaterialService.listReceiptDocuments).toHaveBeenCalledWith(COMPANY, 'rec-1', undefined);
      expect(result.data).toHaveLength(1);
    });

    it('removes a document through the service (bytes + row)', async () => {
      rawMaterialService.removeReceiptDocument.mockResolvedValue(undefined);

      const result = await controller.removeReceiptDocument('rec-1', 'doc-1', makeReq());

      expect(rawMaterialService.removeReceiptDocument).toHaveBeenCalledWith(COMPANY, 'rec-1', 'doc-1', undefined);
      expect(result.success).toBe(true);
    });
  });

  describe('receipt WhatsApp share', () => {
    it('delegates to the service with company scope and the share payload', async () => {
      const dto = { phone: '923001234567', message: 'RMR-00005 — received qty 10 KG' };
      rawMaterialService.shareReceiptWhatsApp.mockResolvedValue({ enqueued: true, deliveryId: 'del-1' });

      const result = await controller.shareReceiptWhatsApp('rec-1', dto, makeReq());

      expect(rawMaterialService.shareReceiptWhatsApp).toHaveBeenCalledWith(COMPANY, 'rec-1', dto, 'user-1', undefined);
      expect(result.data.enqueued).toBe(true);
      expect(result.data.deliveryId).toBe('del-1');
    });

    it('surfaces an honest enqueued:false signal when the provider is unconfigured', async () => {
      const dto = { phone: '923001234567', message: 'message' };
      rawMaterialService.shareReceiptWhatsApp.mockResolvedValue({ enqueued: false, reason: 'WA_NOT_CONFIGURED' });

      const result = await controller.shareReceiptWhatsApp('rec-1', dto, makeReq());

      expect(result.data.enqueued).toBe(false);
      expect(result.data.reason).toBe('WA_NOT_CONFIGURED');
    });
  });

  describe('receipt inventory view (RMR-01-C)', () => {
    it('delegates to the service with the AUTHENTICATED user company — a client companyId is never trusted', async () => {
      rawMaterialService.getReceiptInventory.mockResolvedValue({
        receiptCode: 'RMR-00020', warehouse: { name: 'SPI Warehouse' }, items: [],
      });

      const req = makeReq();
      const result = await controller.getReceiptInventory('rec-1', req);

      expect(rawMaterialService.getReceiptInventory).toHaveBeenCalledWith(COMPANY, 'rec-1', undefined);
      expect(result.success).toBe(true);
      expect(result.data.receiptCode).toBe('RMR-00020');
    });

    it('propagates NotFound for a receipt that does not exist in the user company', async () => {
      rawMaterialService.getReceiptInventory.mockRejectedValue(new NotFoundException('Receipt not found'));

      await expect(controller.getReceiptInventory('foreign-receipt', makeReq())).rejects.toThrow(NotFoundException);
      expect(rawMaterialService.getReceiptInventory).toHaveBeenCalledWith(COMPANY, 'foreign-receipt', undefined);
    });

    it('fails closed when no company scope can be derived from the authenticated user', async () => {
      const noScopeReq = { erpUser: { id: 'user-1' }, orgScopes: [], allowedDivisionIds: 'ALL' };

      await expect(controller.getReceiptInventory('rec-1', noScopeReq)).rejects.toThrow(BadRequestException);
      expect(rawMaterialService.getReceiptInventory).not.toHaveBeenCalled();
    });
  });

  /**
   * PROMPT #26 — the reported production bug, as a controller-level contract.
   *
   * Before this block the controller had no `DivisionScopeGuard` and forwarded
   * no scope at all, so a DIV-CCD-only user received every division's Gate
   * Passes from the Raw Material Receiving list.
   */
  describe('division scope enforcement (PROMPT #26)', () => {
    it('forwards the SERVER-resolved scope into the receipt list query', async () => {
      rawMaterialService.findAllReceipts.mockResolvedValue({ data: [], total: 0 });

      await controller.listMultiReceipts(makeScopedReq([DIV_CCD]), 1, 20, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);

      expect(rawMaterialService.findAllReceipts).toHaveBeenCalledWith(
        COMPANY,
        expect.objectContaining({ page: 1, limit: 20 }),
        [DIV_CCD],
      );
    });

    it('forwards the scope into the return list query too', async () => {
      rawMaterialService.findAllReturns.mockResolvedValue({ data: [], total: 0 });

      await controller.listMultiReturns(makeScopedReq([DIV_CCD]), 1, 20, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);

      expect(rawMaterialService.findAllReturns).toHaveBeenCalledWith(
        COMPANY,
        expect.objectContaining({ page: 1, limit: 20 }),
        [DIV_CCD],
      );
    });

    it('forwards the scope into the legacy stock-ledger list', async () => {
      ledgerService.findAll = jest.fn().mockResolvedValue({ data: [], total: 0 });

      await controller.findAll(makeScopedReq([DIV_CCD]), 1, 20);

      expect(ledgerService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: COMPANY }),
        [DIV_CCD],
      );
    });

    it('rejects a receipt detail in another division (403) — a leaked UUID must not work', async () => {
      rawMaterialService.findReceiptById = jest.fn().mockRejectedValue(
        new ForbiddenException('You do not have access to this division.'),
      );

      await expect(controller.getMultiReceipt('receipt-in-spd', makeScopedReq([DIV_CCD]))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects a CREATE whose body division is outside the scope', async () => {
      divisionRepo.findOne.mockResolvedValue({ id: 'div-1', status: 'ACTIVE' });

      await expect(
        controller.createMultiReceipt(
          { divisionId: 'div-spd', ...multiReceiptDto() } as any,
          makeScopedReq([DIV_CCD]),
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(rawMaterialService.createReceipt).not.toHaveBeenCalled();
    });

    it('accepts a CREATE inside the scope and forwards it', async () => {
      rawMaterialService.createReceipt.mockResolvedValue({ id: 'rec-1' });

      await controller.createMultiReceipt(
        { divisionId: DIV_CCD, ...multiReceiptDto() } as any,
        makeScopedReq([DIV_CCD]),
      );

      expect(rawMaterialService.createReceipt).toHaveBeenCalledWith(
        COMPANY,
        expect.objectContaining({ divisionId: DIV_CCD }),
        'user-1',
        [DIV_CCD],
      );
    });

    it('refuses to touch a legacy ledger row that belongs to another division', async () => {
      ledgerService.findOneByCompany.mockResolvedValue({
        id: 'ledger-spd', companyId: COMPANY, transactionType: 'RECEIPT', direction: 'IN',
        itemId: 'item-1', warehouseId: 'wh-1', quantity: 100, uomId: 'uom-kg', divisionId: 'div-spd',
      });

      await expect(controller.remove('ledger-spd', makeScopedReq([DIV_CCD]))).rejects.toThrow(ForbiddenException);
      expect(ledgerService.remove).not.toHaveBeenCalled();
    });

    it('treats an empty scope as deny-all rather than as unrestricted', async () => {
      rawMaterialService.findAllReceipts.mockResolvedValue({ data: [], total: 0 });

      await controller.listMultiReceipts(makeScopedReq([]), 1, 20, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);

      // `[]` must reach the service (→ `1 = 0`), NOT `undefined` (→ no filter).
      expect(rawMaterialService.findAllReceipts).toHaveBeenCalledWith(
        COMPANY,
        expect.anything(),
        [],
      );
    });

    it('keeps the reference-data endpoints narrowed to the caller scope', async () => {
      rawMaterialService.getFormReferenceData.mockResolvedValue({ divisions: [] });

      await controller.getGatePassFormData(makeScopedReq([DIV_CCD]));

      expect(rawMaterialService.getFormReferenceData).toHaveBeenCalledWith(COMPANY, [DIV_CCD]);
    });
  });
});