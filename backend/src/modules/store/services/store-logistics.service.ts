import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { ScrapDisposal } from '../entities/scrap-disposal.entity';
import { StoreGatePass } from '../entities/store-gate-pass.entity';
import { StoreGatePassLine } from '../entities/store-gate-pass-line.entity';
import { StoreTransferNote } from '../entities/store-transfer-note.entity';
import { StoreTransferNoteLine } from '../entities/store-transfer-note-line.entity';
import { Store } from '../entities/store.entity';
import {
  CreateScrapDisposalDto,
  CreateGatePassDto,
  ReceiveGatePassReturnDto,
  CreateTransferNoteDto,
} from '../dto/store.dto';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { InventoryBalance, InventoryPolicy } from '../../inventory/entities';
import { Item, UomConversion } from '../../item/entities';
import {
  applyDivisionScopeFilter,
  assertDivisionInScope,
  DivisionAccess,
} from '../../../common/division-scope.util';

@Injectable()
export class StoreLogisticsService {
  constructor(
    @InjectRepository(ScrapDisposal)
    private readonly scrapDisposalRepo: Repository<ScrapDisposal>,
    @InjectRepository(StoreGatePass)
    private readonly gatePassRepo: Repository<StoreGatePass>,
    @InjectRepository(StoreGatePassLine)
    private readonly gatePassLineRepo: Repository<StoreGatePassLine>,
    @InjectRepository(StoreTransferNote)
    private readonly transferNoteRepo: Repository<StoreTransferNote>,
    @InjectRepository(StoreTransferNoteLine)
    private readonly transferNoteLineRepo: Repository<StoreTransferNoteLine>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    private readonly stockLedgerService: StockLedgerService,
    private readonly inventoryBalanceService: InventoryBalanceService,
  ) {}

  private assertCompanyOwned(record: { companyId?: string | null }, companyId?: string, resource = 'Record'): void {
    if (companyId && record.companyId && record.companyId !== companyId) {
      throw new ForbiddenException(`${resource} belongs to a different company`);
    }
  }

  private async convertToBaseUom(
    manager: EntityManager,
    itemId: string,
    uomId: string,
    quantity: number,
  ): Promise<{ postQty: number; postUomId: string; itemName: string }> {
    let postQty = quantity;
    let postUomId = uomId;
    let itemName = itemId;

    const item = await manager.getRepository(Item).findOne({ where: { id: itemId } });
    if (item) {
      itemName = item.name || item.itemCode || itemId;
      if (item.baseUomId && uomId && item.baseUomId !== uomId) {
        const conv = await manager.getRepository(UomConversion).findOne({
          where: { fromUomId: uomId, toUomId: item.baseUomId },
        });
        if (conv && Number(conv.conversionFactor) > 0) {
          postQty = quantity * Number(conv.conversionFactor);
          postUomId = item.baseUomId;
        }
      }
    }
    return { postQty, postUomId, itemName };
  }

  // ==================== SCRAP DISPOSALS ====================

  async findAllScrapDisposals(
    companyId: string,
    query?: { status?: string; storeId?: string; dateFrom?: string; dateTo?: string; limit?: number | string; allDates?: boolean | string },
    allowedDivisionIds?: DivisionAccess,
  ) {
    const qb = this.scrapDisposalRepo
      .createQueryBuilder('sd')
      .where('sd.company_id = :companyId', { companyId });
    applyDivisionScopeFilter(qb, 'sd.division_id', allowedDivisionIds);
    if (query?.status) qb.andWhere('sd.status = :status', { status: query.status });
    if (query?.storeId) qb.andWhere('sd.store_id = :storeId', { storeId: query.storeId });
    if (query?.dateFrom) qb.andWhere('sd.created_at >= :dateFrom', { dateFrom: query.dateFrom });
    if (query?.dateTo) qb.andWhere('sd.created_at <= :dateTo', { dateTo: query.dateTo });
    const hasExplicitWindow = Boolean(query?.dateFrom || query?.dateTo || query?.status || query?.allDates === true || query?.allDates === 'true');
    if (!hasExplicitWindow) {
      qb.andWhere("(sd.created_at >= :recentSince OR sd.status = 'DRAFT')", {
        recentSince: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      });
    }
    qb.orderBy('sd.created_at', 'DESC');
    const safeLimit = Math.min(Math.max(Number(query?.limit) || 200, 1), 500);
    if (typeof (qb as any).take === 'function') (qb as any).take(safeLimit);
    return qb.getMany();
  }

