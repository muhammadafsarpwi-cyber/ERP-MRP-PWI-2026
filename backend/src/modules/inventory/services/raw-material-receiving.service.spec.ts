import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RawMaterialReceivingService } from './raw-material-receiving.service';

const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
const RECEIPT_ID = 'rec-1';

const makeRepo = (overrides: Record<string, jest.Mock> = {}) => {
  const repo: any = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((x: any) => x),
    save: jest.fn((x: any) => x),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return repo;
};

const tmpRoot = path.join(os.tmpdir(), `rmr-b-doc-test-${Date.now()}`);

const buildService = () => {
  const receiptRepo = makeRepo();
  const docRepo = makeRepo();
  const settingRepo = makeRepo();
  const deliveryRepo = makeRepo();
  const configService = { get: jest.fn((_key: string, def: string) => tmpRoot) } as unknown as ConfigService;

  receiptRepo.findOne.mockImplementation(async ({ where }: any) => (where?.id === RECEIPT_ID && where?.companyId === COMPANY ? { id: RECEIPT_ID, companyId: COMPANY, receiptCode: 'RMR-00001' } : null));

  const service = new RawMaterialReceivingService(
    receiptRepo, makeRepo(), docRepo, makeRepo(), makeRepo(),
    makeRepo(), makeRepo(), makeRepo(), makeRepo(), makeRepo(), makeRepo(), makeRepo(),
    settingRepo, deliveryRepo,
    {} as any, {} as any,
    configService,
  );
  return { service, receiptRepo, docRepo, settingRepo, deliveryRepo };
};

