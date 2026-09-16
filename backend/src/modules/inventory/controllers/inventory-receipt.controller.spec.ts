import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';

const makeReq = () => ({ erpUser: { id: 'user-1', defaultCompanyId: COMPANY }, orgScopes: [{ companyId: COMPANY }] });

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
      createReturn: jest.fn(),
      findAllReturns: jest.fn(),
      getReport: jest.fn(),
      addReceiptDocument: jest.fn(),
      listReceiptDocuments: jest.fn(),
      removeReceiptDocument: jest.fn(),
      shareReceiptWhatsApp: jest.fn(),
      getReceiptInventory: jest.fn(),
    };
    ledgerService = { create: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
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
      ],
    })
      .overrideGuard(SupabaseJwtGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(OrgScopeGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(PermissionGuard)
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
        COMPANY, 'rec-1', 'PHOTO', file, 'user-1',
      );
    });

    it('defaults to ATTACHMENT when no kind field is provided', async () => {
      rawMaterialService.addReceiptDocument.mockResolvedValue({ id: 'doc-2', kind: 'ATTACHMENT' });
      const file = { originalname: 'invoice.pdf', mimetype: 'application/pdf', size: 500, buffer: Buffer.from('%PDF', 'ascii') };

      const result = await controller.uploadReceiptDocument('rec-1', file, makeReq());

      expect(rawMaterialService.addReceiptDocument).toHaveBeenCalledWith(COMPANY, 'rec-1', 'ATTACHMENT', file, 'user-1');
      expect(result.data.kind).toBe('ATTACHMENT');
    });

    it('lists documents scope-scoped to the user company', async () => {
      rawMaterialService.listReceiptDocuments.mockResolvedValue([{ id: 'doc-1', kind: 'PHOTO' }]);

      const result = await controller.listReceiptDocuments('rec-1', makeReq());

      expect(rawMaterialService.listReceiptDocuments).toHaveBeenCalledWith(COMPANY, 'rec-1');
      expect(result.data).toHaveLength(1);
    });

    it('removes a document through the service (bytes + row)', async () => {
      rawMaterialService.removeReceiptDocument.mockResolvedValue(undefined);

      const result = await controller.removeReceiptDocument('rec-1', 'doc-1', makeReq());

      expect(rawMaterialService.removeReceiptDocument).toHaveBeenCalledWith(COMPANY, 'rec-1', 'doc-1');
      expect(result.success).toBe(true);
    });
  });

  describe('receipt WhatsApp share', () => {
    it('delegates to the service with company scope and the share payload', async () => {
      const dto = { phone: '923001234567', message: 'RMR-00005 — received qty 10 KG' };
      rawMaterialService.shareReceiptWhatsApp.mockResolvedValue({ enqueued: true, deliveryId: 'del-1' });

      const result = await controller.shareReceiptWhatsApp('rec-1', dto, makeReq());

      expect(rawMaterialService.shareReceiptWhatsApp).toHaveBeenCalledWith(COMPANY, 'rec-1', dto, 'user-1');
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

      expect(rawMaterialService.getReceiptInventory).toHaveBeenCalledWith(COMPANY, 'rec-1');
      expect(result.success).toBe(true);
      expect(result.data.receiptCode).toBe('RMR-00020');
    });

    it('propagates NotFound for a receipt that does not exist in the user company', async () => {
      rawMaterialService.getReceiptInventory.mockRejectedValue(new NotFoundException('Receipt not found'));

      await expect(controller.getReceiptInventory('foreign-receipt', makeReq())).rejects.toThrow(NotFoundException);
      expect(rawMaterialService.getReceiptInventory).toHaveBeenCalledWith(COMPANY, 'foreign-receipt');
    });

    it('fails closed when no company scope can be derived from the authenticated user', async () => {
      const noScopeReq = { erpUser: { id: 'user-1' }, orgScopes: [] };

      await expect(controller.getReceiptInventory('rec-1', noScopeReq)).rejects.toThrow(BadRequestException);
      expect(rawMaterialService.getReceiptInventory).not.toHaveBeenCalled();
    });
  });
});