  async createScrapDisposal(dto: CreateScrapDisposalDto, userId: string, companyId: string) {
    let warehouseId = dto.warehouseId || null;
    if (!warehouseId && dto.storeId) {
      const store = await this.storeRepo.findOne({ where: { id: dto.storeId } });
      if (store) warehouseId = store.warehouseId;
    }

    const qty = Number(dto.quantity || 0);
    const rate = Number(dto.auctionRate || 0);
    const totalValue = dto.totalValue !== undefined ? Number(dto.totalValue) : Number((qty * rate).toFixed(2));

    const record = this.scrapDisposalRepo.create({
      ...dto,
      companyId,
      warehouseId,
      quantity: qty,
      auctionRate: rate,
      totalValue,
      status: 'DRAFT',
      createdBy: userId,
    });
    return this.scrapDisposalRepo.save(record);
  }

  async completeScrapDisposal(
    id: string,
    userId: string,
    companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ) {
    return this.scrapDisposalRepo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ScrapDisposal);
      const locked = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException(`Scrap disposal ${id} not found`);
      this.assertCompanyOwned(locked, companyId, 'Scrap disposal');
      assertDivisionInScope(locked.divisionId, allowedDivisionIds);
      if (locked.status !== 'DRAFT') {
        throw new BadRequestException('Only DRAFT scrap disposals can be completed');
      }

      const qty = Number(locked.quantity || 0);
      let warehouseId = locked.warehouseId;
      if (!warehouseId && locked.storeId) {
        const store = await manager.getRepository(Store).findOne({ where: { id: locked.storeId } });
        warehouseId = store?.warehouseId || null;
      }

      if (warehouseId && locked.itemId) {
        const balRepo = manager.getRepository(InventoryBalance);
        const balRows = await balRepo
          .createQueryBuilder('ib')
          .setLock('pessimistic_write')
          .where('ib.company_id = :companyId AND ib.item_id = :itemId AND ib.warehouse_id = :warehouseId', {
            companyId: locked.companyId,
            itemId: locked.itemId,
            warehouseId,
          })
          .getMany();

        const totalScrap = balRows.reduce((sum, r) => sum + Number(r.scrapQty || 0), 0);
        if (totalScrap < qty) {
          throw new BadRequestException(
            `Insufficient scrap drum balance for disposal: available ${totalScrap}, requested ${qty}`,
          );
        }

        let remainingToDeduct = qty;
        for (const bal of balRows) {
          if (remainingToDeduct <= 0) break;
          const avail = Number(bal.scrapQty || 0);
          if (avail <= 0) continue;
          const take = Math.min(avail, remainingToDeduct);
          bal.scrapQty = Number((avail - take).toFixed(4));
          remainingToDeduct -= take;
          await balRepo.save(bal);
        }

        if (locked.uomId) {
          await this.stockLedgerService.create({
            companyId: locked.companyId,
            transactionType: 'SCRAP_DISPOSAL',
            transactionDate: new Date(),
            itemId: locked.itemId,
            warehouseId,
            quantity: qty,
            uomId: locked.uomId,
            direction: 'OUT',
            referenceType: 'SCRAP_DISPOSAL',
            referenceId: locked.id,
            referenceNumber: locked.disposalCode,
            notes: `Scrap auction disposal to ${locked.buyerName} (Value: ${locked.totalValue})`,
            createdBy: userId,
            divisionId: locked.divisionId,
          }, manager);
        }
      }

      await repo.update(locked.id, {
        status: 'COMPLETED',
        completedBy: userId,
        completedAt: new Date(),
      });

