import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseOrder, PurchaseOrderLine } from '../entities';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto, PurchaseOrderFilterDto } from '../dto';
import { Item, Uom } from '../../item/entities';

@Injectable()
export class PurchaseOrderService {
  private readonly logger = new Logger(PurchaseOrderService.name);

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly repo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLine)
    private readonly lineRepo: Repository<PurchaseOrderLine>,
  ) {}

  async create(dto: CreatePurchaseOrderDto, userId?: string): Promise<PurchaseOrder> {
    const existing = await this.repo.findOne({
      where: { poCode: dto.poCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(`PO code '${dto.poCode}' already exists`);
    }

    const po = this.repo.create({
      ...dto,
      lines: undefined,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(po);

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
    if (dto.orderDate !== undefined) po.orderDate = dto.orderDate;
    if (dto.expectedDeliveryDate !== undefined) po.expectedDeliveryDate = dto.expectedDeliveryDate;
    if (dto.deliveryAddress !== undefined) po.deliveryAddress = dto.deliveryAddress;
    if (dto.paymentTerms !== undefined) po.paymentTerms = dto.paymentTerms;
    if (dto.currencyCode !== undefined) po.currencyCode = dto.currencyCode;
    if (dto.taxPercent !== undefined) po.taxPercent = dto.taxPercent;
    if (dto.discountPercent !== undefined) po.discountPercent = dto.discountPercent;
    if (dto.shippingCost !== undefined) po.shippingCost = dto.shippingCost;
    if (dto.notes !== undefined) po.notes = dto.notes;
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
          if (lineDto.warehouseId) line.warehouseId = lineDto.warehouseId;
          if (lineDto.requiredDate) line.requiredDate = lineDto.requiredDate;
          if (lineDto.notes !== undefined) line.notes = lineDto.notes;
          line.updatedBy = userId || null;
        } else {
          line = this.lineRepo.create({
            poId: id,
            ...lineDto,
            uomId: uomId || undefined,
            totalPrice,
            createdBy: userId || null,
            updatedBy: userId || null,
          });
        }

        const savedLine = await this.lineRepo.save(line);
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
    const { page = 1, limit = 20, companyId, supplierId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier');
    let hasWhere = false;
    if (companyId) { qb.where('po.companyId = :companyId', { companyId }); hasWhere = true; }
    if (supplierId) { qb[hasWhere ? 'andWhere' : 'where']('po.supplierId = :supplierId', { supplierId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('po.status = :status', { status }); hasWhere = true; }
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
        .select('line.poId', 'poId')
        .addSelect('COALESCE(SUM(line.quantity), 0)', 'orderedQty')
        .addSelect('COALESCE(SUM(line.receivedQuantity), 0)', 'receivedQty')
        .where('line.poId IN (:...poIds)', { poIds })
        .groupBy('line.poId')
        .getRawMany();
      const map = new Map<string, { orderedQty: number; receivedQty: number }>();
      for (const row of agg) {
        map.set(row.poId, {
          orderedQty: Number(row.orderedQty),
          receivedQty: Number(row.receivedQty),
        });
      }
      for (const po of data) {
        const a = map.get(po.id) || { orderedQty: 0, receivedQty: 0 };
        (po as any).orderedQty = a.orderedQty;
        (po as any).receivedQty = a.receivedQty;
      }
    } else {
      for (const po of data) {
        (po as any).orderedQty = 0;
        (po as any).receivedQty = 0;
      }
    }

    return { data, total };
  }

  async findOne(id: string): Promise<PurchaseOrder> {
    const po = await this.repo.findOne({
      where: { id },
      relations: ['supplier', 'quotation', 'requisition', 'lines', 'lines.item', 'lines.uom', 'lines.warehouse'],
    });
    if (!po) throw new NotFoundException(`Purchase order with ID '${id}' not found`);
    return po;
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
    if (po.status !== 'SUBMITTED') throw new BadRequestException('Can only approve POs in SUBMITTED status');
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
}
