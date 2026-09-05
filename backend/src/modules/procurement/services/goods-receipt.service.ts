import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine } from '../entities';
import { CreateGoodsReceiptDto, GoodsReceiptFilterDto } from '../dto';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { Warehouse } from '../../organization/entities/warehouse.entity';

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

    const receipt = this.repo.create({
      ...dto,
      lines: undefined,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(receipt);

    if (dto.lines && dto.lines.length > 0) {
      for (const lineDto of dto.lines) {
        const line = this.lineRepo.create({
          receiptId: saved.id,
          ...lineDto,
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
      .leftJoinAndSelect('gr.po', 'po');
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
    return { data, total };
  }

  async findOne(id: string): Promise<GoodsReceipt> {
    const receipt = await this.repo.findOne({
      where: { id },
      relations: ['supplier', 'po', 'warehouse', 'lines', 'lines.item', 'lines.uom', 'lines.poLine', 'lines.location', 'lines.batch'],
    });
    if (!receipt) throw new NotFoundException(`Goods receipt with ID '${id}' not found`);
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
      const locked = await receiptRepo
        .createQueryBuilder('gr')
        .setLock('pessimistic_write')
        .where('gr.id = :id', { id })
        .leftJoinAndSelect('gr.lines', 'lines')
        .getOne();
      if (!locked) throw new NotFoundException(`Goods receipt with ID '${id}' not found`);
      if (locked.postedAt || locked.postedBy || locked.status === 'POSTED') {
        throw new BadRequestException('Goods receipt has already been posted');
      }
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

      const poLines = await poLineRepo.find({ where: { poId: locked.poId } });
      const byId = new Map(poLines.map((l) => [l.id, l]));
      // Money value of the goods physically accepted into stock this receipt —
      // maintained alongside the existing received-quantity tracking so the PO
      // carries BOTH a received quantity and a received value for reconciliation.
      let receivedMoney = 0;

      for (const line of locked.lines || []) {
        const acceptedQty = Number(line.quantityAccepted || 0);
        if (acceptedQty <= 0) continue;

        await this.stockLedgerService.create({
          companyId: locked.companyId,
          transactionType: 'GOODS_RECEIPT',
          transactionDate: locked.receiptDate || undefined,
          itemId: line.itemId,
          warehouseId: locked.warehouseId,
          locationId: line.locationId || undefined,
          batchId: line.batchId || undefined,
          quantity: acceptedQty,
          uomId: line.uomId,
          direction: 'IN',
          referenceType: GRN_REFERENCE_TYPE,
          referenceId: locked.id,
          referenceNumber: locked.grnNumber || locked.receiptCode,
          notes: `Goods receipt ${locked.receiptCode}`,
          createdBy: userId ?? undefined,
        }, manager);
        await this.inventoryBalanceService.updateBalance(
          locked.companyId, line.itemId, locked.warehouseId,
          line.locationId, line.batchId, line.uomId, acceptedQty, 'IN', manager,
        );

        const poLine = byId.get(line.poLineId);
        if (poLine) {
          const received = Number(poLine.receivedQuantity || 0) + acceptedQty;
          await poLineRepo.update(poLine.id, { receivedQuantity: received });
          byId.set(poLine.id, { ...poLine, receivedQuantity: received });
          receivedMoney += acceptedQty * Number(poLine.unitPrice || 0);
        }
      }

      // Advance the Purchase Order towards FULLY_RECEIVED / PARTIALLY_RECEIVED
      // based on received-vs-ordered quantities, making the existing close()
      // step reachable. The received VALUE (money) is also reflected.
      const updatedLines = await poLineRepo.find({ where: { poId: locked.poId } });
      if (updatedLines.length > 0) {
        const anyReceived = updatedLines.some((l) => Number(l.receivedQuantity || 0) > 0);
        const allReceived = updatedLines.every(
          (l) => Number(l.receivedQuantity || 0) >= Number(l.quantity || 0),
        );
        if (anyReceived || allReceived) {
          const po = await poRepo.findOne({ where: { id: locked.poId } });
          if (po && (po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED' || po.status === 'FULLY_RECEIVED')) {
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
}
