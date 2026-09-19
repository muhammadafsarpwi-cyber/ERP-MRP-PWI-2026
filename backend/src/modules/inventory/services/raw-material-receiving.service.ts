import {
  Injectable, BadRequestException, NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository, EntityManager } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  RawMaterialReceipt, RawMaterialReceiptLine,
  RawMaterialReturn, RawMaterialReturnLine,
  RawMaterialReceiptDocument, RawMaterialReturnDocument,
  InventoryBalance,
} from '../entities';
import { StockLedger } from '../entities';
import { Item, ItemType } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { Division, Section, Department } from '../../organization/entities';
import { NotificationDelivery } from '../../notification/entities/notification-delivery.entity';
import { CommunicationSetting } from '../../notification/entities/communication-setting.entity';
import { StockLedgerService } from './stock-ledger.service';
import { InventoryBalanceService } from './inventory-balance.service';
import {
  CreateRawMaterialReceiptDto, CreateRawMaterialReturnDto,
  UpdateRawMaterialReceiptDto, UpdateRawMaterialReturnDto,
  RawMaterialReceivingReportQuery, WhatsAppReceiptShareDto,
} from '../dto/raw-material-receiving.dto';

interface LineArg {
  itemId: string;
  uomId: string;
  gatePassQuantity?: number;
  receivedQuantity?: number;
  quantity?: number;
  remarks?: string;
}

