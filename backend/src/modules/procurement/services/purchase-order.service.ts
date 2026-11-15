import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { PurchaseOrder, PurchaseOrderLine, PurchaseOrderImportUpdate } from '../entities';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto, PurchaseOrderFilterDto, AddPoImportUpdateDto } from '../dto';
import { Item, Uom } from '../../item/entities';

@Injectable()
export class PurchaseOrderService {
  private readonly logger = new Logger(PurchaseOrderService.name);

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly repo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLine)
    private readonly lineRepo: Repository<PurchaseOrderLine>,
    @InjectRepository(PurchaseOrderImportUpdate)
    private readonly importUpdateRepo: Repository<PurchaseOrderImportUpdate>,
  ) {}

  async create(dto: CreatePurchaseOrderDto, userId?: string): Promise<PurchaseOrder> {
    const existing = await this.repo.findOne({
      where: { poCode: dto.poCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(`PO code '${dto.poCode}' already exists`);
    }

    const { lines, purchaseType, divisionId, purchaseOrigin, ...restDto } = dto;
    const origin = (purchaseOrigin || purchaseType || 'LOCAL').toUpperCase();
    const po = this.repo.create({
      ...restDto,
      divisionId: divisionId || null,
      purchaseOrigin: origin,
      importStage: origin === 'IMPORT' ? (dto.importStage || 'ORDER_PLACED') : null,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(po);

    if (origin === 'IMPORT') {
      const initialLogs: Array<Partial<PurchaseOrderImportUpdate>> = [];
      if (saved.productionReadyDate) {
        initialLogs.push({
          companyId: saved.companyId,
          poId: saved.id,
          milestoneType: 'PRODUCTION',
          stage: saved.importStage || 'ORDER_PLACED',
          previousDate: null,
          newDate: saved.productionReadyDate,
          locationPort: saved.portOfLoading || 'Supplier Factory',
          remarks: 'Initial promised production completion date',
          revisionNumber: 1,
          updatedBy: userId || null,
        });
      }
      if (saved.etdDate) {
        initialLogs.push({
          companyId: saved.companyId,
          poId: saved.id,
          milestoneType: 'ETD',
          stage: saved.importStage || 'ORDER_PLACED',
          previousDate: null,
          newDate: saved.etdDate,
          locationPort: saved.portOfLoading || 'Origin Port',
          remarks: 'Initial scheduled ETD (Estimated Departure)',
          revisionNumber: 1,
          updatedBy: userId || null,
        });
      }
      if (saved.etaDate) {
        initialLogs.push({
          companyId: saved.companyId,
          poId: saved.id,
          milestoneType: 'ETA',
          stage: saved.importStage || 'ORDER_PLACED',
          previousDate: null,
          newDate: saved.etaDate,
          locationPort: saved.portOfDischarge || 'Karachi Port',
          remarks: 'Initial scheduled ETA (Karachi Port)',
          revisionNumber: 1,
          updatedBy: userId || null,
        });
      }
      if (initialLogs.length > 0) {
        await this.importUpdateRepo.save(initialLogs.map((l) => this.importUpdateRepo.create(l)));
      }
    }

    if (dto.lines && dto.lines.length > 0) {
      let subtotal = 0;
      for (const lineDto of dto.lines) {
        let uomId = lineDto.uomId;
        if (!uomId || uomId.startsWith('00000000-0000-0000-0000-00000000000')) {
          const item = await this.repo.manager.findOne(Item, { where: { id: lineDto.itemId } });
          uomId = item?.purchaseUomId || item?.baseUomId;
          if (!uomId) {
            const firstUom = await this.repo.manager.findOne(Uom, { where: {} });
            uomId = firstUom?.id;
          }
        }
        const totalPrice = lineDto.quantity * lineDto.unitPrice * (1 - (lineDto.discountPercent || 0) / 100);
        const line = this.lineRepo.create({
          poId: saved.id,
          ...lineDto,
          uomId: uomId || undefined,
          totalPrice,
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await this.lineRepo.save(line);
        if (lineDto.itemId && Number(lineDto.unitPrice) > 0) {
          try {
            await this.repo.manager.query(
              `UPDATE items SET cost_price = $1, updated_at = NOW() WHERE id = $2`,
              [Number(lineDto.unitPrice), lineDto.itemId],
            );
          } catch { /* ignore */ }
        }
        subtotal += totalPrice;
      }
      const taxAmount = subtotal * (dto.taxPercent || 0) / 100;
      const discountAmount = subtotal * (dto.discountPercent || 0) / 100;
      saved.subtotal = subtotal;
      saved.taxAmount = taxAmount;
      saved.discountAmount = discountAmount;
      saved.totalAmount = subtotal + taxAmount - discountAmount + (dto.shippingCost || 0);
      await this.repo.save(saved);
    }

    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdatePurchaseOrderDto, userId?: string): Promise<PurchaseOrder> {
    const po = await this.repo.findOne({ where: { id } });
    if (!po) throw new NotFoundException(`Purchase order with ID '${id}' not found`);

    if (dto.poCode && dto.poCode !== po.poCode) {
      const existing = await this.repo.findOne({
        where: { poCode: dto.poCode, companyId: po.companyId },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`PO code '${dto.poCode}' already exists`);
      }
      po.poCode = dto.poCode;
    }

    if (dto.supplierId !== undefined) po.supplierId = dto.supplierId;
    if (dto.warehouseId !== undefined) po.warehouseId = dto.warehouseId;
    if (dto.divisionId !== undefined) po.divisionId = dto.divisionId || null;
    if (dto.orderDate !== undefined) po.orderDate = dto.orderDate;
    if (dto.expectedDeliveryDate !== undefined) po.expectedDeliveryDate = dto.expectedDeliveryDate;
    if (dto.deliveryAddress !== undefined) po.deliveryAddress = dto.deliveryAddress;
    if (dto.paymentTerms !== undefined) po.paymentTerms = dto.paymentTerms;
    if (dto.currencyCode !== undefined) po.currencyCode = dto.currencyCode;
    if (dto.taxPercent !== undefined) po.taxPercent = dto.taxPercent;
    if (dto.discountPercent !== undefined) po.discountPercent = dto.discountPercent;
    if (dto.shippingCost !== undefined) po.shippingCost = dto.shippingCost;
    if (dto.notes !== undefined) po.notes = dto.notes;
    if (dto.purchaseOrigin !== undefined) po.purchaseOrigin = dto.purchaseOrigin.toUpperCase();
    if (dto.importCargoType !== undefined) po.importCargoType = dto.importCargoType || null;
    if (dto.incoterm !== undefined) po.incoterm = dto.incoterm || null;
    if (dto.portOfLoading !== undefined) po.portOfLoading = dto.portOfLoading || null;
    if (dto.portOfDischarge !== undefined) po.portOfDischarge = dto.portOfDischarge || null;
    if (dto.shippingLine !== undefined) po.shippingLine = dto.shippingLine || null;
    if (dto.vesselName !== undefined) po.vesselName = dto.vesselName || null;
    if (dto.blAwbNumber !== undefined) po.blAwbNumber = dto.blAwbNumber || null;
    if (dto.containerNumber !== undefined) po.containerNumber = dto.containerNumber || null;
    if (dto.lcTtNumber !== undefined) po.lcTtNumber = dto.lcTtNumber || null;
    if (dto.productionReadyDate !== undefined) po.productionReadyDate = dto.productionReadyDate || null;
    if (dto.etdDate !== undefined) po.etdDate = dto.etdDate || null;
    if (dto.etaDate !== undefined) po.etaDate = dto.etaDate || null;
    if (dto.importStage !== undefined) po.importStage = dto.importStage || null;
    po.updatedBy = userId || null;

    if (dto.lines !== undefined && Array.isArray(dto.lines) && dto.lines.length > 0) {
      const existingLines = await this.lineRepo.find({ where: { poId: id } });
      const existingMap = new Map(existingLines.map(l => [l.id, l]));
      const existingByLineNum = new Map(existingLines.map(l => [l.lineNumber, l]));
      const processedLineIds = new Set<string>();
      let subtotal = 0;

      for (let idx = 0; idx < dto.lines.length; idx++) {
        const lineDto = dto.lines[idx];
        let uomId = lineDto.uomId;
        if (!uomId || uomId.startsWith('00000000-0000-0000-0000-00000000000')) {
          const item = await this.repo.manager.findOne(Item, { where: { id: lineDto.itemId } });
          uomId = item?.purchaseUomId || item?.baseUomId;
          if (!uomId) {
            const firstUom = await this.repo.manager.findOne(Uom, { where: {} });
            uomId = firstUom?.id;
          }
        }

        const totalPrice = Number(lineDto.quantity) * Number(lineDto.unitPrice) * (1 - (Number(lineDto.discountPercent) || 0) / 100);
        let line = (lineDto.id && existingMap.get(lineDto.id)) || existingByLineNum.get(lineDto.lineNumber || idx + 1);

        if (line) {
          line.itemId = lineDto.itemId;
          if (uomId) line.uomId = uomId;
          line.quantity = lineDto.quantity;
          line.unitPrice = lineDto.unitPrice;
          line.discountPercent = lineDto.discountPercent || 0;
          line.totalPrice = totalPrice;
          line.lineNumber = lineDto.lineNumber || idx + 1;
          if (lineDto.warehouseId || po.warehouseId) line.warehouseId = lineDto.warehouseId || po.warehouseId;
          if (lineDto.requiredDate) line.requiredDate = lineDto.requiredDate;
          if (lineDto.notes !== undefined) line.notes = lineDto.notes;
          line.updatedBy = userId || null;
        } else {
          line = this.lineRepo.create({
            poId: id,
            ...lineDto,
            warehouseId: lineDto.warehouseId || po.warehouseId || undefined,
            uomId: uomId || undefined,
            totalPrice,
            createdBy: userId || null,
            updatedBy: userId || null,
          });
        }

        const savedLine = await this.lineRepo.save(line);
        if (lineDto.itemId && Number(lineDto.unitPrice) > 0) {
          try {
            await this.repo.manager.query(
              `UPDATE items SET cost_price = $1, updated_at = NOW() WHERE id = $2`,
              [Number(lineDto.unitPrice), lineDto.itemId],
            );
          } catch { /* ignore */ }
        }
        processedLineIds.add(savedLine.id);
        subtotal += totalPrice;
      }

      for (const oldLine of existingLines) {
        if (!processedLineIds.has(oldLine.id)) {
          try {
            await this.lineRepo.delete({ id: oldLine.id });
          } catch {
            // Keep referenced line intact to prevent constraint violation
          }
        }
      }

      const taxAmount = (subtotal * (po.taxPercent || 0)) / 100;
      const discountAmount = (subtotal * (po.discountPercent || 0)) / 100;
      po.subtotal = subtotal;
      po.taxAmount = taxAmount;
      po.discountAmount = discountAmount;
      po.totalAmount = subtotal + taxAmount - discountAmount + (po.shippingCost || 0);
    }

    await this.repo.save(po);
    return this.findOne(id);
  }

  async findAll(filter: PurchaseOrderFilterDto): Promise<{ data: PurchaseOrder[]; total: number }> {
    const { page = 1, limit = 20, companyId, supplierId, status, origin, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.warehouse', 'warehouse');
    let hasWhere = false;
    if (companyId) { qb.where('po.companyId = :companyId', { companyId }); hasWhere = true; }
    if (supplierId) { qb[hasWhere ? 'andWhere' : 'where']('po.supplierId = :supplierId', { supplierId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('po.status = :status', { status }); hasWhere = true; }
    if (origin && origin !== 'ALL') { qb[hasWhere ? 'andWhere' : 'where']('po.purchaseOrigin = :origin', { origin: origin.toUpperCase() }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(po.poCode ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'poCode', 'orderDate', 'status', 'totalAmount'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`po.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();

    // Aggregate received-vs-ordered per PO (separate query to avoid a cartesian
    // join inflating the row count) so the UI can show delivery fulfilment.
    const poIds = data.map((po) => po.id);
    if (poIds.length > 0) {
      const agg = await this.lineRepo
        .createQueryBuilder('line')
        .leftJoin('line.uom', 'uom')
        .select('line.poId', 'poId')
        .addSelect('COALESCE(SUM(line.quantity), 0)', 'orderedQty')
        .addSelect('COALESCE(SUM(line.receivedQuantity), 0)', 'receivedQty')
        .addSelect('COUNT(line.id)', 'lineCount')
        .addSelect('MAX(uom.code)', 'uomCode')
        .where('line.poId IN (:...poIds)', { poIds })
        .groupBy('line.poId')
        .getRawMany();
      const map = new Map<string, { orderedQty: number; receivedQty: number; lineCount: number; uomCode: string | null }>();
      for (const row of agg) {
        map.set(row.poId, {
          orderedQty: Number(row.orderedQty),
          receivedQty: Number(row.receivedQty),
          lineCount: Number(row.lineCount || 0),
          uomCode: row.uomCode || null,
        });
      }
      const allLines = await this.lineRepo.find({
        where: { poId: In(poIds) },
        relations: ['item', 'uom'],
        order: { lineNumber: 'ASC' },
      });
      const linesByPo = new Map<string, PurchaseOrderLine[]>();
      for (const l of allLines) {
        const list = linesByPo.get(l.poId) || [];
        list.push(l);
        linesByPo.set(l.poId, list);
      }

      for (const po of data) {
        const a = map.get(po.id) || { orderedQty: 0, receivedQty: 0, lineCount: 0, uomCode: null };
        (po as any).orderedQty = a.orderedQty;
        (po as any).receivedQty = a.receivedQty;
        (po as any).lineCount = a.lineCount;
        (po as any).uomCode = a.uomCode;
        po.lines = linesByPo.get(po.id) || [];
      }
    } else {
      for (const po of data) {
        (po as any).orderedQty = 0;
        (po as any).receivedQty = 0;
        (po as any).lineCount = 0;
        (po as any).uomCode = null;
      }
    }

    return { data, total };
  }

  async findOne(id: string): Promise<PurchaseOrder> {
    const po = await this.repo.findOne({
      where: { id },
      relations: ['supplier', 'quotation', 'requisition', 'warehouse', 'lines', 'lines.item', 'lines.uom', 'lines.warehouse', 'importUpdates'],
    });
    if (!po) throw new NotFoundException(`Purchase order with ID '${id}' not found`);
    return po;
  }

  async getImportUpdates(poId: string): Promise<PurchaseOrderImportUpdate[]> {
    return this.importUpdateRepo.find({
      where: { poId },
      order: { createdAt: 'DESC' },
    });
  }

  async addImportUpdate(
    poId: string,
    dto: AddPoImportUpdateDto,
    user?: { id?: string; name?: string },
  ): Promise<{ po: PurchaseOrder; update: PurchaseOrderImportUpdate }> {
    return this.repo.manager.transaction(async (manager) => {
      const poRepo = manager.getRepository(PurchaseOrder);
      const updRepo = manager.getRepository(PurchaseOrderImportUpdate);

      const po = await poRepo.findOne({ where: { id: poId } });
      if (!po) throw new NotFoundException(`Purchase order with ID '${poId}' not found`);

      let previousDate: string | null = null;
      if (dto.milestoneType === 'PRODUCTION' || dto.milestoneType === 'READY_TO_SHIP') {
        previousDate = po.productionReadyDate || null;
        if (dto.newDate) po.productionReadyDate = dto.newDate;
      } else if (dto.milestoneType === 'ETD') {
        previousDate = po.etdDate || null;
        if (dto.newDate) po.etdDate = dto.newDate;
      } else if (dto.milestoneType === 'ETA') {
        previousDate = po.etaDate || null;
        if (dto.newDate) {
          if (po.etaDate && dto.newDate !== po.etaDate) {
            po.etaRevisionCount = (po.etaRevisionCount || 0) + 1;
          }
          po.etaDate = dto.newDate;
          po.expectedDeliveryDate = dto.newDate;
        }
      }

      if (dto.stage) po.importStage = dto.stage;
      if (dto.vesselName !== undefined && dto.vesselName !== '') po.vesselName = dto.vesselName;
      if (dto.blAwbNumber !== undefined && dto.blAwbNumber !== '') po.blAwbNumber = dto.blAwbNumber;
      if (dto.containerNumber !== undefined && dto.containerNumber !== '') po.containerNumber = dto.containerNumber;
      if (dto.lcTtNumber !== undefined && dto.lcTtNumber !== '') po.lcTtNumber = dto.lcTtNumber;
      if (dto.fileNumber !== undefined && dto.fileNumber !== '') po.lcTtNumber = dto.fileNumber;
      po.purchaseOrigin = 'IMPORT';
      po.updatedBy = user?.id || null;
      await poRepo.save(po);

      const existingCount = await updRepo.count({
        where: { poId, milestoneType: dto.milestoneType },
      });

      const update = updRepo.create({
        companyId: po.companyId,
        poId: po.id,
        milestoneType: dto.milestoneType,
        stage: dto.stage || po.importStage || null,
        previousDate,
        newDate: dto.newDate || null,
        locationPort: dto.locationPort || null,
        vesselName: dto.vesselName || po.vesselName || null,
        blAwbNumber: dto.blAwbNumber || po.blAwbNumber || null,
        remarks: dto.remarks || null,
        revisionNumber: existingCount + 1,
        updatedBy: user?.id || null,
        updatedByName: user?.name || null,
      });
      const savedUpdate = await updRepo.save(update);
      return { po, update: savedUpdate };
    });
  }

  async submit(id: string, userId?: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    if (po.status !== 'DRAFT') throw new BadRequestException('Can only submit POs in DRAFT status');
    po.status = 'SUBMITTED';
    po.updatedBy = userId || null;
    return this.repo.save(po);
  }

  async approve(id: string, userId?: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    if (po.status !== 'SUBMITTED' && po.status !== 'DRAFT') {
      throw new BadRequestException('Can only approve POs in DRAFT or SUBMITTED status');
    }
    po.status = 'APPROVED';
    po.approvedBy = userId || null;
    po.approvedAt = new Date();
    po.updatedBy = userId || null;
    return this.repo.save(po);
  }

  async cancel(id: string, reason: string, userId?: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    if (po.status === 'CANCELLED' || po.status === 'CLOSED') {
      throw new BadRequestException('Cannot cancel a PO that is already cancelled or closed');
    }
    po.status = 'CANCELLED';
    po.cancelledBy = userId || null;
    po.cancelledAt = new Date();
    po.cancellationReason = reason;
    po.updatedBy = userId || null;
    return this.repo.save(po);
  }

  async close(id: string, userId?: string): Promise<PurchaseOrder> {
    const po = await this.findOne(id);
    if (po.status !== 'FULLY_RECEIVED' && po.status !== 'FULLY_INVOICED') {
      throw new BadRequestException('Can only close POs that are fully received or invoiced');
    }
    po.status = 'CLOSED';
    po.updatedBy = userId || null;
    return this.repo.save(po);
  }

  async addLine(poId: string, dto: any): Promise<PurchaseOrderLine> {
    const po = await this.findOne(poId);
    if (po.status !== 'DRAFT') throw new BadRequestException('Can only add lines to POs in DRAFT status');
    const line = this.lineRepo.create({
      poId,
      ...dto,
      totalPrice: dto.quantity * dto.unitPrice * (1 - (dto.discountPercent || 0) / 100),
    });
    return this.lineRepo.save(line) as unknown as Promise<PurchaseOrderLine>;
  }

  async removeLine(poId: string, lineId: string): Promise<void> {
    const po = await this.findOne(poId);
    if (po.status !== 'DRAFT') throw new BadRequestException('Can only remove lines from POs in DRAFT status');
    const line = await this.lineRepo.findOne({ where: { id: lineId, poId } });
    if (!line) throw new NotFoundException(`Line with ID '${lineId}' not found`);
    await this.lineRepo.remove(line);
  }

  async remove(id: string): Promise<void> {
    const po = await this.findOne(id);
    if (po.lines && po.lines.length > 0) {
      await this.lineRepo.remove(po.lines);
    }
    await this.repo.remove(po);
  }

  async getLatestItemRates(): Promise<Record<string, { lastPrice: number; orderDate?: string; poCode?: string }>> {
    const lines = await this.lineRepo.query(`
      SELECT DISTINCT ON (pol.item_id) pol.item_id, pol.unit_price, po.order_date, po.po_code
      FROM purchase_order_lines pol
      JOIN purchase_orders po ON po.id = pol.po_id
      ORDER BY pol.item_id, po.order_date DESC, pol.created_at DESC
    `);
    const result: Record<string, { lastPrice: number; orderDate?: string; poCode?: string }> = {};
    if (Array.isArray(lines)) {
      for (const row of lines) {
        result[row.item_id] = {
          lastPrice: Number(row.unit_price) || 0,
          orderDate: row.order_date,
          poCode: row.po_code,
        };
      }
    }
    return result;
  }
}
