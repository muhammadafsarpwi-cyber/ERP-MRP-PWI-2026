import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PurchaseReturn, PurchaseReturnLine } from '../entities';
import { CreatePurchaseReturnDto, PurchaseReturnFilterDto } from '../dto';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';

const RETURN_REFERENCE_TYPE = 'PURCHASE_RETURN';

@Injectable()
export class PurchaseReturnService {
  private readonly logger = new Logger(PurchaseReturnService.name);

  constructor(
    @InjectRepository(PurchaseReturn)
    private readonly repo: Repository<PurchaseReturn>,
    @InjectRepository(PurchaseReturnLine)
    private readonly lineRepo: Repository<PurchaseReturnLine>,
    private readonly stockLedgerService: StockLedgerService,
    private readonly inventoryBalanceService: InventoryBalanceService,
  ) {}

  async create(dto: CreatePurchaseReturnDto, userId?: string): Promise<PurchaseReturn> {
    const existing = await this.repo.findOne({
      where: { returnCode: dto.returnCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(`Return code '${dto.returnCode}' already exists`);
    }

    const purchaseReturn = this.repo.create({
      ...dto,
      lines: undefined,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(purchaseReturn);

    if (dto.lines && dto.lines.length > 0) {
      for (const lineDto of dto.lines) {
        const line = this.lineRepo.create({
          returnId: saved.id,
          ...lineDto,
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await this.lineRepo.save(line);
      }
    }

    return this.findOne(saved.id);
  }

  async findAll(filter: PurchaseReturnFilterDto): Promise<{ data: PurchaseReturn[]; total: number }> {
    const { page = 1, limit = 20, companyId, poId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('pr')
      .leftJoinAndSelect('pr.supplier', 'supplier')
      .leftJoinAndSelect('pr.po', 'po');
    let hasWhere = false;
    if (companyId) { qb.where('pr.companyId = :companyId', { companyId }); hasWhere = true; }
    if (poId) { qb[hasWhere ? 'andWhere' : 'where']('pr.poId = :poId', { poId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('pr.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(pr.returnCode ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'returnCode', 'returnDate', 'status'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`pr.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<PurchaseReturn> {
    const purchaseReturn = await this.repo.findOne({
      where: { id },
      relations: ['supplier', 'po', 'warehouse', 'lines', 'lines.item', 'lines.uom', 'lines.poLine'],
    });
    if (!purchaseReturn) throw new NotFoundException(`Purchase return with ID '${id}' not found`);
    return purchaseReturn;
  }

  async approve(id: string, userId?: string): Promise<PurchaseReturn> {
    const purchaseReturn = await this.findOne(id);
    if (purchaseReturn.status !== 'DRAFT') throw new BadRequestException('Can only approve returns in DRAFT status');
    purchaseReturn.status = 'APPROVED';
    purchaseReturn.approvedBy = userId || null;
    purchaseReturn.approvedAt = new Date();
    purchaseReturn.updatedBy = userId || null;
    return this.repo.save(purchaseReturn);
  }

  async ship(id: string, userId?: string): Promise<PurchaseReturn> {
    const purchaseReturn = await this.findOne(id);
    if (purchaseReturn.status !== 'APPROVED') throw new BadRequestException('Can only ship returns in APPROVED status');
    purchaseReturn.status = 'SHIPPED';
    purchaseReturn.updatedBy = userId || null;
    return this.repo.save(purchaseReturn);
  }

  async complete(id: string, userId?: string): Promise<PurchaseReturn> {
    const purchaseReturn = await this.findOne(id);
    if (purchaseReturn.status !== 'SHIPPED') throw new BadRequestException('Can only complete returns in SHIPPED status');

    // Atomic stock reversal: every returned line actually leaves the warehouse.
    // A goods receipt posts goods IN on acceptance, so a completed purchase
    // return must post the exact reverse (stock ledger OUT entry + inventory
    // balance reduction) or the returned quantity would remain in on-hand
    // stock forever and corrupt inventory reconciliation / MRP. The return is
    // only marked COMPLETED when every line has been reversed — or nothing is.
    await this.repo.manager.transaction(async (manager) => {
      for (const line of purchaseReturn.lines || []) {
        const quantity = Number(line.quantity || 0);
        if (quantity <= 0) continue;

        await this.stockLedgerService.create({
          companyId: purchaseReturn.companyId,
          transactionType: 'PURCHASE_RETURN',
          transactionDate: purchaseReturn.returnDate || undefined,
          itemId: line.itemId,
          warehouseId: purchaseReturn.warehouseId,
          quantity,
          uomId: line.uomId,
          direction: 'OUT',
          referenceType: RETURN_REFERENCE_TYPE,
          referenceId: purchaseReturn.id,
          referenceNumber: purchaseReturn.returnCode,
          notes: `Purchase return ${purchaseReturn.returnCode}`,
          createdBy: userId ?? undefined,
        }, manager);
        await this.inventoryBalanceService.updateBalance(
          purchaseReturn.companyId, line.itemId, purchaseReturn.warehouseId,
          null, null, line.uomId, quantity, 'OUT', manager,
        );
      }
    });

    purchaseReturn.status = 'COMPLETED';
    purchaseReturn.postedBy = userId || null;
    purchaseReturn.postedAt = new Date();
    purchaseReturn.updatedBy = userId || null;
    return this.repo.save(purchaseReturn);
  }

  async cancel(id: string, userId?: string): Promise<PurchaseReturn> {
    const purchaseReturn = await this.findOne(id);
    if (purchaseReturn.status === 'COMPLETED') throw new BadRequestException('Cannot cancel a completed return');
    purchaseReturn.status = 'CANCELLED';
    purchaseReturn.updatedBy = userId || null;
    return this.repo.save(purchaseReturn);
  }
}