@Injectable()
export class RawMaterialReceivingService {
  private static readonly PHOTO_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
  private static readonly PHOTO_MAX_BYTES = 5 * 1024 * 1024;
  private static readonly ATTACH_EXT_ALLOW = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv']);
  private static readonly BLOCKED_EXT = new Set(['exe', 'bat', 'cmd', 'com', 'sh', 'ps1', 'js', 'jar', 'dll', 'msi', 'scr', 'vbs', 'wsf', 'apk', 'bin', 'iso', 'svg', 'html', 'htm']);
  private static readonly ATTACH_MIME_RE = /^(application\/pdf|application\/msword|application\/vnd\.ms-excel|application\/vnd\.ms-powerpoint|application\/vnd\.openxmlformats-officedocument\.[a-z0-9.]+|text\/plain|text\/csv|application\/csv)$/;
  private static readonly MAGIC: Array<{ check: string; test: (buf: Buffer) => boolean }> = [
    { check: 'pdf', test: (b) => b.length >= 4 && b.slice(0, 4).toString() === '%PDF' },
    { check: 'image/jpeg', test: (b) => b.length > 2 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { check: 'image/png', test: (b) => b.length > 8 && b[0] === 0x89 && b.slice(1, 4).toString() === 'PNG' },
    { check: 'image/webp', test: (b) => b.length > 12 && b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' },
    { check: 'ole', test: (b) => b.length >= 8 && b.slice(0, 8).toString('hex') === 'd0cf11e0a1b11ae1' },
    { check: 'zip', test: (b) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
    { check: 'text', test: (b) => {
      const len = Math.min(b.length, 512);
      for (let i = 0; i < len; i += 1) if (b[i] === 0) return false;
      return len > 0;
    } },
  ];

  private readonly storagePath: string;

  constructor(
    @InjectRepository(RawMaterialReceipt)
    private readonly receiptRepo: Repository<RawMaterialReceipt>,
    @InjectRepository(RawMaterialReceiptLine)
    private readonly receiptLineRepo: Repository<RawMaterialReceiptLine>,
    @InjectRepository(RawMaterialReceiptDocument)
    private readonly docRepo: Repository<RawMaterialReceiptDocument>,
    @InjectRepository(RawMaterialReturn)
    private readonly returnRepo: Repository<RawMaterialReturn>,
    @InjectRepository(RawMaterialReturnLine)
    private readonly returnLineRepo: Repository<RawMaterialReturnLine>,
    @InjectRepository(RawMaterialReturnDocument)
    private readonly returnDocRepo: Repository<RawMaterialReturnDocument>,
    @InjectRepository(StockLedger)
    private readonly ledgerRepo: Repository<StockLedger>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Uom)
    private readonly uomRepo: Repository<Uom>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(CommunicationSetting)
    private readonly settingRepo: Repository<CommunicationSetting>,
    @InjectRepository(NotificationDelivery)
    private readonly deliveryRepo: Repository<NotificationDelivery>,
    private readonly ledgerService: StockLedgerService,
    private readonly balanceService: InventoryBalanceService,
    configService: ConfigService,
  ) {
    this.storagePath = path.resolve(configService.get<string>('STORAGE_PATH', './storage'));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Validators
  // ─────────────────────────────────────────────────────────────────────────

  private async validateOrg(
    companyId: string,
    divisionId: string,
    sectionId: string,
    departmentId: string,
  ): Promise<void> {
    const division = await this.divisionRepo.findOne({ where: { id: divisionId, companyId } });
    if (!division) throw new NotFoundException(`Division '${divisionId}' not found in this company.`);
    if (division.status !== 'ACTIVE') throw new BadRequestException('Division is not ACTIVE.');

    const section = await this.sectionRepo.findOne({ where: { id: sectionId } });
    if (!section) throw new NotFoundException(`Section '${sectionId}' not found.`);
    if (section.divisionId !== divisionId) {
      throw new BadRequestException(`Section does not belong to the selected Division.`);
    }

    const department = await this.departmentRepo.findOne({ where: { id: departmentId } });
    if (!department) throw new NotFoundException(`Department '${departmentId}' not found.`);
    if (department.sectionId && department.sectionId !== sectionId) {
      throw new BadRequestException(`Department does not belong to the selected Section.`);
    }
    if (department.divisionId && department.divisionId !== divisionId) {
      throw new BadRequestException(`Department does not belong to the selected Division.`);
    }
  }

  private async validateWarehouse(warehouseId: string, companyId: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepo.findOne({ where: { id: warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException(`Warehouse '${warehouseId}' not found in this company.`);
    if (warehouse.status !== 'ACTIVE') throw new BadRequestException('Warehouse is not ACTIVE.');
    return warehouse;
  }

  private async validateItem(companyId: string, itemId: string): Promise<Item> {
    const item = await this.itemRepo.findOne({ where: { id: itemId, companyId } });
    if (!item) throw new NotFoundException(`Item '${itemId}' not found in this company.`);
    if (item.status !== 'ACTIVE') throw new BadRequestException(`Item '${item.itemCode}' is not ACTIVE.`);
    if (item.itemType !== 'RAW_MATERIAL') {
      throw new BadRequestException(
        `Item '${item.itemCode}' is classified as ${item.itemType} and is not a Raw Material. Only RAW MATERIAL items can be received or returned.`,
      );
    }
    return item;
  }

  private async validateLines(
    companyId: string,
    lines: LineArg[],
    opts: { checkRawMaterial: boolean; divisionId?: string; sectionId?: string; departmentId?: string },
  ): Promise<void> {
    const uomCache = new Map<string, Uom>();
    for (const line of lines) {
      const item = await this.validateItem(companyId, line.itemId);
      if (opts.checkRawMaterial && item.itemType !== 'RAW_MATERIAL') {
        throw new BadRequestException(`Item '${item.itemCode}' is not a Raw Material.`);
      }
      if (opts.divisionId && item.divisionId && item.divisionId !== opts.divisionId) {
        throw new BadRequestException(`Item '${item.itemCode}' does not belong to the selected Division.`);
      }
      if (opts.sectionId && item.sectionId && item.sectionId !== opts.sectionId) {
        throw new BadRequestException(`Item '${item.itemCode}' does not belong to the selected Section.`);
      }
      if (opts.departmentId && item.departmentId && item.departmentId !== opts.departmentId) {
        throw new BadRequestException(`Item '${item.itemCode}' does not belong to the selected Department.`);
      }
      if (!uomCache.has(line.uomId)) {
        const uom = await this.uomRepo.findOne({ where: { id: line.uomId } });
        if (!uom) throw new NotFoundException(`UOM '${line.uomId}' not found.`);
        uomCache.set(line.uomId, uom);
      }
    }
  }

  private async checkReturnAvailability(
    companyId: string,
    warehouseId: string,
    lines: LineArg[],
  ): Promise<void> {
    for (const line of lines) {
      const quantity = Number(line.quantity || 0);
      if (quantity <= 0) continue;
      const available = await this.balanceService.getAvailableStock(
        companyId, line.itemId, warehouseId, undefined, undefined,
      );
      if (quantity > available) {
        const item = await this.itemRepo.findOne({ where: { id: line.itemId } });
        throw new BadRequestException(
          `Insufficient available stock for '${item?.itemCode ?? line.itemId}' in the selected warehouse. Available: ${available}, requested: ${quantity}.`,
        );
      }
    }
  }

  private async nextCode(kind: 'receipt' | 'return', manager: EntityManager): Promise<string> {
    const seq = kind === 'receipt' ? 'raw_material_receipt_seq' : 'raw_material_return_seq';
    const prefix = kind === 'receipt' ? 'RMR-' : 'RMTN-';
    const result = await manager.query(`SELECT nextval('${seq}') AS n`);
    const n = Number(result[0]?.n || 0);
    return `${prefix}${String(n).padStart(5, '0')}`;
  }

  private dedupeItems(items: { itemId: string; uomId: string }[]): void {
    const seen = new Set<string>();
    for (const it of items) {
      const key = `${it.itemId}::${it.uomId}`;
      if (seen.has(key)) {
        throw new BadRequestException(`Duplicate item line: an item can only appear once per document.`);
      }
      seen.add(key);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Receipt documents (photos + attachments) — validation & local-FS storage
  // ─────────────────────────────────────────────────────────────────────────

  private validateReceiptFile(file: any, kind: 'PHOTO' | 'ATTACHMENT'): { buffer: Buffer; mime: string; ext: string } {
    if (!file || !file.buffer || !file.originalname) {
      throw new BadRequestException('No file uploaded.');
    }
    const originalName = String(file.originalname);
    const ext = path.extname(originalName).slice(1).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const size = Number(file.size) || Buffer.byteLength(file.buffer);

    if (kind === 'PHOTO') {
      if (!RawMaterialReceivingService.PHOTO_MIMES.includes(mime)) {
        throw new BadRequestException('Photo must be a JPEG, PNG or WebP image.');
      }
      if (size > RawMaterialReceivingService.PHOTO_MAX_BYTES) {
        throw new BadRequestException('Photo exceeds the 5 MB limit.');
      }
      const ok = RawMaterialReceivingService.MAGIC.some((m) => m.check === mime && m.test(file.buffer));
      if (!ok) throw new BadRequestException('Photo content does not match its file type.');
      const extMap: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
      return { buffer: file.buffer, mime, ext: extMap[mime] || 'jpg' };
    }

    // ATTACHMENT — safe document allow-list + executable(s) blocked.
    if (RawMaterialReceivingService.BLOCKED_EXT.has(ext)) {
      throw new BadRequestException(`File type '.${ext}' is not allowed.`);
    }
    if (!RawMaterialReceivingService.ATTACH_EXT_ALLOW.has(ext)) {
      throw new BadRequestException(
        `File extension '.${ext}' is not in the allowed list (pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv).`,
      );
    }
    if (!RawMaterialReceivingService.ATTACH_MIME_RE.test(mime)) {
      throw new BadRequestException(`File type '${mime || 'unknown'}' is not an allowed document type.`);
    }
    if (size > Number(process.env.STORAGE_MAX_SIZE || 10 * 1024 * 1024)) {
      throw new BadRequestException('Attachment exceeds the 10 MB limit.');
    }

    const byExt: Record<string, string[]> = {
      pdf: ['pdf'], doc: ['ole'], xls: ['ole'], ppt: ['ole'],
      docx: ['zip'], xlsx: ['zip'], pptx: ['zip'], txt: ['text'], csv: ['text'],
    };
    const checks = byExt[ext] || [];
    const ok = checks.some((c) => RawMaterialReceivingService.MAGIC.some((m) => m.check === c && m.test(file.buffer)));
    if (!ok) throw new BadRequestException('File content does not match its declared type.');

    return { buffer: file.buffer, mime, ext };
  }

  private deleteReceiptFile(fileUrl: string): void {
    if (!fileUrl || !fileUrl.startsWith('/uploads/receipts/')) return;
    const relativePath = fileUrl.replace('/uploads/', '');
    const filePath = path.join(this.storagePath, relativePath);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // non-fatal: file may have been deleted already
    }
  }

  async addReceiptDocument(
    companyId: string,
    receiptId: string,
    kind: 'PHOTO' | 'ATTACHMENT',
    file: any,
    userId?: string,
  ) {
    const receipt = await this.receiptRepo.findOne({ where: { id: receiptId, companyId } });
    if (!receipt) throw new NotFoundException(`Receipt '${receiptId}' not found in this company.`);

    const normKind = kind === 'PHOTO' ? 'PHOTO' : 'ATTACHMENT';
    const { buffer, mime, ext } = this.validateReceiptFile(file, normKind);

    const dir = path.join(this.storagePath, 'receipts', companyId, receiptId);
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(dir, fileName);
    let written = false;
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, buffer);
      written = true;
      const doc = await this.docRepo.save(this.docRepo.create({
        companyId,
        receiptId,
        kind: normKind,
        fileName: String(file.originalname).slice(0, 255),
        fileUrl: `/uploads/receipts/${companyId}/${receiptId}/${fileName}`,
        mimeType: mime,
        fileSize: Buffer.byteLength(buffer),
        createdBy: userId ?? null,
      }));
      return doc;
    } catch (error) {
      if (written && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
      throw error;
    }
  }

  async listReceiptDocuments(companyId: string, receiptId: string) {
    const receipt = await this.receiptRepo.findOne({ where: { id: receiptId, companyId } });
    if (!receipt) throw new NotFoundException(`Receipt '${receiptId}' not found in this company.`);
    const docs = await this.docRepo.find({
      where: { receiptId, companyId },
      order: { uploadedAt: 'ASC' },
    });
    return docs.map((d) => ({
      id: d.id,
      kind: d.kind,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      mimeType: d.mimeType,
      fileSize: d.fileSize,
      uploadedAt: d.uploadedAt,
    }));
  }

  async removeReceiptDocument(companyId: string, receiptId: string, docId: string): Promise<void> {
    const doc = await this.docRepo.findOne({ where: { id: docId, receiptId, companyId } });
    if (!doc) throw new NotFoundException(`Document '${docId}' not found in this company.`);
    await this.docRepo.delete({ id: docId });
    this.deleteReceiptFile(doc.fileUrl);
  }

  async shareReceiptWhatsApp(companyId: string, receiptId: string, dto: WhatsAppReceiptShareDto, userId?: string) {
    const receipt = await this.receiptRepo.findOne({ where: { id: receiptId, companyId } });
    if (!receipt) throw new NotFoundException(`Receipt '${receiptId}' not found in this company.`);

    const setting = await this.settingRepo.findOne({
      where: { settingType: 'WHATSAPP', enabled: true, isActive: true, companyId },
    } as any);
    if (!setting) {
      return { enqueued: false, reason: 'WA_NOT_CONFIGURED' };
    }

    const delivery = await this.deliveryRepo.save(this.deliveryRepo.create({
      companyId,
      channel: 'WHATSAPP',
      recipientType: 'PHONE',
      recipientAddress: dto.phone,
      renderedSubject: null,
      renderedBody: dto.message,
      templateCode: 'RMR_RECEIPT_SHARE',
      status: 'QUEUED',
      maxRetries: 3,
      createdBy: userId ?? null,
    }));
    return { enqueued: true, deliveryId: delivery.id };
  }

  private deleteReturnFile(fileUrl: string): void {
    if (!fileUrl || !fileUrl.startsWith('/uploads/returns/')) return;
    const relativePath = fileUrl.replace('/uploads/', '');
    const filePath = path.join(this.storagePath, relativePath);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // non-fatal: file may have been deleted already
    }
  }

  async addReturnDocument(
    companyId: string,
    returnId: string,
    kind: 'PHOTO' | 'ATTACHMENT',
    file: any,
    userId?: string,
  ) {
    const returnHeader = await this.returnRepo.findOne({ where: { id: returnId, companyId } });
    if (!returnHeader) throw new NotFoundException(`Return '${returnId}' not found in this company.`);

    const normKind = kind === 'PHOTO' ? 'PHOTO' : 'ATTACHMENT';
    const { buffer, mime, ext } = this.validateReceiptFile(file, normKind);

    const dir = path.join(this.storagePath, 'returns', companyId, returnId);
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(dir, fileName);
    let written = false;
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, buffer);
      written = true;
      const doc = await this.returnDocRepo.save(this.returnDocRepo.create({
        companyId,
        returnId,
        kind: normKind,
        fileName: String(file.originalname).slice(0, 255),
        fileUrl: `/uploads/returns/${companyId}/${returnId}/${fileName}`,
        mimeType: mime,
        fileSize: Buffer.byteLength(buffer),
        createdBy: userId ?? null,
      }));
      return doc;
    } catch (error) {
      if (written && fs.existsSync(filePath)) {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
      throw error;
    }
  }

  async listReturnDocuments(companyId: string, returnId: string) {
    const returnHeader = await this.returnRepo.findOne({ where: { id: returnId, companyId } });
    if (!returnHeader) throw new NotFoundException(`Return '${returnId}' not found in this company.`);
    const docs = await this.returnDocRepo.find({
      where: { returnId, companyId },
      order: { uploadedAt: 'ASC' },
    });
    return docs.map((d) => ({
      id: d.id,
      kind: d.kind,
      fileName: d.fileName,
      fileUrl: d.fileUrl,
      mimeType: d.mimeType,
      fileSize: d.fileSize,
      uploadedAt: d.uploadedAt,
    }));
  }

  async removeReturnDocument(companyId: string, returnId: string, docId: string): Promise<void> {
    const doc = await this.returnDocRepo.findOne({ where: { id: docId, returnId, companyId } });
    if (!doc) throw new NotFoundException(`Document '${docId}' not found in this company.`);
    await this.returnDocRepo.delete({ id: docId });
    this.deleteReturnFile(doc.fileUrl);
  }

  async shareReturnWhatsApp(companyId: string, returnId: string, dto: WhatsAppReceiptShareDto, userId?: string) {
    const returnHeader = await this.returnRepo.findOne({ where: { id: returnId, companyId } });
    if (!returnHeader) throw new NotFoundException(`Return '${returnId}' not found in this company.`);

    const setting = await this.settingRepo.findOne({
      where: { settingType: 'WHATSAPP', enabled: true, isActive: true, companyId },
    } as any);
    if (!setting) {
      return { enqueued: false, reason: 'WA_NOT_CONFIGURED' };
    }

    const delivery = await this.deliveryRepo.save(this.deliveryRepo.create({
      companyId,
      channel: 'WHATSAPP',
      recipientType: 'PHONE',
      recipientAddress: dto.phone,
      renderedSubject: null,
      renderedBody: dto.message,
      templateCode: 'RMR_RETURN_SHARE',
      status: 'QUEUED',
      maxRetries: 3,
      createdBy: userId ?? null,
    }));
    return { enqueued: true, deliveryId: delivery.id };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stock posting helpers (inside an active transaction)
  // ─────────────────────────────────────────────────────────────────────────

  private async postReceiptStock(
    manager: EntityManager,
    header: RawMaterialReceipt,
    lines: RawMaterialReceiptLine[],
    userId: string | undefined,
  ): Promise<void> {
    for (const line of lines) {
      const received = Number(line.receivedQuantity || 0);
      if (received <= 0) continue; // Business rule: no stock movement for zero received quantity.
      await this.ledgerService.create({
        companyId: header.companyId,
        transactionType: 'RECEIPT',
        transactionDate: new Date(`${header.receiptDate}T00:00:00`),
        itemId: line.itemId!,
        warehouseId: header.warehouseId!,
        quantity: received,
        uomId: line.uomId!,
        direction: 'IN',
        referenceType: 'MATERIAL_RECEIPT',
        referenceId: line.id,
        referenceNumber: header.receiptCode,
        notes: `Raw material receipt ${header.receiptCode}${header.gatePassNo ? ` — gate pass ${header.gatePassNo}` : ''}`,
        createdBy: userId,
        divisionId: header.divisionId,
        sectionId: header.sectionId,
        departmentId: header.departmentId,
      }, manager);
      await this.balanceService.updateBalance(
        header.companyId, line.itemId!, header.warehouseId!, null, null, line.uomId!, received, 'IN', manager,
      );
    }
  }

  private async postReturnStock(
    manager: EntityManager,
    header: RawMaterialReturn,
    lines: RawMaterialReturnLine[],
    userId: string | undefined,
  ): Promise<void> {
    for (const line of lines) {
      const quantity = Number(line.quantity || 0);
      if (quantity <= 0) continue;
      await this.ledgerService.create({
        companyId: header.companyId,
        transactionType: 'RETURN_OUT',
        transactionDate: new Date(`${header.returnDate}T00:00:00`),
        itemId: line.itemId!,
        warehouseId: header.warehouseId!,
        quantity,
        uomId: line.uomId!,
        direction: 'OUT',
        referenceType: 'MATERIAL_RETURN',
        referenceId: line.id,
        referenceNumber: header.returnCode,
        notes: `Raw material return ${header.returnCode}${header.sourceNo ? ` — source ${header.sourceNo}` : ''}`,
        createdBy: userId,
        divisionId: header.divisionId,
        sectionId: header.sectionId,
        departmentId: header.departmentId,
      }, manager);
      await this.balanceService.updateBalance(
        header.companyId, line.itemId!, header.warehouseId!, null, null, line.uomId!, quantity, 'OUT', manager,
      );
    }
  }

  private async reverseStockForLines(
    manager: EntityManager,
    companyId: string,
    dirForLine: (line: { itemId: string | null; uomId: string | null; receivedQuantity?: number; quantity?: number }) => { direction: 'IN' | 'OUT'; qty: number } | null,
    lines: Array<{ id: string; itemId: string | null; uomId: string | null; receivedQuantity?: number; quantity?: number }>,
    warehouseId: string,
  ): Promise<void> {
    for (const line of lines) {
      const mapped = dirForLine(line);
      if (!mapped || mapped.qty <= 0) continue;
      const reverseDir: 'IN' | 'OUT' = mapped.direction === 'IN' ? 'OUT' : 'IN';
      await this.balanceService.updateBalance(
        companyId, line.itemId!, warehouseId, null, null, line.uomId!, mapped.qty, reverseDir, manager,
      );
      await manager.getRepository(StockLedger).delete({
        companyId,
        referenceType: In(['MATERIAL_RECEIPT', 'MATERIAL_RETURN']),
        referenceId: line.id,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Create
  // ─────────────────────────────────────────────────────────────────────────

  async createReceipt(companyId: string, dto: CreateRawMaterialReceiptDto, userId?: string) {
    await this.validateOrg(companyId, dto.divisionId, dto.sectionId, dto.departmentId);
    await this.validateWarehouse(dto.warehouseId, companyId);
    await this.validateLines(companyId, dto.items, {
      checkRawMaterial: true,
      divisionId: dto.divisionId,
      sectionId: dto.sectionId,
      departmentId: dto.departmentId,
    });
    this.dedupeItems(dto.items);

    const gatePassNo = dto.gatePassNo && String(dto.gatePassNo).trim() ? String(dto.gatePassNo).trim() : null;

    let duplicate = false;
    const header = await this.receiptRepo.manager.transaction(async (manager) => {
      if (gatePassNo) {
        const lockKey = `${companyId}|${gatePassNo}`;
        await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);
        const prior = await manager.getRepository(RawMaterialReceipt).findOne({
          where: { companyId, gatePassNo, status: Not('CANCELLED') },
          order: { createdAt: 'ASC' },
        });
        if (prior) {
          duplicate = true;
          return { header: prior, lines: [] };
        }
      }

      const receiptCode = await this.nextCode('receipt', manager);
      const savedHeader = await manager.getRepository(RawMaterialReceipt).save(
        manager.getRepository(RawMaterialReceipt).create({
          companyId,
          receiptCode,
          gatePassNo,
          sourceNo: dto.sourceNo ?? null,
          receiptDate: dto.receiptDate ? dto.receiptDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
          divisionId: dto.divisionId,
          sectionId: dto.sectionId,
          departmentId: dto.departmentId,
          warehouseId: dto.warehouseId,
          productionOrderId: dto.productionOrderId ?? null,
          reference: dto.reference ?? null,
          status: 'CONFIRMED',
          remarks: dto.remarks ?? null,
          createdBy: userId ?? null,
        }),
      );

      const lineRepo = manager.getRepository(RawMaterialReceiptLine);
      const lines: RawMaterialReceiptLine[] = [];
      for (let i = 0; i < dto.items.length; i++) {
        const it = dto.items[i];
        const received = Number(it.receivedQuantity || 0);
        lines.push(await lineRepo.save(lineRepo.create({
          companyId,
          receiptId: savedHeader.id,
          lineNumber: i + 1,
          itemId: it.itemId,
          uomId: it.uomId,
          gatePassQuantity: Number(it.gatePassQuantity || 0),
          receivedQuantity: received,
          difference: Number(it.gatePassQuantity || 0) - received,
          remarks: it.remarks ?? null,
          createdBy: userId ?? null,
        })));
      }

      await this.postReceiptStock(manager, savedHeader, lines, userId);
      return { header: savedHeader, lines };
    });

    const receipt = await this.findReceiptById(companyId, header.header.id);
    return duplicate ? { ...receipt, alreadyProcessed: true } : receipt;
  }

  async createReturn(companyId: string, dto: CreateRawMaterialReturnDto, userId?: string) {
    await this.validateOrg(companyId, dto.divisionId, dto.sectionId, dto.departmentId);
    await this.validateWarehouse(dto.warehouseId, companyId);
    await this.validateLines(companyId, dto.items, {
      checkRawMaterial: true,
      divisionId: dto.divisionId,
      sectionId: dto.sectionId,
      departmentId: dto.departmentId,
    });
    this.dedupeItems(dto.items);
    await this.checkReturnAvailability(companyId, dto.warehouseId, dto.items);

    const created = await this.returnRepo.manager.transaction(async (manager) => {
      const returnCode = await this.nextCode('return', manager);
      const savedHeader = await manager.getRepository(RawMaterialReturn).save(
        manager.getRepository(RawMaterialReturn).create({
          companyId,
          returnCode,
          sourceNo: dto.sourceNo ?? null,
          returnDate: dto.returnDate ? dto.returnDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
          divisionId: dto.divisionId,
          sectionId: dto.sectionId,
          departmentId: dto.departmentId,
          warehouseId: dto.warehouseId,
          referenceReceiptId: dto.referenceReceiptId ?? null,
          productionOrderId: dto.productionOrderId ?? null,
          reference: dto.reference ?? null,
          reason: dto.reason ?? null,
          status: 'CONFIRMED',
          remarks: dto.remarks ?? null,
          createdBy: userId ?? null,
        }),
      );

      const lineRepo = manager.getRepository(RawMaterialReturnLine);
      const lines: RawMaterialReturnLine[] = [];
      for (let i = 0; i < dto.items.length; i++) {
        const it = dto.items[i];
        lines.push(await lineRepo.save(lineRepo.create({
          companyId,
          returnId: savedHeader.id,
          lineNumber: i + 1,
          itemId: it.itemId,
          uomId: it.uomId,
          quantity: Number(it.quantity || 0),
          remarks: it.remarks ?? null,
          createdBy: userId ?? null,
        })));
      }

      await this.postReturnStock(manager, savedHeader, lines, userId);
      return { header: savedHeader, lines };
    });

    return this.findReturnById(companyId, created.header.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Update (delta-based stock handling; mirrors the inventory adjustment pattern)
  // ─────────────────────────────────────────────────────────────────────────

  async updateReceipt(id: string, companyId: string, dto: UpdateRawMaterialReceiptDto, userId?: string) {
    const existing = await this.receiptRepo.findOne({
      where: { id, companyId },
      relations: ['lines'],
    });
    if (!existing) throw new NotFoundException(`Receipt '${id}' not found in this company.`);

    const divisionId = dto.divisionId ?? existing.divisionId!;
    const sectionId = dto.sectionId ?? existing.sectionId!;
    const departmentId = dto.departmentId ?? existing.departmentId!;
    const warehouseId = dto.warehouseId ?? existing.warehouseId!;
    if (!divisionId || !sectionId || !departmentId || !warehouseId) {
      throw new BadRequestException('Division, Section, Department and Warehouse are required.');
    }
    await this.validateOrg(companyId, divisionId, sectionId, departmentId);
    await this.validateWarehouse(warehouseId, companyId);
    if (dto.items) {
      await this.validateLines(companyId, dto.items, {
        checkRawMaterial: true,
        divisionId,
        sectionId,
        departmentId,
      });
      this.dedupeItems(dto.items);
    }

    const targetGatePassNo =
      dto.gatePassNo !== undefined && dto.gatePassNo !== null && String(dto.gatePassNo).trim()
        ? String(dto.gatePassNo).trim()
        : null;
    if (targetGatePassNo) {
      const clash = await this.receiptRepo.findOne({
        where: { companyId, gatePassNo: targetGatePassNo, id: Not(id), status: Not('CANCELLED') },
      });
      if (clash) {
        throw new BadRequestException(
          `Gate pass '${targetGatePassNo}' is already processed by receipt '${clash.receiptCode}'. A gate pass can be processed only once.`,
        );
      }
    }

    await this.receiptRepo.manager.transaction(async (manager) => {
      const lineRepo = manager.getRepository(RawMaterialReceiptLine);

      if (dto.items) {
        await this.reverseStockForLines(
          manager, companyId,
          (line) => {
            const qty = Number(line.receivedQuantity || 0);
            return qty > 0 ? { direction: 'IN' as const, qty } : null;
          },
          existing.lines,
          existing.warehouseId!,
        );

        const existingLines = existing.lines!.map((l) => l.id);
        if (existingLines.length > 0) {
          await lineRepo.delete({ id: In(existingLines) });
        }
      }

      const { lines: _removedLines, ...existingScalar } = existing;
      const updated = await manager.getRepository(RawMaterialReceipt).save({
        ...existingScalar,
        gatePassNo: dto.gatePassNo !== undefined ? targetGatePassNo : existing.gatePassNo,
        sourceNo: dto.sourceNo !== undefined ? dto.sourceNo ?? null : existing.sourceNo,
        receiptDate: dto.receiptDate ? dto.receiptDate.slice(0, 10) : existing.receiptDate,
        divisionId,
        sectionId,
        departmentId,
        warehouseId,
        productionOrderId: dto.productionOrderId !== undefined ? dto.productionOrderId ?? null : existing.productionOrderId,
        reference: dto.reference !== undefined ? dto.reference ?? null : existing.reference,
        remarks: dto.remarks !== undefined ? dto.remarks ?? null : existing.remarks,
        updatedBy: userId ?? null,
      });

      if (dto.items) {
        const lines: RawMaterialReceiptLine[] = [];
        for (let i = 0; i < dto.items.length; i++) {
          const it = dto.items[i];
          const received = Number(it.receivedQuantity || 0);
          lines.push(await lineRepo.save(lineRepo.create({
            companyId,
            receiptId: updated.id,
            lineNumber: i + 1,
            itemId: it.itemId,
            uomId: it.uomId,
            gatePassQuantity: Number(it.gatePassQuantity || 0),
            receivedQuantity: received,
            difference: Number(it.gatePassQuantity || 0) - received,
            remarks: it.remarks ?? null,
            createdBy: userId ?? null,
          })));
        }
        await this.postReceiptStock(manager, updated, lines, userId);
      }
    });

    return this.findReceiptById(companyId, id);
  }

  async updateReturn(id: string, companyId: string, dto: UpdateRawMaterialReturnDto, userId?: string) {
    const existing = await this.returnRepo.findOne({
      where: { id, companyId },
      relations: ['lines'],
    });
    if (!existing) throw new NotFoundException(`Return '${id}' not found in this company.`);

    const divisionId = dto.divisionId ?? existing.divisionId!;
    const sectionId = dto.sectionId ?? existing.sectionId!;
    const departmentId = dto.departmentId ?? existing.departmentId!;
    const warehouseId = dto.warehouseId ?? existing.warehouseId!;
    if (!divisionId || !sectionId || !departmentId || !warehouseId) {
      throw new BadRequestException('Division, Section, Department and Warehouse are required.');
    }
    await this.validateOrg(companyId, divisionId, sectionId, departmentId);
    await this.validateWarehouse(warehouseId, companyId);
    if (dto.items) {
      await this.validateLines(companyId, dto.items, {
        checkRawMaterial: true,
        divisionId,
        sectionId,
        departmentId,
      });
      this.dedupeItems(dto.items);
      await this.checkReturnAvailability(companyId, warehouseId, dto.items);
    }

    await this.returnRepo.manager.transaction(async (manager) => {
      const lineRepo = manager.getRepository(RawMaterialReturnLine);

      if (dto.items) {
        await this.reverseStockForLines(
          manager, companyId,
          (line) => {
            const qty = Number(line.quantity || 0);
            return qty > 0 ? { direction: 'OUT' as const, qty } : null;
          },
          existing.lines,
          existing.warehouseId!,
        );

        const existingLines = existing.lines!.map((l) => l.id);
        if (existingLines.length > 0) {
          await lineRepo.delete({ id: In(existingLines) });
        }
      }

      const { lines: _removedLines, ...existingScalar } = existing;
      const updated = await manager.getRepository(RawMaterialReturn).save({
        ...existingScalar,
        sourceNo: dto.sourceNo !== undefined ? dto.sourceNo ?? null : existing.sourceNo,
        returnDate: dto.returnDate ? dto.returnDate.slice(0, 10) : existing.returnDate,
        divisionId,
        sectionId,
        departmentId,
        warehouseId,
        referenceReceiptId: dto.referenceReceiptId !== undefined ? dto.referenceReceiptId ?? null : existing.referenceReceiptId,
        productionOrderId: dto.productionOrderId !== undefined ? dto.productionOrderId ?? null : existing.productionOrderId,
        reference: dto.reference !== undefined ? dto.reference ?? null : existing.reference,
        reason: dto.reason !== undefined ? dto.reason ?? null : existing.reason,
        remarks: dto.remarks !== undefined ? dto.remarks ?? null : existing.remarks,
        updatedBy: userId ?? null,
      });

      if (dto.items) {
        const lines: RawMaterialReturnLine[] = [];
        for (let i = 0; i < dto.items.length; i++) {
          const it = dto.items[i];
          lines.push(await lineRepo.save(lineRepo.create({
            companyId,
            returnId: updated.id,
            lineNumber: i + 1,
            itemId: it.itemId,
            uomId: it.uomId,
            quantity: Number(it.quantity || 0),
            remarks: it.remarks ?? null,
            createdBy: userId ?? null,
          })));
        }
        await this.postReturnStock(manager, updated, lines, userId);
      }
    });

    return this.findReturnById(companyId, id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Delete (reverses posted stock, atomic)
  // ─────────────────────────────────────────────────────────────────────────

  async removeReceipt(id: string, companyId: string): Promise<void> {
    const existing = await this.receiptRepo.findOne({
      where: { id, companyId },
      relations: ['lines', 'documents'],
    });
    if (!existing) throw new NotFoundException(`Receipt '${id}' not found in this company.`);

    await this.receiptRepo.manager.transaction(async (manager) => {
      await this.reverseStockForLines(
        manager, companyId,
        (line) => {
          const qty = Number(line.receivedQuantity || 0);
          return qty > 0 ? { direction: 'IN' as const, qty } : null;
        },
        existing.lines,
        existing.warehouseId!,
      );
      await manager.getRepository(RawMaterialReceipt).delete({ id });
    });

    // Header (and its document rows) are gone via ON DELETE CASCADE — clean bytes
    // off disk so no orphans remain.
    for (const doc of existing.documents || []) {
      this.deleteReceiptFile(doc.fileUrl);
    }
  }

  async removeReturn(id: string, companyId: string): Promise<void> {
    const existing = await this.returnRepo.findOne({
      where: { id, companyId },
      relations: ['lines'],
    });
    if (!existing) throw new NotFoundException(`Return '${id}' not found in this company.`);

    await this.returnRepo.manager.transaction(async (manager) => {
      await this.reverseStockForLines(
        manager, companyId,
        (line) => {
          const qty = Number(line.quantity || 0);
          return qty > 0 ? { direction: 'OUT' as const, qty } : null;
        },
        existing.lines,
        existing.warehouseId!,
      );
      await manager.getRepository(RawMaterialReturn).delete({ id });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────

  async getFormReferenceData(companyId: string) {
    const [warehouses, items, uoms, divisions, productionOrders, sections, departments] = await Promise.all([
      this.warehouseRepo.find({
        where: { companyId, status: 'ACTIVE' as any },
        order: { warehouseCode: 'ASC' },
      }),
      this.itemRepo.find({
        where: { companyId, status: 'ACTIVE' as any, itemType: ItemType.RAW_MATERIAL },
        order: { itemCode: 'ASC' },
        take: 500,
      }),
      this.uomRepo.find({
        where: { status: 'ACTIVE' as any },
        order: { code: 'ASC' },
      }),
      this.divisionRepo.find({
        where: { companyId, status: 'ACTIVE' as any },
        order: { name: 'ASC' as any },
      }),
      this.receiptRepo.manager.query(
        `SELECT id, order_number, status, product_id
           FROM production_orders
          WHERE company_id = $1
          ORDER BY order_number DESC
          LIMIT 100`,
        [companyId],
      ),
      // Bundle the full (small) organization lookup lists into the single form-data
      // response so Division → Section → Department cascades resolve client-side
      // without three extra guarded round-trips to the (high-latency) database.
      this.sectionRepo.find({
        where: { status: 'ACTIVE' as any },
        order: { name: 'ASC' },
      }),
      this.departmentRepo.find({
        where: { status: 'ACTIVE' as any },
        order: { name: 'ASC' },
      }),
    ]);
    return { warehouses, items, uoms, divisions, productionOrders, sections, departments };
  }

  async findAllReceipts(companyId: string, filter: {
    page?: number;
    limit?: number;
    status?: string;
    divisionId?: string;
    sectionId?: string;
    departmentId?: string;
    warehouseId?: string;
    gatePassNo?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}) {
    const { page = 1, limit = 20 } = filter;
    const qb = this.receiptRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.division', 'division')
      .leftJoinAndSelect('r.section', 'section')
      .leftJoinAndSelect('r.department', 'department')
      .leftJoinAndSelect('r.warehouse', 'warehouse')
      .loadRelationCountAndMap('r.lineCount', 'r.lines')
      .where('r.companyId = :companyId', { companyId });

    if (filter.status) qb.andWhere('r.status = :status', { status: filter.status });
    if (filter.divisionId) qb.andWhere('r.divisionId = :divisionId', { divisionId: filter.divisionId });
    if (filter.sectionId) qb.andWhere('r.sectionId = :sectionId', { sectionId: filter.sectionId });
    if (filter.departmentId) qb.andWhere('r.departmentId = :departmentId', { departmentId: filter.departmentId });
    if (filter.warehouseId) qb.andWhere('r.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
    if (filter.gatePassNo) qb.andWhere('r.gatePassNo ILIKE :gatePassNo', { gatePassNo: `%${filter.gatePassNo}%` });
    if (filter.dateFrom) qb.andWhere('r.receiptDate >= :dateFrom', { dateFrom: filter.dateFrom });
    if (filter.dateTo) qb.andWhere('r.receiptDate <= :dateTo', { dateTo: filter.dateTo });

    qb.orderBy('r.receiptDate', 'DESC').addOrderBy('r.createdAt', 'DESC');
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();

    const ids = data.map((h) => h.id);
    const totals: Record<string, { gatePassTotal: number; receivedTotal: number; differenceTotal: number }> = {};
    if (ids.length > 0) {
      const rows: any[] = await this.receiptLineRepo
        .createQueryBuilder('l')
        .select('l.receiptId', 'receiptId')
        .addSelect('COALESCE(SUM(l.gatePassQuantity), 0)', 'gatePass')
        .addSelect('COALESCE(SUM(l.receivedQuantity), 0)', 'received')
        .addSelect('COALESCE(SUM(l.gatePassQuantity - l.receivedQuantity), 0)', 'difference')
        .where('l.receiptId IN (:...ids)', { ids })
        .groupBy('l.receiptId')
        .getRawMany();
      for (const r of rows) {
        totals[r.receiptId] = {
          gatePassTotal: Number(r.gatePass || 0),
          receivedTotal: Number(r.received || 0),
          differenceTotal: Number(r.difference || 0),
        };
      }
    }

    return {
      data: data.map((h) => ({
        ...h,
        lineCount: (h as any).lineCount ?? 0,
        gatePassTotal: totals[h.id]?.gatePassTotal ?? 0,
        receivedTotal: totals[h.id]?.receivedTotal ?? 0,
        differenceTotal: totals[h.id]?.differenceTotal ?? 0,
      })),
      total,
    };
  }

  async findReceiptById(companyId: string, id: string) {
    const header = await this.receiptRepo.findOne({
      where: { id, companyId },
      relations: ['division', 'section', 'department', 'warehouse', 'lines', 'lines.item', 'lines.uom', 'documents'],
    });
    if (!header) throw new NotFoundException(`Receipt '${id}' not found in this company.`);

    const lineIds = header.lines.map((l) => l.id);
    let ledgerEntries: StockLedger[] = [];
    if (lineIds.length > 0) {
      ledgerEntries = await this.ledgerRepo.find({
        where: { companyId, referenceType: 'MATERIAL_RECEIPT', referenceId: In(lineIds) },
        order: { transactionDate: 'ASC' },
      });
    }

    let gatePassTotal = 0; let receivedTotal = 0; let differenceTotal = 0;
    for (const line of header.lines) {
      const gp = Number(line.gatePassQuantity || 0);
      const rc = Number(line.receivedQuantity || 0);
      gatePassTotal += gp;
      receivedTotal += rc;
      differenceTotal += gp - rc;
    }

    return {
      ...header,
      lineCount: header.lines.length,
      lineCountPosted: ledgerEntries.length,
      gatePassTotal,
      receivedTotal,
      differenceTotal,
      documents: (header.documents || []).map((d) => ({
        id: d.id,
        kind: d.kind,
        fileName: d.fileName,
        fileUrl: d.fileUrl,
        mimeType: d.mimeType,
        fileSize: d.fileSize,
        uploadedAt: d.uploadedAt,
      })),
      ledgerEntries: ledgerEntries.map((l) => ({
        id: l.id,
        transactionType: l.transactionType,
        direction: l.direction,
        quantity: Number(l.quantity),
        transactionDate: l.transactionDate,
        referenceNumber: l.referenceNumber,
      })),
    };
  }

  /**
   * READ-ONLY inventory view for the items received in a receipt.
   * One company-scoped request: loads the receipt (from the authenticated
   * user's company), reads its lines, then resolves current on-hand balance
   * for every distinct (item, warehouse) pair from the EXISTING
   * inventory_balances source of truth in a single bulk query (no N+1).
   * This NEVER posts ledger / mutates balances — it is a viewing feature.
   */
  async getReceiptInventory(companyId: string, id: string) {
    const header = await this.receiptRepo.findOne({
      where: { id, companyId },
      relations: ['warehouse'],
    });
    if (!header) throw new NotFoundException(`Receipt '${id}' not found in this company.`);

    const lines = await this.receiptLineRepo.find({
      where: { receiptId: header.id },
      relations: ['item', 'uom'],
      order: { lineNumber: 'ASC' },
    });

    const warehouseId = header.warehouseId;
    const pairs: Array<{ itemId: string; warehouseId: string }> = [];
    const seen = new Set<string>();
    for (const l of lines) {
      if (l.itemId && warehouseId) {
        const key = `${l.itemId}|${warehouseId}`;
        if (!seen.has(key)) {
          seen.add(key);
          pairs.push({ itemId: l.itemId, warehouseId });
        }
      }
    }

    const balances = await this.balanceService.findBalancesForItemWarehousePairs(companyId, pairs);
    const byPair = new Map(balances.map((b) => [`${b.itemId}|${b.warehouseId}`, b]));

    return {
      receiptCode: header.receiptCode,
      receiptDate: header.receiptDate,
      status: header.status,
      warehouse: header.warehouse
        ? { id: header.warehouse.id, name: header.warehouse.name, warehouseCode: header.warehouse.warehouseCode, warehouseType: header.warehouse.warehouseType }
        : null,
      items: lines.map((l, idx) => {
        const pair = l.itemId && warehouseId ? `${l.itemId}|${warehouseId}` : null;
        const balance = pair ? byPair.get(pair) : null;
        const onHand = balance ? Number(balance.onHand) : 0;
        const received = Number(l.receivedQuantity || 0);
        const previousOnHand = header.status === 'CONFIRMED' ? Math.max(0, onHand - received) : onHand;
        return {
          lineNumber: l.lineNumber ?? idx + 1,
          item: l.item ? { id: l.item.id, itemCode: l.item.itemCode, name: l.item.name, uomCode: l.uom?.code || null } : null,
          uom: l.uom ? { id: l.uom.id, code: l.uom.code, name: l.uom.name, symbol: l.uom.symbol } : null,
          receivedQuantity: received,
          gatePassQuantity: Number(l.gatePassQuantity || 0),
          balance: balance
            ? {
                exists: true,
                previousOnHand,
                onHand,
                reserved: Number(balance.reserved),
                available: Number(balance.available),
                uom: balance.uom ? { code: balance.uom.code, symbol: balance.uom.symbol } : null,
                lastUpdatedAt: balance.updatedAt || null,
              }
            : { exists: false, previousOnHand: 0, onHand: null, reserved: null, available: null, uom: null, lastUpdatedAt: null },
        };
      }),
    };
  }

  async findAllReturns(companyId: string, filter: {
    page?: number;
    limit?: number;
    status?: string;
    divisionId?: string;
    sectionId?: string;
    departmentId?: string;
    warehouseId?: string;
    sourceNo?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}) {
    const { page = 1, limit = 20 } = filter;
    const qb = this.returnRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.division', 'division')
      .leftJoinAndSelect('r.section', 'section')
      .leftJoinAndSelect('r.department', 'department')
      .leftJoinAndSelect('r.warehouse', 'warehouse')
      .loadRelationCountAndMap('r.lineCount', 'r.lines')
      .where('r.companyId = :companyId', { companyId });

    if (filter.status) qb.andWhere('r.status = :status', { status: filter.status });
    if (filter.divisionId) qb.andWhere('r.divisionId = :divisionId', { divisionId: filter.divisionId });
    if (filter.sectionId) qb.andWhere('r.sectionId = :sectionId', { sectionId: filter.sectionId });
    if (filter.departmentId) qb.andWhere('r.departmentId = :departmentId', { departmentId: filter.departmentId });
    if (filter.warehouseId) qb.andWhere('r.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
    if (filter.sourceNo) qb.andWhere('r.sourceNo ILIKE :sourceNo', { sourceNo: `%${filter.sourceNo}%` });
    if (filter.dateFrom) qb.andWhere('r.returnDate >= :dateFrom', { dateFrom: filter.dateFrom });
    if (filter.dateTo) qb.andWhere('r.returnDate <= :dateTo', { dateTo: filter.dateTo });

    qb.orderBy('r.returnDate', 'DESC').addOrderBy('r.createdAt', 'DESC');
    const [data, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();

    const ids = data.map((h) => h.id);
    const totals: Record<string, { quantityTotal: number }> = {};
    if (ids.length > 0) {
      const rows: any[] = await this.returnLineRepo
        .createQueryBuilder('l')
        .select('l.returnId', 'returnId')
        .addSelect('COALESCE(SUM(l.quantity), 0)', 'quantity')
        .where('l.returnId IN (:...ids)', { ids })
        .groupBy('l.returnId')
        .getRawMany();
      for (const r of rows) {
        totals[r.returnId] = { quantityTotal: Number(r.quantity || 0) };
      }
    }

    return {
      data: data.map((h) => ({
        ...h,
        lineCount: (h as any).lineCount ?? 0,
        quantityTotal: totals[h.id]?.quantityTotal ?? 0,
      })),
      total,
    };
  }

  async findReturnById(companyId: string, id: string) {
    const header = await this.returnRepo.findOne({
      where: { id, companyId },
      relations: ['division', 'section', 'department', 'warehouse', 'referenceReceipt', 'lines', 'lines.item', 'lines.uom', 'documents'],
    });
    if (!header) throw new NotFoundException(`Return '${id}' not found in this company.`);

    const lineIds = header.lines.map((l) => l.id);
    let ledgerEntries: StockLedger[] = [];
    if (lineIds.length > 0) {
      ledgerEntries = await this.ledgerRepo.find({
        where: { companyId, referenceType: 'MATERIAL_RETURN', referenceId: In(lineIds) },
        order: { transactionDate: 'ASC' },
      });
    }

    let quantityTotal = 0;
    for (const line of header.lines) quantityTotal += Number(line.quantity || 0);

    return {
      ...header,
      lineCount: header.lines.length,
      lineCountPosted: ledgerEntries.length,
      quantityTotal,
      ledgerEntries: ledgerEntries.map((l) => ({
        id: l.id,
        transactionType: l.transactionType,
        direction: l.direction,
        quantity: Number(l.quantity),
        transactionDate: l.transactionDate,
        referenceNumber: l.referenceNumber,
      })),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Monthly report (receiving + return + legacy ledger entries)
  // ─────────────────────────────────────────────────────────────────────────

  async getReport(companyId: string, filter: RawMaterialReceivingReportQuery) {
    const { dateFrom, dateTo } = filter;

    const receiptsQb = this.receiptLineRepo
      .createQueryBuilder('line')
      .leftJoinAndSelect('line.receipt', 'h')
      .leftJoinAndSelect('line.item', 'item')
      .leftJoinAndSelect('line.uom', 'uom')
      .leftJoinAndSelect('h.division', 'division')
      .leftJoinAndSelect('h.section', 'section')
      .leftJoinAndSelect('h.department', 'department')
      .leftJoinAndSelect('h.warehouse', 'warehouse')
      .where('line.companyId = :companyId', { companyId });

    const returnsQb = this.returnLineRepo
      .createQueryBuilder('line')
      .leftJoinAndSelect('line.return', 'h')
      .leftJoinAndSelect('line.item', 'item')
      .leftJoinAndSelect('line.uom', 'uom')
      .leftJoinAndSelect('h.division', 'division')
      .leftJoinAndSelect('h.section', 'section')
      .leftJoinAndSelect('h.department', 'department')
      .leftJoinAndSelect('h.warehouse', 'warehouse')
      .where('line.companyId = :companyId', { companyId });

    const applyCommon = (qb: any, dateColumn: string) => {
      if (dateFrom) qb.andWhere(`${dateColumn} >= :dateFrom`, { dateFrom });
      if (dateTo) qb.andWhere(`${dateColumn} <= :dateTo`, { dateTo });
      if (filter.divisionId) qb.andWhere('h.divisionId = :divisionId', { divisionId: filter.divisionId });
      if (filter.sectionId) qb.andWhere('h.sectionId = :sectionId', { sectionId: filter.sectionId });
      if (filter.departmentId) qb.andWhere('h.departmentId = :departmentId', { departmentId: filter.departmentId });
      if (filter.warehouseId) qb.andWhere('h.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
      if (filter.itemId) qb.andWhere('line.itemId = :itemId', { itemId: filter.itemId });
      if (filter.status) qb.andWhere('h.status = :status', { status: filter.status });
      return qb;
    };

    applyCommon(receiptsQb, 'h.receiptDate');
    if (filter.gatePassNo) receiptsQb.andWhere('h.gatePassNo ILIKE :gatePassNo', { gatePassNo: `%${filter.gatePassNo}%` });
    if (filter.sourceNo) receiptsQb.andWhere('h.sourceNo ILIKE :sourceNo', { sourceNo: `%${filter.sourceNo}%` });
    receiptsQb.orderBy('h.receiptDate', 'DESC').addOrderBy('h.receiptCode', 'ASC').addOrderBy('line.lineNumber', 'ASC');

    applyCommon(returnsQb, 'h.returnDate');
    if (filter.sourceNo) returnsQb.andWhere('h.sourceNo ILIKE :sourceNo', { sourceNo: `%${filter.sourceNo}%` });
    returnsQb.orderBy('h.returnDate', 'DESC').addOrderBy('h.returnCode', 'ASC').addOrderBy('line.lineNumber', 'ASC');

    const [receiptLines, returnLines] = await Promise.all([
      receiptsQb.getMany(),
      returnsQb.getMany(),
    ]);

    const receipts = this.groupReceipts(receiptLines);
    const returns = this.groupReturns(returnLines);

    let legacy: StockLedger[] = [];
    if (!filter.status || filter.status === 'CONFIRMED') {
      const legacyQb = this.ledgerRepo.createQueryBuilder('l')
        .leftJoinAndSelect('l.item', 'item')
        .leftJoinAndSelect('l.warehouse', 'warehouse')
        .leftJoinAndSelect('l.uom', 'uom')
        .where('l.companyId = :companyId', { companyId })
        .andWhere('l.transactionType IN (:...types)', { types: ['RECEIPT', 'RETURN_OUT'] })
        .andWhere('(l.referenceType IS NULL OR l.referenceType IN (:...legacyTypes))', { legacyTypes: ['RECEIPT', 'RETURN_OUT'] });
      if (dateFrom) legacyQb.andWhere('l.transactionDate >= :dateFrom', { dateFrom: `${dateFrom} 00:00:00` });
      if (dateTo) legacyQb.andWhere('l.transactionDate <= :dateTo', { dateTo: `${dateTo} 23:59:59` });
      if (filter.warehouseId) legacyQb.andWhere('l.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
      if (filter.itemId) legacyQb.andWhere('l.itemId = :itemId', { itemId: filter.itemId });
      if (filter.divisionId) legacyQb.andWhere('l.divisionId = :divisionId', { divisionId: filter.divisionId });
      if (filter.sectionId) legacyQb.andWhere('l.sectionId = :sectionId', { sectionId: filter.sectionId });
      if (filter.departmentId) legacyQb.andWhere('l.departmentId = :departmentId', { departmentId: filter.departmentId });
      legacyQb.orderBy('l.transactionDate', 'DESC');
      legacy = await legacyQb.getMany();
    }

    let itemStockSummary: any = null;
    if (filter.itemId) {
      const itemRecord = await this.itemRepo.findOne({
        where: { id: filter.itemId, companyId },
        relations: ['baseUom'],
      });
      if (itemRecord) {
        const balanceQb = this.ledgerRepo.manager.getRepository(InventoryBalance).createQueryBuilder('b')
          .leftJoinAndSelect('b.warehouse', 'w')
          .where('b.companyId = :companyId', { companyId })
          .andWhere('b.itemId = :itemId', { itemId: filter.itemId })
          .andWhere('b.status = :status', { status: 'ACTIVE' });
        if (filter.warehouseId) {
          balanceQb.andWhere('b.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
        }
        const balances = await balanceQb.getMany();
        const totalOnHand = balances.reduce((sum, b) => sum + Number(b.onHand || 0), 0);
        const totalAvailable = balances.reduce((sum, b) => sum + Number(b.available || 0), 0);
        const totalReserved = balances.reduce((sum, b) => sum + Number(b.reserved || 0), 0);

        const prodConsumptionQb = this.ledgerRepo.createQueryBuilder('l')
          .where('l.companyId = :companyId', { companyId })
          .andWhere('l.itemId = :itemId', { itemId: filter.itemId })
          .andWhere('l.transactionType = :txType', { txType: 'PRODUCTION_CONSUMPTION' });
        if (filter.warehouseId) {
          prodConsumptionQb.andWhere('l.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
        }
        if (dateFrom) prodConsumptionQb.andWhere('l.transactionDate >= :dateFrom', { dateFrom: `${dateFrom} 00:00:00` });
        if (dateTo) prodConsumptionQb.andWhere('l.transactionDate <= :dateTo', { dateTo: `${dateTo} 23:59:59` });
        const prodEntries = await prodConsumptionQb.getMany();
        const totalProductionConsumption = prodEntries.reduce((sum, l) => sum + Number(l.quantity || 0), 0);

        const lastTxQb = this.ledgerRepo.createQueryBuilder('l')
          .leftJoinAndSelect('l.warehouse', 'w')
          .where('l.companyId = :companyId', { companyId })
          .andWhere('l.itemId = :itemId', { itemId: filter.itemId });
        if (filter.warehouseId) {
          lastTxQb.andWhere('l.warehouseId = :warehouseId', { warehouseId: filter.warehouseId });
        }
        const lastTx = await lastTxQb.orderBy('l.transactionDate', 'DESC')
          .addOrderBy('l.createdAt', 'DESC')
          .getOne();

        itemStockSummary = {
          itemId: itemRecord.id,
          itemCode: itemRecord.itemCode,
          itemName: itemRecord.name,
          uomCode: itemRecord.baseUom?.code || 'KG',
          totalOnHand,
          totalAvailable,
          totalReserved,
          totalProductionConsumption,
          warehouseBreakdown: balances.map((b) => ({
            warehouseCode: b.warehouse?.warehouseCode,
            warehouseName: b.warehouse?.name,
            quantityOnHand: Number(b.onHand || 0),
            quantityAvailable: Number(b.available || 0),
          })),
          lastTransaction: lastTx ? {
            transactionType: lastTx.transactionType,
            direction: lastTx.direction,
            quantity: Number(lastTx.quantity),
            transactionDate: lastTx.transactionDate,
            referenceNumber: lastTx.referenceNumber,
            notes: lastTx.notes,
            warehouseName: lastTx.warehouse?.name,
            warehouseCode: lastTx.warehouse?.warehouseCode,
          } : null,
        };
      }
    }

    return {
      receipts,
      returns,
      legacyLedger: legacy,
      itemStockSummary,
      summary: {
        gatePassTotal: receipts.reduce((s, r) => s + Number(r.gatePassTotal || 0), 0),
        receivedTotal: receipts.reduce((s, r) => s + Number(r.receivedTotal || 0), 0),
        differenceTotal: receipts.reduce((s, r) => s + Number(r.differenceTotal || 0), 0),
        returnTotal: returns.reduce((s, r) => s + Number(r.quantityTotal || 0), 0),
        legacyReceiptTotal: legacy.filter((l) => l.transactionType === 'RECEIPT').reduce((s, l) => s + Number(l.quantity), 0),
        legacyReturnTotal: legacy.filter((l) => l.transactionType === 'RETURN_OUT').reduce((s, l) => s + Number(l.quantity), 0),
      },
    };
  }

  private groupReceipts(lines: RawMaterialReceiptLine[]): any[] {
    const grouped = new Map<string, any>();
    for (const line of lines) {
      const h = line.receipt;
      if (!grouped.has(h.id)) {
        grouped.set(h.id, {
          id: h.id,
          receiptCode: h.receiptCode,
          gatePassNo: h.gatePassNo,
          sourceNo: h.sourceNo,
          receiptDate: h.receiptDate,
          status: h.status,
          reference: h.reference,
          remarks: h.remarks,
          divisionId: h.divisionId,
          divisionName: h.division?.name ?? null,
          sectionId: h.sectionId,
          sectionName: h.section?.name ?? null,
          departmentId: h.departmentId,
          departmentName: h.department?.name ?? null,
          warehouseId: h.warehouseId,
          warehouseCode: h.warehouse?.warehouseCode ?? null,
          warehouseName: h.warehouse?.name ?? null,
          gatePassTotal: 0,
          receivedTotal: 0,
          differenceTotal: 0,
          lines: [],
        });
      }
      const row = grouped.get(h.id);
      const gp = Number(line.gatePassQuantity || 0);
      const rc = Number(line.receivedQuantity || 0);
      row.gatePassTotal += gp;
      row.receivedTotal += rc;
      row.differenceTotal += gp - rc;
      row.lines.push({
        lineNumber: line.lineNumber,
        itemId: line.itemId,
        itemCode: line.item?.itemCode ?? null,
        itemName: line.item?.name ?? null,
        uomCode: line.uom?.code ?? null,
        gatePassQuantity: gp,
        receivedQuantity: rc,
        difference: gp - rc,
        remarks: line.remarks,
      });
    }
    return Array.from(grouped.values());
  }

  private groupReturns(lines: RawMaterialReturnLine[]): any[] {
    const grouped = new Map<string, any>();
    for (const line of lines) {
      const h = line.return;
      if (!grouped.has(h.id)) {
        grouped.set(h.id, {
          id: h.id,
          returnCode: h.returnCode,
          sourceNo: h.sourceNo,
          returnDate: h.returnDate,
          status: h.status,
          reason: h.reason,
          divisionId: h.divisionId,
          divisionName: h.division?.name ?? null,
          sectionId: h.sectionId,
          sectionName: h.section?.name ?? null,
          departmentId: h.departmentId,
          departmentName: h.department?.name ?? null,
          warehouseId: h.warehouseId,
          warehouseCode: h.warehouse?.warehouseCode ?? null,
          warehouseName: h.warehouse?.name ?? null,
          quantityTotal: 0,
          lines: [],
        });
      }
      const row = grouped.get(h.id);
      const qty = Number(line.quantity || 0);
      row.quantityTotal += qty;
      row.lines.push({
        lineNumber: line.lineNumber,
        itemId: line.itemId,
        itemCode: line.item?.itemCode ?? null,
        itemName: line.item?.name ?? null,
        uomCode: line.uom?.code ?? null,
        quantity: qty,
        remarks: line.remarks,
      });
    }
    return Array.from(grouped.values());
  }

  async getItemLedgerHistory(companyId: string, itemId: string, warehouseId?: string) {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, companyId },
      relations: ['baseUom'],
    });
    if (!item) throw new NotFoundException(`Item '${itemId}' not found in this company.`);

    const qb = this.ledgerRepo
      .createQueryBuilder('sl')
      .leftJoinAndSelect('sl.warehouse', 'warehouse')
      .leftJoinAndSelect('sl.uom', 'uom')
      .leftJoinAndSelect('sl.division', 'division')
      .leftJoinAndSelect('sl.section', 'section')
      .leftJoinAndSelect('sl.department', 'department')
      .where('sl.companyId = :companyId', { companyId })
      .andWhere('sl.itemId = :itemId', { itemId });

    if (warehouseId) {
      qb.andWhere('sl.warehouseId = :warehouseId', { warehouseId });
    }

    qb.orderBy('sl.transactionDate', 'ASC').addOrderBy('sl.createdAt', 'ASC');

    const records = await qb.getMany();

    let runningBalance = 0;
    let totalIn = 0;
    let totalOut = 0;

    const movements = records.map((r) => {
      const qty = Number(r.quantity || 0);
      const isIncoming = r.direction === 'IN';
      if (isIncoming) {
        runningBalance += qty;
        totalIn += qty;
      } else {
        runningBalance -= qty;
        totalOut += qty;
      }

      return {
        id: r.id,
        date: r.transactionDate,
        transactionType: r.transactionType,
        direction: r.direction,
        quantity: qty,
        inQuantity: isIncoming ? qty : 0,
        outQuantity: isIncoming ? 0 : qty,
        runningBalance: Math.round(runningBalance * 10000) / 10000,
        referenceType: r.referenceType,
        referenceNumber: r.referenceNumber || '-',
        notes: r.notes || '',
        warehouse: r.warehouse ? { id: r.warehouse.id, name: r.warehouse.name, code: r.warehouse.warehouseCode } : null,
        division: r.division ? { id: r.division.id, name: r.division.name } : null,
        section: r.section ? { id: r.section.id, name: r.section.name } : null,
        department: r.department ? { id: r.department.id, name: r.department.name } : null,
      };
    });

    return {
      item: {
        id: item.id,
        itemCode: item.itemCode,
        name: item.name,
        uomCode: item.baseUom?.code || item.baseUom?.symbol || 'KG',
      },
      summary: {
        totalIn: Math.round(totalIn * 10000) / 10000,
        totalOut: Math.round(totalOut * 10000) / 10000,
        currentBalance: Math.round(runningBalance * 10000) / 10000,
        totalMovements: movements.length,
      },
      movements: movements.reverse(),
    };
  }
}