describe('RawMaterialReceivingService — receipt documents (RMR-01-B)', () => {
  afterAll(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const pdfBuffer = Buffer.from('%PDF-1.7 fake bytes');
  const zipBuffer = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(32)]);

  describe('validateReceiptFile via addReceiptDocument', () => {
    it('accepts a valid JPEG photo, writes bytes, and persists a PHOTO metadata row', async () => {
      const { service, docRepo } = buildService();
      docRepo.save.mockImplementation(async (row: any) => ({ id: 'doc-1', ...row }));

      const doc = await service.addReceiptDocument(COMPANY, RECEIPT_ID, 'PHOTO', {
        originalname: 'goods.jpg', mimetype: 'image/jpeg', size: 8, buffer: jpegBuffer,
      }, 'user-1');

      expect(doc).toMatchObject({ id: 'doc-1', kind: 'PHOTO', mimeType: 'image/jpeg', fileName: 'goods.jpg', createdBy: 'user-1' });
      expect(doc.fileUrl).toMatch(new RegExp(`^/uploads/receipts/${COMPANY}/${RECEIPT_ID}/[0-9a-f-]+\\.jpg$`));
      const diskPath = path.join(tmpRoot, doc.fileUrl.replace('/uploads/', ''));
      expect(fs.existsSync(diskPath)).toBe(true);
    });

    it('rejects a photo whose declared MIME is not in the image allow-list', async () => {
      const { service } = buildService();
      await expect(service.addReceiptDocument(COMPANY, RECEIPT_ID, 'PHOTO', {
        originalname: 'x.gif', mimetype: 'image/gif', size: 5, buffer: Buffer.alloc(5),
      })).rejects.toThrow(BadRequestException);
    });

    it('rejects a photo whose bytes do not match its MIME (magic bytes)', async () => {
      const { service } = buildService();
      await expect(service.addReceiptDocument(COMPANY, RECEIPT_ID, 'PHOTO', {
        originalname: 'fake.jpg', mimetype: 'image/jpeg', size: 3, buffer: Buffer.from('abc'),
      })).rejects.toThrow(BadRequestException);
    });

    it('rejects a photo larger than 5 MB', async () => {
      const { service } = buildService();
      await expect(service.addReceiptDocument(COMPANY, RECEIPT_ID, 'PHOTO', {
        originalname: 'big.jpg', mimetype: 'image/jpeg', size: 5 * 1024 * 1024 + 1, buffer: jpegBuffer,
      })).rejects.toThrow(BadRequestException);
    });

    it('rejects executables and non-document attachment extensions', async () => {
      const { service } = buildService();
      await expect(service.addReceiptDocument(COMPANY, RECEIPT_ID, 'ATTACHMENT', {
        originalname: 'setup.exe', mimetype: 'application/x-msdownload', size: 3, buffer: Buffer.alloc(3),
      })).rejects.toThrow(BadRequestException);
      await expect(service.addReceiptDocument(COMPANY, RECEIPT_ID, 'ATTACHMENT', {
        originalname: 'notes.md', mimetype: 'text/plain', size: 3, buffer: Buffer.alloc(3),
      })).rejects.toThrow(BadRequestException);
    });

    it('accepts a valid PDF attachment and rejects a mismatched PDF payload', async () => {
      const { service, docRepo } = buildService();
      docRepo.save.mockImplementation(async (row: any) => ({ id: 'doc-2', ...row }));
      const ok = await service.addReceiptDocument(COMPANY, RECEIPT_ID, 'ATTACHMENT', {
        originalname: 'invoice.pdf', mimetype: 'application/pdf', size: 20, buffer: pdfBuffer,
      });
      expect(ok.kind).toBe('ATTACHMENT');
      expect(ok.fileUrl).toContain('.pdf');

      await expect(service.addReceiptDocument(COMPANY, RECEIPT_ID, 'ATTACHMENT', {
        originalname: 'invoice.pdf', mimetype: 'application/pdf', size: 5, buffer: Buffer.from('nope no sig'),
      })).rejects.toThrow(BadRequestException);
    });

    it('accepts docx/xlsx/pptx via the ZIP (OOXML) magic bytes', async () => {
      const { service, docRepo } = buildService();
      docRepo.save.mockImplementation(async (row: any) => ({ id: 'doc-3', ...row }));
      const ok = await service.addReceiptDocument(COMPANY, RECEIPT_ID, 'ATTACHMENT', {
        originalname: 'listing.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 36, buffer: zipBuffer,
      });
      expect(ok.fileUrl).toContain('.xlsx');
    });

    it('throws NotFound when the receipt is not in the company scope', async () => {
      const { service } = buildService();
      await expect(service.addReceiptDocument(COMPANY, 'other-receipt', 'PHOTO', {
        originalname: 'goods.jpg', mimetype: 'image/jpeg', size: 8, buffer: jpegBuffer,
      })).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeReceiptDocument', () => {
    it('deletes the metadata row, scoped to company + receipt', async () => {
      const { service, receiptRepo, docRepo } = buildService();
      docRepo.findOne.mockResolvedValue({ id: 'doc-1', receiptId: RECEIPT_ID, companyId: COMPANY, fileUrl: `/uploads/receipts/${COMPANY}/${RECEIPT_ID}/abc.jpg` });

      await service.removeReceiptDocument(COMPANY, RECEIPT_ID, 'doc-1');

      expect(docRepo.delete).toHaveBeenCalledWith({ id: 'doc-1' });
    });

    it('throws NotFound when the document is not scoped to this company', async () => {
      const { service, docRepo } = buildService();
      docRepo.findOne.mockResolvedValue(null);
      await expect(service.removeReceiptDocument(COMPANY, RECEIPT_ID, 'doc-1')).rejects.toThrow(NotFoundException);
      expect(docRepo.delete).not.toHaveBeenCalled();
    });
  });

  describe('listReceiptDocuments', () => {
    it('lists only documents belonging to the receipt within the company scope', async () => {
      const { service, docRepo } = buildService();
      const docs = [{ id: 'doc-1', kind: 'PHOTO' }, { id: 'doc-2', kind: 'ATTACHMENT' }];
      docRepo.find.mockResolvedValue(docs);

      const result = await service.listReceiptDocuments(COMPANY, RECEIPT_ID);

      expect(result).toHaveLength(2);
      expect(docRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: COMPANY, receiptId: RECEIPT_ID } }));
    });

    it('throws NotFound when the receipt is not in this company scope', async () => {
      const { service } = buildService();
      await expect(service.listReceiptDocuments(COMPANY, 'other-receipt')).rejects.toThrow(NotFoundException);
    });
  });

  describe('shareReceiptWhatsApp', () => {
    it('enqueues a real QUEUED delivery when a WhatsApp setting is configured + enabled', async () => {
      const { service, settingRepo, deliveryRepo } = buildService();
      settingRepo.findOne.mockResolvedValue({ id: 'wa-set', settingType: 'WHATSAPP', enabled: true, isActive: true });
      deliveryRepo.create.mockImplementation((x: any) => x);
      deliveryRepo.save.mockImplementation(async (x: any) => ({ id: 'del-1', ...x }));

      const result = await service.shareReceiptWhatsApp(COMPANY, RECEIPT_ID, { phone: '923001234567', message: 'RMR message' }, 'user-1');

      expect(result.enqueued).toBe(true);
      expect(result.deliveryId).toBe('del-1');
      expect(deliveryRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        companyId: COMPANY,
        channel: 'WHATSAPP',
        status: 'QUEUED',
        recipientType: 'PHONE',
        recipientAddress: '923001234567',
        renderedBody: 'RMR message',
      }));
    });

    it('returns an honest WA_NOT_CONFIGURED signal when no provider is enabled', async () => {
      const { service, settingRepo, deliveryRepo } = buildService();
      settingRepo.findOne.mockResolvedValue(null);

      const result = await service.shareReceiptWhatsApp(COMPANY, RECEIPT_ID, { phone: '923001234567', message: 'hi' });

      expect(result).toEqual({ enqueued: false, reason: 'WA_NOT_CONFIGURED' });
      expect(deliveryRepo.save).not.toHaveBeenCalled();
    });

    it('throws NotFound when the receipt is not in this company scope', async () => {
      const { service, deliveryRepo } = buildService();
      await expect(service.shareReceiptWhatsApp(COMPANY, 'other-receipt', { phone: '923001234567', message: 'hi' }))
        .rejects.toThrow(NotFoundException);
      expect(deliveryRepo.save).not.toHaveBeenCalled();
    });
  });
});

