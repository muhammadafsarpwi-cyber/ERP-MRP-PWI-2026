import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine } from '../entities';
import { CreateGoodsReceiptDto, UpdateGoodsReceiptDto, GoodsReceiptFilterDto } from '../dto';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { Item, UomConversion } from '../../item/entities';

const GRN_REFERENCE_TYPE = 'GOODS_RECEIPT';

@Injectable()
export class GoodsReceiptService {
  private readonly logger = new Logger(GoodsReceiptService.name);

  constructor(
    @InjectRepository(GoodsReceipt)
    private readonly repo: Repository<GoodsReceipt>,
    @InjectRepository(GoodsReceiptLine)
    private readonly lineRepo: Repository<GoodsReceiptLine>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLine)
    private readonly poLineRepo: Repository<PurchaseOrderLine>,
    private readonly stockLedgerService: StockLedgerService,
    private readonly inventoryBalanceService: InventoryBalanceService,
  ) {}

  /**
   * Enforce server-derived company ownership for any goods-receipt state
   * transition. The caller passes the company it is authorised for (never a
   * client-supplied value). When provided, a receipt belonging to another
   * company is rejected outright — a user from Company A can never post a
   * Company B receipt / stock.
   */
  private assertCompanyOwned(receipt: GoodsReceipt, companyId?: string): void {
    if (companyId && receipt.companyId !== companyId) {
      throw new ForbiddenException('Goods receipt belongs to a different company');
    }
  }

  async create(dto: CreateGoodsReceiptDto, userId?: string): Promise<GoodsReceipt> {
    const existing = await this.repo.findOne({
      where: { receiptCode: dto.receiptCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(`Receipt code '${dto.receiptCode}' already exists`);
    }

    const { divisionId, purchaseType, lines, poId, ...restDto } = dto;

    // Combine division, origin, and user notes
    const metaParts: string[] = [];
    if (divisionId) metaParts.push(`[Division: ${divisionId}]`);
    if (purchaseType) metaParts.push(`[Origin: ${purchaseType}]`);
    const prefix = metaParts.join(' ');
    const combinedNotes = [prefix, dto.notes].filter(Boolean).join('\n');

    // Clean poId: ensure only valid non-empty string or null is passed
    const cleanPoId = poId && poId.trim().length > 0 ? poId.trim() : null;
    const receipt = this.repo.create({
      ...restDto,
      divisionId: divisionId || null,
      poId: cleanPoId as any,
      notes: combinedNotes || dto.notes || null,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(receipt);

    if (lines && lines.length > 0) {
      for (const lineDto of lines) {
        const { poLineId, locationId, batchId, ...restLine } = lineDto;
        const line = this.lineRepo.create({
          receiptId: saved.id,
          ...restLine,
          poLineId: poLineId && poLineId.trim().length > 0 ? poLineId.trim() : undefined,
          locationId: locationId && locationId.trim().length > 0 ? locationId.trim() : undefined,
          batchId: batchId && batchId.trim().length > 0 ? batchId.trim() : undefined,
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await this.lineRepo.save(line);
      }
    }

    return this.findOne(saved.id);
  }

  async findAll(filter: GoodsReceiptFilterDto): Promise<{ data: GoodsReceipt[]; total: number }> {
    const { page = 1, limit = 20, companyId, poId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('gr')
      .leftJoinAndSelect('gr.supplier', 'supplier')
      .leftJoinAndSelect('gr.po', 'po')
      .leftJoinAndSelect('gr.warehouse', 'warehouse');

    let hasWhere = false;
    if (companyId) { qb.where('gr.companyId = :companyId', { companyId }); hasWhere = true; }
    if (poId) { qb[hasWhere ? 'andWhere' : 'where']('gr.poId = :poId', { poId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('gr.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(gr.receiptCode ILIKE :search OR gr.grnNumber ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'receiptCode', 'receiptDate', 'status'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`gr.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();

    for (const item of data) {
      (item as any).poCode = item.po?.poCode;
      (item as any).supplierName = item.supplier?.name;
      (item as any).warehouseName = item.warehouse?.name;
      (item as any).divisionId = item.divisionId || item.warehouse?.divisionId || (item.notes?.match(/\[Division:\s*([^\]]+)\]/)?.[1]);
    }

    return { data, total };
  }

  async findOne(id: string, companyId?: string): Promise<GoodsReceipt> {
    const receipt = await this.repo.findOne({
      where: { id },
      relations: ['supplier', 'po', 'warehouse', 'lines', 'lines.item', 'lines.uom', 'lines.poLine', 'lines.location', 'lines.batch'],
    });
    if (!receipt) throw new NotFoundException(`Goods receipt with ID '${id}' not found`);
    this.assertCompanyOwned(receipt, companyId);
    (receipt as any).poCode = receipt.po?.poCode;
    (receipt as any).supplierName = receipt.supplier?.name;
    (receipt as any).warehouseName = receipt.warehouse?.name;
    (receipt as any).divisionId = receipt.divisionId || receipt.warehouse?.divisionId || (receipt.notes?.match(/\[Division:\s*([^\]]+)\]/)?.[1]);
    return receipt;
  }

  async receive(id: string, userId?: string, companyId?: string): Promise<GoodsReceipt> {
    const receipt = await this.findOne(id);
    this.assertCompanyOwned(receipt, companyId);
    if (receipt.status !== 'DRAFT') throw new BadRequestException('Can only receive receipts in DRAFT status');
    receipt.status = 'RECEIVED';
    receipt.updatedBy = userId || null;
    return this.repo.save(receipt);
  }

  async inspect(id: string, userId?: string, companyId?: string): Promise<GoodsReceipt> {
    const receipt = await this.findOne(id);
    this.assertCompanyOwned(receipt, companyId);
    if (receipt.status !== 'RECEIVED') throw new BadRequestException('Can only inspect receipts in RECEIVED status');
    receipt.status = 'INSPECTION';
    receipt.inspectedBy = userId || null;
    receipt.inspectedAt = new Date();
    receipt.updatedBy = userId || null;
    return this.repo.save(receipt);
  }

  async accept(id: string, userId?: string, companyId?: string): Promise<GoodsReceipt> {
    const receipt = await this.findOne(id);
    this.assertCompanyOwned(receipt, companyId);
    if (receipt.status !== 'INSPECTION') throw new BadRequestException('Can only accept receipts in INSPECTION status');
    receipt.status = 'ACCEPTED';
    receipt.updatedBy = userId || null;
    return this.repo.save(receipt);
  }

  async reject(id: string, userId?: string, companyId?: string): Promise<GoodsReceipt> {
    const receipt = await this.findOne(id);
    this.assertCompanyOwned(receipt, companyId);
    if (receipt.status !== 'INSPECTION') throw new BadRequestException('Can only reject receipts in INSPECTION status');
    receipt.status = 'REJECTED';
    receipt.updatedBy = userId || null;
    return this.repo.save(receipt);
  }

  /**
   * Post an accepted goods receipt into inventory atomically.
   *
   * Everything — GRN header status flip, every stock-ledger entry, every
   * inventory-balance update, and every Purchase Order received-quantity/value
   * change — happens inside ONE database transaction. If any step fails the
   * whole post rolls back, so the states `Inventory = POSTED` with
   * `GRN = NOT POSTED` (or the reverse) can never occur.
   *
   * Idempotency: the receipt row is re-read with a pessimistic write lock
   * inside the transaction so two concurrent post() calls cannot both pass the
   * status guard. A receipt already carrying postedAt/postedBy (or already
   * POSTED) is rejected — a GRN can never post inventory twice.
   *
   * Organisation scope: the optional companyId is server-derived (never
   * client-supplied). A receipt belonging to another company is rejected, and
   * its warehouse must belong to the same company and be ACTIVE.
   */
  async post(id: string, userId?: string, companyId?: string): Promise<GoodsReceipt> {
    const receipt = await this.findOne(id);
    this.assertCompanyOwned(receipt, companyId);
    if (receipt.status !== 'ACCEPTED' && receipt.status !== 'PARTIALLY_ACCEPTED') {
      throw new BadRequestException('Can only post receipts in ACCEPTED or PARTIALLY_ACCEPTED status');
    }

    await this.repo.manager.transaction(async (manager) => {
      const receiptRepo = manager.getRepository(GoodsReceipt);
      const poLineRepo = manager.getRepository(PurchaseOrderLine);
      const poRepo = manager.getRepository(PurchaseOrder);

      // Re-read the receipt inside the transaction under a write lock so two
      // concurrent post() attempts cannot both observe an unposted status.
      // Locked directly without outer join to prevent PostgreSQL FOR UPDATE join error.
      const locked = await receiptRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException(`Goods receipt with ID '${id}' not found`);
      if (locked.postedAt || locked.postedBy || locked.status === 'POSTED') {
        throw new BadRequestException('Goods receipt has already been posted');
      }
      locked.lines = await manager.getRepository(GoodsReceiptLine).find({ where: { receiptId: id } });
      this.assertCompanyOwned(locked, companyId);

      // Warehouse must belong to the same company and be ACTIVE. Posting must
      // not silently fall through to a random/default warehouse.
      if (!locked.warehouseId) {
        throw new BadRequestException('Goods receipt has no warehouse; cannot post inventory');
      }
      const wh = await manager
        .getRepository(Warehouse)
        .findOne({ where: { id: locked.warehouseId, companyId: locked.companyId } });
      if (!wh) {
        throw new BadRequestException(`Warehouse with ID '${locked.warehouseId}' not found in this company`);
      }
      if (wh.status !== 'ACTIVE') {
        throw new BadRequestException(`Warehouse '${wh.warehouseCode}' is not ACTIVE`);
      }

      const poLines = locked.poId ? await poLineRepo.find({ where: { poId: locked.poId } }) : [];
      const byId = new Map(poLines.map((l) => [l.id, l]));
      // Money value of the goods physically accepted into stock this receipt —
      // maintained alongside the existing received-quantity tracking so the PO
      // carries BOTH a received quantity and a received value for reconciliation.
      let receivedMoney = 0;

      for (const line of locked.lines || []) {
        const acceptedQty = Number(line.quantityAccepted || 0);
        if (acceptedQty <= 0) continue;

        let postQty = acceptedQty;
        let postUomId = line.uomId;

        // Auto-convert to item's base UOM (e.g. Gross to Pieces) when posting to inventory
        if (line.itemId) {
          const item = await manager.getRepository(Item).findOne({ where: { id: line.itemId } });
          if (item && item.baseUomId && line.uomId && item.baseUomId !== line.uomId) {
            const conv = await manager.getRepository(UomConversion).findOne({
              where: { fromUomId: line.uomId, toUomId: item.baseUomId },
            });
            if (conv && Number(conv.conversionFactor) > 0) {
              postQty = acceptedQty * Number(conv.conversionFactor);
              postUomId = item.baseUomId;
            }
          }
        }

        await this.stockLedgerService.create({
          companyId: locked.companyId,
          transactionType: 'RECEIPT',
          transactionDate: locked.receiptDate || undefined,
          itemId: line.itemId,
          warehouseId: locked.warehouseId,
          locationId: line.locationId || undefined,
          batchId: line.batchId || undefined,
          quantity: postQty,
          uomId: postUomId,
          direction: 'IN',
          referenceType: GRN_REFERENCE_TYPE,
          referenceId: locked.id,
          referenceNumber: locked.grnNumber || locked.receiptCode,
          notes: `Goods receipt ${locked.receiptCode}${postQty !== acceptedQty ? ` (${acceptedQty} converted to ${postQty})` : ''}`,
          createdBy: userId ?? undefined,
        }, manager);
        await this.inventoryBalanceService.updateBalance(
          locked.companyId, line.itemId, locked.warehouseId,
          line.locationId, line.batchId, postUomId, postQty, 'IN', manager,
        );

        if (line.poLineId) {
          const poLine = byId.get(line.poLineId);
          if (poLine) {
            const received = Number(poLine.receivedQuantity || 0) + acceptedQty;
            await poLineRepo.update(poLine.id, { receivedQuantity: received });
            byId.set(poLine.id, { ...poLine, receivedQuantity: received });
            receivedMoney += acceptedQty * Number(poLine.unitPrice || 0);
          }
        }
      }

      // Advance the Purchase Order towards FULLY_RECEIVED / PARTIALLY_RECEIVED
      // based on received-vs-ordered quantities, making the existing close()
      // step reachable. The received VALUE (money) is also reflected.
      if (locked.poId) {
        const currentPoId = locked.poId;
        const updatedLines = await poLineRepo.find({ where: { poId: currentPoId } });
        if (updatedLines.length > 0) {
          const anyReceived = updatedLines.some((l) => Number(l.receivedQuantity || 0) > 0);
          const allReceived = updatedLines.every(
            (l) => Number(l.receivedQuantity || 0) >= Number(l.quantity || 0),
          );
          if (anyReceived || allReceived) {
            const po = await poRepo.findOne({ where: { id: currentPoId } });
            if (po && (po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED' || po.status === 'FULLY_RECEIVED' || po.status === 'DRAFT' || po.status === 'SUBMITTED')) {
              // Money value of the goods accepted this receipt (received_quantity is
              // already maintained line-by-line above; keep the PO value in step).
              if (receivedMoney > 0) {
                const newReceivedAmount = Math.round((Number(po.receivedAmount || 0) + receivedMoney) * 100) / 100;
                await poRepo.update(po.id, { receivedAmount: newReceivedAmount });
              }
              const nextStatus = allReceived ? 'FULLY_RECEIVED' : 'PARTIALLY_RECEIVED';
              await poRepo.update(po.id, {
                status: nextStatus,
                receivedBy: userId || null,
                receivedAt: new Date(),
              });
            }
          }
        }
      }

      // GRN header status flip is INSIDE the transaction so a GRN can never be
      // posted without its inventory effect (and vice versa).
      await receiptRepo.update(locked.id, {
        status: 'POSTED',
        postedBy: userId || null,
        postedAt: new Date(),
        updatedBy: userId || null,
      });
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateGoodsReceiptDto, userId?: string, companyId?: string): Promise<GoodsReceipt> {
    const receipt = await this.findOne(id);
    this.assertCompanyOwned(receipt, companyId);

    // Apply header fields to receipt
    if (dto.supplierId !== undefined && dto.supplierId.trim().length > 0) {
      receipt.supplierId = dto.supplierId.trim();
    }
    if (dto.poId !== undefined) {
      receipt.poId = (dto.poId && dto.poId.trim().length > 0 ? dto.poId.trim() : null) as any;
    }
    if (dto.warehouseId !== undefined && dto.warehouseId.trim().length > 0) {
      receipt.warehouseId = dto.warehouseId.trim();
    }
    if (dto.divisionId !== undefined) {
      receipt.divisionId = dto.divisionId && dto.divisionId.trim().length > 0 ? dto.divisionId.trim() : null;
    }
    if (dto.receiptDate !== undefined) {
      receipt.receiptDate = dto.receiptDate ? new Date(dto.receiptDate) : null;
    }
    if (dto.grnNumber !== undefined) receipt.grnNumber = dto.grnNumber;
    if (dto.deliveryNoteNumber !== undefined) receipt.deliveryNoteNumber = dto.deliveryNoteNumber;

    if (dto.divisionId !== undefined || dto.purchaseType !== undefined || dto.notes !== undefined) {
      const metaParts: string[] = [];
      const div = dto.divisionId || receipt.divisionId;
      if (div) metaParts.push(`[Division: ${div}]`);
      if (dto.purchaseType) metaParts.push(`[Origin: ${dto.purchaseType}]`);
      const prefix = metaParts.join(' ');
      const userNotes = dto.notes !== undefined ? dto.notes : receipt.notes?.replace(/\[(Division|Origin):[^\]]+\]\s*/g, '').trim();
      receipt.notes = [prefix, userNotes].filter(Boolean).join('\n') || userNotes || null;
    }

    if (receipt.status === 'POSTED') {
      // For POSTED receipts, header metadata is updated; stock ledger lines are preserved to prevent inventory discrepancy
      receipt.updatedBy = userId || null;
      await this.repo.save(receipt);
      return this.findOne(id);
    }

    const { divisionId, purchaseType, lines, poId, ...restDto } = dto;
    Object.assign(receipt, restDto);
    receipt.updatedBy = userId || null;
    await this.repo.save(receipt);

    if (lines && Array.isArray(lines)) {
      await this.lineRepo.delete({ receiptId: id });
      for (const lineDto of lines) {
        const { poLineId, locationId, batchId, ...restLine } = lineDto;
        const line = this.lineRepo.create({
          receiptId: receipt.id,
          ...restLine,
          poLineId: poLineId && poLineId.trim().length > 0 ? poLineId.trim() : undefined,
          locationId: locationId && locationId.trim().length > 0 ? locationId.trim() : undefined,
          batchId: batchId && batchId.trim().length > 0 ? batchId.trim() : undefined,
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await this.lineRepo.save(line);
      }
    }

    return this.findOne(id);
  }

  async cancel(id: string, userId?: string, companyId?: string): Promise<GoodsReceipt> {
    const receipt = await this.findOne(id);
    this.assertCompanyOwned(receipt, companyId);
    if (receipt.status === 'CANCELLED') {
      throw new BadRequestException('Goods receipt is already cancelled');
    }

    if (receipt.status === 'POSTED') {
      await this.repo.manager.transaction(async (manager) => {
        const locked = await manager.getRepository(GoodsReceipt).findOne({
          where: { id },
          relations: ['lines'],
        });
        if (!locked) throw new NotFoundException('Goods receipt not found');

        for (const line of locked.lines || []) {
          const acceptedQty = Number(line.quantityAccepted || 0);
          if (acceptedQty <= 0) continue;

          let postQty = acceptedQty;
          let postUomId = line.uomId;

          if (line.itemId) {
            const item = await manager.getRepository(Item).findOne({ where: { id: line.itemId } });
            if (item && item.baseUomId && line.uomId && item.baseUomId !== line.uomId) {
              const conv = await manager.getRepository(UomConversion).findOne({
                where: { fromUomId: line.uomId, toUomId: item.baseUomId },
              });
              if (conv && Number(conv.conversionFactor) > 0) {
                postQty = acceptedQty * Number(conv.conversionFactor);
                postUomId = item.baseUomId;
              }
            }
          }

          // Inverse stock movement: OUT of warehouse
          await this.stockLedgerService.create({
            companyId: locked.companyId,
            transactionType: 'ADJUSTMENT',
            transactionDate: new Date(),
            itemId: line.itemId,
            warehouseId: locked.warehouseId,
            locationId: line.locationId || undefined,
            batchId: line.batchId || undefined,
            quantity: postQty,
            uomId: postUomId,
            direction: 'OUT',
            referenceType: GRN_REFERENCE_TYPE,
            referenceId: locked.id,
            referenceNumber: locked.grnNumber || locked.receiptCode,
            notes: `Cancellation reversal for ${locked.receiptCode}`,
            createdBy: userId ?? undefined,
          }, manager);

          await this.inventoryBalanceService.updateBalance(
            locked.companyId, line.itemId, locked.warehouseId,
            line.locationId, line.batchId, postUomId, postQty, 'OUT', manager,
          );

          if (line.poLineId && locked.poId) {
            const poLine = await manager.getRepository(PurchaseOrderLine).findOne({ where: { id: line.poLineId } });
            if (poLine) {
              const newRec = Math.max(0, Number(poLine.receivedQuantity || 0) - acceptedQty);
              await manager.getRepository(PurchaseOrderLine).update(poLine.id, { receivedQuantity: newRec });
            }
          }
        }

        if (locked.poId) {
          const poLines = await manager.getRepository(PurchaseOrderLine).find({ where: { poId: locked.poId } });
          const anyRec = poLines.some(l => Number(l.receivedQuantity || 0) > 0);
          await manager.getRepository(PurchaseOrder).update(locked.poId, {
            status: anyRec ? 'PARTIALLY_RECEIVED' : 'APPROVED',
          });
        }

        await manager.getRepository(GoodsReceipt).update(locked.id, {
          status: 'CANCELLED',
          updatedBy: userId || null,
        });
      });
    } else {
      receipt.status = 'CANCELLED';
      receipt.updatedBy = userId || null;
      await this.repo.save(receipt);
    }

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const receipt = await this.findOne(id);
    if (receipt.status === 'POSTED') {
      throw new BadRequestException('Cannot delete a goods receipt that has already been posted to inventory. Please cancel/reverse it first.');
    }
    await this.lineRepo.delete({ receiptId: id });
    await this.repo.remove(receipt);
  }
}