      return repo.findOne({ where: { id: locked.id } });
    });
  }

  // ==================== GATE PASSES (RGP / NRGP) ====================

  async findAllGatePasses(
    companyId: string,
    query?: { passType?: string; status?: string; storeId?: string; dateFrom?: string; dateTo?: string; limit?: number | string; allDates?: boolean | string },
    allowedDivisionIds?: DivisionAccess,
  ) {
    const qb = this.gatePassRepo
      .createQueryBuilder('gp')
      .leftJoinAndSelect('gp.lines', 'lines')
      .where('gp.company_id = :companyId', { companyId });
    applyDivisionScopeFilter(qb, 'gp.division_id', allowedDivisionIds);
    if (query?.passType) qb.andWhere('gp.pass_type = :passType', { passType: query.passType });
    if (query?.status) qb.andWhere('gp.status = :status', { status: query.status });
    if (query?.storeId) qb.andWhere('gp.store_id = :storeId', { storeId: query.storeId });
    if (query?.dateFrom) qb.andWhere('gp.created_at >= :dateFrom', { dateFrom: query.dateFrom });
    if (query?.dateTo) qb.andWhere('gp.created_at <= :dateTo', { dateTo: query.dateTo });
    const hasExplicitWindow = Boolean(query?.dateFrom || query?.dateTo || query?.status || query?.allDates === true || query?.allDates === 'true');
    if (!hasExplicitWindow) {
      qb.andWhere("(gp.created_at >= :recentSince OR gp.status IN ('DRAFT', 'DISPATCHED', 'PARTIALLY_RETURNED'))", {
        recentSince: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      });
    }
    qb.orderBy('gp.created_at', 'DESC');
    const safeLimit = Math.min(Math.max(Number(query?.limit) || 200, 1), 500);
    if (typeof (qb as any).take === 'function') (qb as any).take(safeLimit);

    const rows = await qb.getMany();
    const todayStr = new Date().toISOString().slice(0, 10);
    return rows.map((gp) => {
      if (
        gp.passType === 'RGP' &&
        ['DISPATCHED', 'PARTIALLY_RETURNED'].includes(gp.status) &&
        gp.expectedReturnDate &&
        gp.expectedReturnDate < todayStr
      ) {
        gp.status = 'OVERDUE';
      }
      return gp;
    });
  }

  async createGatePass(dto: CreateGatePassDto, userId: string, companyId: string) {
    if (dto.passType === 'RGP' && !dto.expectedReturnDate) {
      throw new BadRequestException('Expected return date is required for Returnable Gate Pass (RGP)');
    }
    const gp = this.gatePassRepo.create({
      ...dto,
      companyId,
      status: 'DRAFT',
      lines: undefined,
      createdBy: userId,
    });
    const saved = await this.gatePassRepo.save(gp);

    for (let i = 0; i < dto.lines.length; i++) {
      const l = dto.lines[i];
      await this.gatePassLineRepo.save(
        this.gatePassLineRepo.create({
          gatePassId: saved.id,
          lineNumber: i + 1,
          itemId: l.itemId || null,
          itemDescription: l.itemDescription,
          uomId: l.uomId || null,
          quantity: Number(l.quantity),
          returnedQty: 0,
          remarks: l.remarks || null,
        }),
      );
    }

    return this.gatePassRepo.findOne({ where: { id: saved.id }, relations: ['lines'] });
  }

  async dispatchGatePass(
    id: string,
    userId: string,
    companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ) {
    const gp = await this.gatePassRepo.findOne({ where: { id }, relations: ['lines'] });
    if (!gp) throw new NotFoundException(`Gate pass ${id} not found`);
    this.assertCompanyOwned(gp, companyId, 'Gate pass');
    assertDivisionInScope(gp.divisionId, allowedDivisionIds);
    if (gp.status !== 'DRAFT') {
      throw new BadRequestException('Only DRAFT gate passes can be dispatched');
    }

    await this.gatePassRepo.update(id, {
      status: 'DISPATCHED',
      dispatchedBy: userId,
      dispatchedAt: new Date(),
    });
    return this.gatePassRepo.findOne({ where: { id }, relations: ['lines'] });
  }

  async receiveGatePassReturn(
    id: string,
    dto: ReceiveGatePassReturnDto,
    companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ) {
    return this.gatePassRepo.manager.transaction(async (manager) => {
      const gpRepo = manager.getRepository(StoreGatePass);
      const lineRepo = manager.getRepository(StoreGatePassLine);

      const locked = await gpRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException(`Gate pass ${id} not found`);
      this.assertCompanyOwned(locked, companyId, 'Gate pass');
      assertDivisionInScope(locked.divisionId, allowedDivisionIds);
      if (locked.passType !== 'RGP') {
        throw new BadRequestException('Only Returnable Gate Passes (RGP) support return logging');
      }
      if (!['DISPATCHED', 'PARTIALLY_RETURNED', 'OVERDUE'].includes(locked.status)) {
        throw new BadRequestException(`Cannot log return for gate pass in status ${locked.status}`);
      }

      const existingLines = await lineRepo.find({ where: { gatePassId: id } });
      const lineMap = new Map(existingLines.map((l) => [l.id, l]));

      for (const item of dto.lines) {
        const line = lineMap.get(item.lineId);
        if (!line) throw new NotFoundException(`Gate pass line ${item.lineId} not found`);
        const nextReturned = Number(line.returnedQty || 0) + Number(item.returnedQty || 0);
        if (nextReturned > Number(line.quantity || 0)) {
          throw new BadRequestException(
            `Returned quantity (${nextReturned}) exceeds dispatched quantity (${line.quantity}) for ${line.itemDescription}`,
          );
        }
        line.returnedQty = nextReturned;
        await lineRepo.save(line);
      }

      const updatedLines = await lineRepo.find({ where: { gatePassId: id } });
      const allReturned = updatedLines.every((l) => Number(l.returnedQty || 0) >= Number(l.quantity || 0));
      await gpRepo.update(id, {
        status: allReturned ? 'RETURNED' : 'PARTIALLY_RETURNED',
      });

      return gpRepo.findOne({ where: { id }, relations: ['lines'] });
    });
  }

  // ==================== MATERIAL TRANSFER NOTES (MTN) ====================

  async findAllTransferNotes(
    companyId: string,
    query?: { status?: string; storeId?: string; dateFrom?: string; dateTo?: string; limit?: number | string; allDates?: boolean | string },
    allowedDivisionIds?: DivisionAccess,
  ) {
    const qb = this.transferNoteRepo
      .createQueryBuilder('mtn')
      .leftJoinAndSelect('mtn.lines', 'lines')
      .where('mtn.company_id = :companyId', { companyId });
    applyDivisionScopeFilter(qb, 'mtn.from_division_id', allowedDivisionIds);
    if (query?.status) qb.andWhere('mtn.status = :status', { status: query.status });
    if (query?.storeId) {
      qb.andWhere('(mtn.from_store_id = :storeId OR mtn.to_store_id = :storeId)', { storeId: query.storeId });
    }
    if (query?.dateFrom) qb.andWhere('mtn.created_at >= :dateFrom', { dateFrom: query.dateFrom });
    if (query?.dateTo) qb.andWhere('mtn.created_at <= :dateTo', { dateTo: query.dateTo });
    const hasExplicitWindow = Boolean(query?.dateFrom || query?.dateTo || query?.status || query?.allDates === true || query?.allDates === 'true');
    if (!hasExplicitWindow) {
      qb.andWhere("(mtn.created_at >= :recentSince OR mtn.status = 'DRAFT')", {
        recentSince: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      });
    }
    qb.orderBy('mtn.created_at', 'DESC');
    const safeLimit = Math.min(Math.max(Number(query?.limit) || 200, 1), 500);
    if (typeof (qb as any).take === 'function') (qb as any).take(safeLimit);
    return qb.getMany();
  }

  async createTransferNote(dto: CreateTransferNoteDto, userId: string, companyId: string) {
    if (dto.fromStoreId === dto.toStoreId) {
      throw new BadRequestException('Source store and destination store must be different');
    }
    const [fromStore, toStore] = await Promise.all([
      this.storeRepo.findOne({ where: { id: dto.fromStoreId } }),
      this.storeRepo.findOne({ where: { id: dto.toStoreId } }),
    ]);
    if (!fromStore) throw new NotFoundException(`Source store ${dto.fromStoreId} not found`);
    if (!toStore) throw new NotFoundException(`Destination store ${dto.toStoreId} not found`);

    const mtn = this.transferNoteRepo.create({
      ...dto,
      companyId,
      fromDivisionId: dto.fromDivisionId || fromStore.divisionId || null,
      toDivisionId: dto.toDivisionId || toStore.divisionId || null,
      status: 'DRAFT',
      lines: undefined,
      createdBy: userId,
    });
    const saved = await this.transferNoteRepo.save(mtn);

    for (let i = 0; i < dto.lines.length; i++) {
      const l = dto.lines[i];
      await this.transferNoteLineRepo.save(
        this.transferNoteLineRepo.create({
          transferNoteId: saved.id,
          lineNumber: i + 1,
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: Number(l.quantity),
          remarks: l.remarks || null,
        }),
      );
    }

    return this.transferNoteRepo.findOne({ where: { id: saved.id }, relations: ['lines'] });
  }

  async postTransferNote(
    id: string,
    userId: string,
    companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ) {
    return this.transferNoteRepo.manager.transaction(async (manager) => {
      const mtnRepo = manager.getRepository(StoreTransferNote);
      const locked = await mtnRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException(`Material transfer note ${id} not found`);
      this.assertCompanyOwned(locked, companyId, 'Transfer note');
      assertDivisionInScope(locked.fromDivisionId, allowedDivisionIds);
      if (locked.status !== 'DRAFT') {
        throw new BadRequestException('Only DRAFT transfer notes can be posted');
      }

      const lines = await manager.getRepository(StoreTransferNoteLine).find({
        where: { transferNoteId: id },
        order: { lineNumber: 'ASC' },
      });
      if (lines.length === 0) {
        throw new BadRequestException('Cannot post a transfer note with no line items');
      }

      const [fromStore, toStore] = await Promise.all([
        manager.getRepository(Store).findOne({ where: { id: locked.fromStoreId } }),
        manager.getRepository(Store).findOne({ where: { id: locked.toStoreId } }),
      ]);
      if (!fromStore?.warehouseId || !toStore?.warehouseId) {
        throw new BadRequestException('Both source and destination stores must have linked warehouses');
      }

      const policy = await manager.getRepository(InventoryPolicy).findOne({
        where: { companyId: locked.companyId },
      });
      const allowNegative = Boolean(policy?.allowNegativeStock);

      for (const line of lines) {
        const qty = Number(line.quantity || 0);
        if (qty <= 0) continue;

        const { postQty, postUomId, itemName } = await this.convertToBaseUom(
          manager,
          line.itemId,
          line.uomId,
          qty,
        );

        const balRows = await manager
          .getRepository(InventoryBalance)
          .createQueryBuilder('ib')
          .setLock('pessimistic_write')
          .where('ib.company_id = :companyId AND ib.item_id = :itemId AND ib.warehouse_id = :warehouseId', {
            companyId: locked.companyId,
            itemId: line.itemId,
            warehouseId: fromStore.warehouseId,
          })
          .getMany();
        const availableBaseQty = balRows.reduce((sum, r) => sum + Number(r.available || 0), 0);
        if (!allowNegative && availableBaseQty < postQty) {
          throw new BadRequestException(
            `Insufficient stock in ${fromStore.storeName} for ${itemName}: available ${availableBaseQty}, requested ${postQty}`,
          );
        }

        // 1. Deduct from source store warehouse (TRANSFER_OUT)
        await this.stockLedgerService.create({
          companyId: locked.companyId,
          transactionType: 'TRANSFER_OUT',
          transactionDate: new Date(),
          itemId: line.itemId,
          warehouseId: fromStore.warehouseId,
          quantity: postQty,
          uomId: postUomId,
          direction: 'OUT',
          referenceType: 'MATERIAL_TRANSFER_NOTE',
          referenceId: locked.id,
          referenceNumber: locked.mtnNumber,
          notes: `MTN ${locked.mtnNumber} to ${toStore.storeName}`,
          createdBy: userId,
          divisionId: locked.fromDivisionId,
        }, manager);

        await this.inventoryBalanceService.updateBalance(
          locked.companyId, line.itemId, fromStore.warehouseId,
          null, null, postUomId, postQty, 'OUT', manager,
        );

        // 2. Add to destination store warehouse (TRANSFER_IN)
        await this.stockLedgerService.create({
          companyId: locked.companyId,
          transactionType: 'TRANSFER_IN',
          transactionDate: new Date(),
          itemId: line.itemId,
          warehouseId: toStore.warehouseId,
          quantity: postQty,
          uomId: postUomId,
          direction: 'IN',
          referenceType: 'MATERIAL_TRANSFER_NOTE',
          referenceId: locked.id,
          referenceNumber: locked.mtnNumber,
          notes: `MTN ${locked.mtnNumber} from ${fromStore.storeName}`,
          createdBy: userId,
          divisionId: locked.toDivisionId,
        }, manager);

        await this.inventoryBalanceService.updateBalance(
          locked.companyId, line.itemId, toStore.warehouseId,
          null, null, postUomId, postQty, 'IN', manager,
        );
      }

      await mtnRepo.update(locked.id, {
        status: 'POSTED',
        postedBy: userId,
        postedAt: new Date(),
      });

      return mtnRepo.findOne({ where: { id: locked.id }, relations: ['lines'] });
    });
  }
}