describe('RawMaterialReceivingService — getReceiptInventory (RMR-01-C)', () => {
  const WH = 'wh-spi';

  const build = () => {
    const receiptRepo = makeRepo();
    const receiptLineRepo = makeRepo();
    const ledgerRepo = makeRepo();
    const balanceService: any = { findBalancesForItemWarehousePairs: jest.fn() };
    const configService = { get: jest.fn((_key: string, def: string) => tmpRoot) } as unknown as ConfigService;
    const service = new RawMaterialReceivingService(
      receiptRepo, receiptLineRepo, makeRepo(), makeRepo(), makeRepo(),
      ledgerRepo, makeRepo(), makeRepo(), makeRepo(), makeRepo(), makeRepo(), makeRepo(),
      makeRepo(), makeRepo(),
      {} as any, balanceService,
      configService,
    );
    return { service, receiptRepo, receiptLineRepo, ledgerRepo, balanceService };
  };

  const header = (over: Record<string, any> = {}) => ({
    id: RECEIPT_ID, companyId: COMPANY, receiptCode: 'RMR-00020', receiptDate: '2026-09-15',
    status: 'CONFIRMED', warehouseId: WH,
    warehouse: { id: WH, name: 'SPI Warehouse', warehouseCode: 'SPI002ST', warehouseType: 'RAW_MATERIAL' },
    ...over,
  });

  const line = (n: number, id: string, code: string, name: string, recv: number, gp: number) => ({
    id: `l-${n}`, lineNumber: n, itemId: id, uomId: 'uom-kg',
    item: { id, itemCode: code, name },
    uom: { id: 'uom-kg', code: 'KG', name: 'Kilogram', symbol: 'kg' },
    receivedQuantity: recv, gatePassQuantity: gp, difference: gp - recv, remarks: null,
  });

  const bal = (itemId: string, onHand: number, reserved: number) => ({
    itemId, warehouseId: WH, onHand, reserved, available: onHand - reserved,
    uom: { id: 'uom-kg', code: 'KG', symbol: 'kg' }, updatedAt: new Date('2026-09-15T10:00:00Z'),
  });

  it('single item: merges receipt line with the REAL on-hand/reserved/available balance', async () => {
    const { service, receiptRepo, receiptLineRepo, balanceService } = build();
    receiptRepo.findOne.mockResolvedValue(header());
    receiptLineRepo.find.mockResolvedValue([line(1, 'item-a', 'RM-WIRE-010', 'Steel Wire Coil 3.45mm SR', 3371.2, 3371.2)]);
    balanceService.findBalancesForItemWarehousePairs.mockResolvedValue([bal('item-a', 12845.7, 0)]);

    const result = await service.getReceiptInventory(COMPANY, RECEIPT_ID);

    expect(result.receiptCode).toBe('RMR-00020');
    expect(result.warehouse?.name).toBe('SPI Warehouse');
    expect(result.items).toHaveLength(1);
    const row = result.items[0];
    expect(row.item!.itemCode).toBe('RM-WIRE-010');
    expect(row.item!.name).toBe('Steel Wire Coil 3.45mm SR');
    expect(row.receivedQuantity).toBe(3371.2);
    expect(row.balance.exists).toBe(true);
    expect(row.balance.onHand).toBe(12845.7);
    expect(row.balance.reserved).toBe(0);
    expect(row.balance.available).toBe(12845.7);
  });

  it('multi item: returns EVERY receipt line as its own row — items are never merged', async () => {
    const { service, receiptRepo, receiptLineRepo, balanceService } = build();
    receiptRepo.findOne.mockResolvedValue(header());
    const lines = [
      line(1, 'item-a', 'RM-WIRE-010', 'Wire A', 100, 110),
      line(2, 'item-b', 'RM-WIRE-011', 'Wire B', 200, 220),
      line(3, 'item-c', 'RM-WIRE-012', 'Wire C', 300, 330),
      line(4, 'item-d', 'RM-WIRE-013', 'Wire D', 400, 440),
    ];
    receiptLineRepo.find.mockResolvedValue(lines);
    balanceService.findBalancesForItemWarehousePairs.mockResolvedValue(lines.map((l) => bal(l.itemId!, 500, 0)));

    const result = await service.getReceiptInventory(COMPANY, RECEIPT_ID);

    expect(result.items).toHaveLength(4);
    lines.forEach((l, i) => {
      expect(result.items[i].item!.itemCode).toBe(l.item!.itemCode);
      expect(result.items[i].receivedQuantity).toBe(l.receivedQuantity);
      expect(result.items[i].balance!.onHand).toBe(500);
    });
    // ONE bulk balance query for all four distinct pairs — no N+1
    expect(balanceService.findBalancesForItemWarehousePairs).toHaveBeenCalledTimes(1);
    expect(balanceService.findBalancesForItemWarehousePairs).toHaveBeenCalledWith(COMPANY, [
      { itemId: 'item-a', warehouseId: WH },
      { itemId: 'item-b', warehouseId: WH },
      { itemId: 'item-c', warehouseId: WH },
      { itemId: 'item-d', warehouseId: WH },
    ]);
  });

  it('duplicate item lines are preserved but the balance query dedupes the pair once', async () => {
    const { service, receiptRepo, receiptLineRepo, balanceService } = build();
    receiptRepo.findOne.mockResolvedValue(header());
    receiptLineRepo.find.mockResolvedValue([line(1, 'item-a', 'RM-WIRE-010', 'Wire A', 50, 50), line(2, 'item-a', 'RM-WIRE-010', 'Wire A', 25, 25)]);
    balanceService.findBalancesForItemWarehousePairs.mockResolvedValue([bal('item-a', 999, 0)]);

    const result = await service.getReceiptInventory(COMPANY, RECEIPT_ID);

    expect(result.items).toHaveLength(2);
    expect(balanceService.findBalancesForItemWarehousePairs).toHaveBeenCalledTimes(1);
    expect(balanceService.findBalancesForItemWarehousePairs).toHaveBeenCalledWith(COMPANY, [{ itemId: 'item-a', warehouseId: WH }]);
  });

  it('zero stock: an existing balance of 0 is honest data, not an error', async () => {
    const { service, receiptRepo, receiptLineRepo, balanceService } = build();
    receiptRepo.findOne.mockResolvedValue(header());
    receiptLineRepo.find.mockResolvedValue([line(1, 'item-a', 'RM-WIRE-010', 'Wire A', 10, 10)]);
    balanceService.findBalancesForItemWarehousePairs.mockResolvedValue([bal('item-a', 0, 0)]);

    const result = await service.getReceiptInventory(COMPANY, RECEIPT_ID);

    expect(result.items[0].balance).toEqual(expect.objectContaining({ exists: true, onHand: 0, reserved: 0, available: 0 }));
  });

  it('missing balance: no record → exists:false with null quantities (nothing fabricated)', async () => {
    const { service, receiptRepo, receiptLineRepo, balanceService } = build();
    receiptRepo.findOne.mockResolvedValue(header());
    receiptLineRepo.find.mockResolvedValue([line(1, 'item-a', 'RM-WIRE-010', 'Wire A', 10, 10)]);
    balanceService.findBalancesForItemWarehousePairs.mockResolvedValue([]);

    const result = await service.getReceiptInventory(COMPANY, RECEIPT_ID);

    expect(result.items[0].balance.exists).toBe(false);
    expect(result.items[0].balance.onHand).toBeNull();
    expect(result.items[0].balance.available).toBeNull();
  });

  it('company isolation: a receipt outside the user company is never resolved and balances are never queried', async () => {
    const { service, receiptRepo, balanceService } = build();
    receiptRepo.findOne.mockResolvedValue(null);

    await expect(service.getReceiptInventory(COMPANY, 'foreign-receipt')).rejects.toThrow(NotFoundException);
    expect(balanceService.findBalancesForItemWarehousePairs).not.toHaveBeenCalled();
  });

  it('READ-ONLY: the view never posts ledger or mutates balances', async () => {
    const { service, receiptRepo, receiptLineRepo, ledgerRepo, balanceService } = build();
    receiptRepo.findOne.mockResolvedValue(header());
    receiptLineRepo.find.mockResolvedValue([line(1, 'item-a', 'RM-WIRE-010', 'Wire A', 10, 10)]);
    balanceService.findBalancesForItemWarehousePairs.mockResolvedValue([bal('item-a', 100, 0)]);

    await service.getReceiptInventory(COMPANY, RECEIPT_ID);

    expect(balanceService.findBalancesForItemWarehousePairs).toHaveBeenCalledTimes(1);
    expect(ledgerRepo.save).not.toHaveBeenCalled();
    expect(ledgerRepo.delete).not.toHaveBeenCalled();
    expect(receiptRepo.save).not.toHaveBeenCalled();
    expect(receiptLineRepo.save).not.toHaveBeenCalled();
  });
});