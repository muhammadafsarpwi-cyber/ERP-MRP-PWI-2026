import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { ProductionOrder, ProductionOrderOperation, ProductionOrderOperationLog, ProductionOrderStatus, ProductionOperationStatus, OperationLogEventType } from '../entities';
import { CreateProductionOrderDto, UpdateProductionOrderDto, CompleteOperationDto, IssueMaterialsDto, CompleteProductionOrderDto } from '../dto';
import { ProductionRouting, RoutingOperation } from '../../production-routing/entities';
import { RoutingStatus } from '../../production-routing/entities';
import { BillOfMaterials, BomLine, BomStatus } from '../../bom/entities';
import { Item, UomConversion } from '../../item/entities';
import { Division, Section, Department, DepartmentDivisionScope, Warehouse } from '../../organization/entities';
import { SalesOrderItem } from '../../sales/entities';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';

const ISSUE_REFERENCE_TYPE = 'PRODUCTION_ORDER';

@Injectable()
export class ProductionOrderService {
  constructor(
    @InjectRepository(ProductionOrder)
    private readonly orderRepo: Repository<ProductionOrder>,
    @InjectRepository(ProductionOrderOperation)
    private readonly operationRepo: Repository<ProductionOrderOperation>,
    @InjectRepository(ProductionOrderOperationLog)
    private readonly logRepo: Repository<ProductionOrderOperationLog>,
    @InjectRepository(ProductionRouting)
    private readonly routingRepo: Repository<ProductionRouting>,
    @InjectRepository(RoutingOperation)
    private readonly routingOpRepo: Repository<RoutingOperation>,
    @InjectRepository(BillOfMaterials)
    private readonly bomRepo: Repository<BillOfMaterials>,
    @InjectRepository(BomLine)
    private readonly bomLineRepo: Repository<BomLine>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(UomConversion)
    private readonly uomConversionRepo: Repository<UomConversion>,
    @InjectRepository(Division)
    private readonly divisionRepo: Repository<Division>,
    @InjectRepository(Section)
    private readonly sectionRepo: Repository<Section>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(DepartmentDivisionScope)
    private readonly scopeRepo: Repository<DepartmentDivisionScope>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepo: Repository<SalesOrderItem>,
    private readonly stockLedgerService: StockLedgerService,
    private readonly inventoryBalanceService: InventoryBalanceService,
  ) {}

  // ─── Queries ────────────────────────────────────────────────────────────────

  async findAll(companyId: string, filters?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: ProductionOrderStatus;
    productId?: string;
    divisionId?: string;
    priority?: string;
  }): Promise<{ data: ProductionOrder[]; total: number }> {
    const { page = 1, limit = 20, search, status, productId, divisionId, priority } = filters || {};

    const qb = this.orderRepo.createQueryBuilder('po')
      .leftJoinAndSelect('po.product', 'product')
      .leftJoinAndSelect('po.routing', 'routing')
      .leftJoinAndSelect('po.bom', 'bom')
      .leftJoinAndSelect('po.division', 'division')
      .leftJoinAndSelect('po.uom', 'uom')
      .where('po.companyId = :companyId', { companyId })
      .andWhere('po.isActive = true');

    if (search) {
      qb.andWhere('(po.orderNumber ILIKE :search OR product.name ILIKE :search)', { search: `%${search}%` });
    }
    if (status) qb.andWhere('po.status = :status', { status });
    if (productId) qb.andWhere('po.productId = :productId', { productId });
    if (divisionId) qb.andWhere('po.divisionId = :divisionId', { divisionId });
    if (priority) qb.andWhere('po.priority = :priority', { priority });

    qb.orderBy('po.createdAt', 'DESC');
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string, companyId: string): Promise<ProductionOrder> {
    const order = await this.orderRepo.findOne({
      where: { id, companyId },
      relations: [
        'product', 'product.baseUom', 'routing', 'bom', 'division', 'uom',
        'rawMaterialWarehouse', 'wipWarehouse', 'finishedGoodsWarehouse',
        'operations', 'operations.division', 'operations.section',
        'operations.department', 'operations.logs',
      ],
      order: { operations: { sequenceNo: 'ASC' } },
    });
    if (!order) throw new NotFoundException(`Production Order with ID '${id}' not found`);
    return order;
  }

  async getRequirements(orderId: string, companyId: string): Promise<any> {
    const order = await this.findOne(orderId, companyId);
    if (!order.bomId) {
      return { orderNumber: order.orderNumber, hasBom: false, lines: [] };
    }

    const lines = await this.bomLineRepo.find({
      where: { bomId: order.bomId },
      relations: ['item', 'uom'],
      order: { lineNumber: 'ASC' },
    });

    const result = [];
    for (const line of lines) {
      const required = await this.computeRequiredQuantity(
        Number(line.quantity),
        Number(order.plannedQuantity),
        Number(line.scrapFactor ?? 0),
        Number(line.yieldPercentage ?? 100),
        line.itemId,
        line.uomId,
      );
      const issued = await this.getIssuedQuantity(order.id, companyId, line.itemId);
      let availableAtWarehouse = 0;
      if (order.rawMaterialWarehouseId) {
        availableAtWarehouse = await this.inventoryBalanceService.getAvailableStock(
          companyId, line.itemId, order.rawMaterialWarehouseId,
        );
      }
      result.push({
        bomLineId: line.id,
        itemId: line.itemId,
        itemCode: line.item?.itemCode,
        itemName: line.item?.name,
        uomCode: line.uom?.code,
        lineQuantityPer: Number(line.quantity),
        scrapFactor: Number(line.scrapFactor ?? 0),
        yieldPercentage: Number(line.yieldPercentage ?? 100),
        requiredQuantity: required,
        issuedQuantity: issued,
        remainingQuantity: Math.max(0, this.round4(required - issued)),
        availableAtWarehouse: this.round4(availableAtWarehouse),
      });
    }

    return { orderNumber: order.orderNumber, hasBom: true, lines: result };
  }

  // ─── Commands ───────────────────────────────────────────────────────────────

  async create(dto: CreateProductionOrderDto, companyId: string, userId?: string): Promise<ProductionOrder> {
    await this.validateProduct(dto.productId, companyId);
    const routing = await this.validateRouting(dto.routingId, companyId, dto.productId);
    if (dto.bomId) await this.validateBom(dto.bomId, companyId, dto.productId);
    await this.assertExists(this.itemRepo, dto.uomId, 'UOM');
    if (dto.salesOrderItemId) await this.validateSalesOrderItem(dto.salesOrderItemId, dto.productId);
    if (dto.divisionId) await this.validateDivision(dto.divisionId);
    for (const wId of [dto.rawMaterialWarehouseId, dto.wipWarehouseId, dto.finishedGoodsWarehouseId]) {
      if (wId) await this.validateWarehouse(wId, companyId);
    }
    if (dto.plannedStartDate && dto.plannedEndDate && dto.plannedStartDate > dto.plannedEndDate) {
      throw new BadRequestException('plannedStartDate must be before plannedEndDate');
    }

    const orderNumber = await this.generateOrderNumber(companyId);

    const order = this.orderRepo.create({
      companyId,
      orderNumber,
      productId: dto.productId,
      routingId: dto.routingId,
      bomId: dto.bomId ?? null,
      divisionId: dto.divisionId ?? null,
      plannedQuantity: dto.plannedQuantity,
      completedQuantity: 0,
      scrappedQuantity: 0,
      uomId: dto.uomId,
      rawMaterialWarehouseId: dto.rawMaterialWarehouseId ?? null,
      wipWarehouseId: dto.wipWarehouseId ?? null,
      finishedGoodsWarehouseId: dto.finishedGoodsWarehouseId ?? null,
      priority: dto.priority ?? ('NORMAL' as any),
      status: ProductionOrderStatus.DRAFT,
      demandSource: dto.demandSource ?? ('MANUAL' as any),
      salesOrderItemId: dto.salesOrderItemId ?? null,
      plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : null,
      plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : null,
      dueDate: dto.dueDate ?? null,
      remarks: dto.remarks ?? null,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    });

    return this.orderRepo.save(order);
  }

  async update(id: string, dto: UpdateProductionOrderDto, companyId: string, userId?: string): Promise<ProductionOrder> {
    const order = await this.getRawOrder(id, companyId);
    if (order.status !== ProductionOrderStatus.DRAFT) {
      throw new BadRequestException(`Only DRAFT production orders can be updated. Current status: ${order.status}`);
    }

    if (dto.bomId !== undefined && dto.bomId !== null) await this.validateBom(dto.bomId, companyId, order.productId);
    if (dto.divisionId) await this.validateDivision(dto.divisionId);
    for (const wId of [dto.rawMaterialWarehouseId, dto.wipWarehouseId, dto.finishedGoodsWarehouseId]) {
      if (wId) await this.validateWarehouse(wId, companyId);
    }
    if (dto.uomId) await this.assertExists(this.itemRepo, dto.uomId, 'UOM');

    Object.assign(order, {
      ...dto,
      plannedStartDate: dto.plannedStartDate ? new Date(dto.plannedStartDate) : order.plannedStartDate,
      plannedEndDate: dto.plannedEndDate ? new Date(dto.plannedEndDate) : order.plannedEndDate,
      updatedBy: userId ?? null,
    });

    return this.orderRepo.save(order);
  }

  async remove(id: string, companyId: string, userId?: string): Promise<void> {
    const order = await this.getRawOrder(id, companyId);
    if (order.status !== ProductionOrderStatus.DRAFT) {
      throw new BadRequestException(`Only DRAFT production orders can be deleted. Current status: ${order.status}`);
    }
    order.isActive = false;
    order.updatedBy = userId ?? null;
    await this.orderRepo.save(order);
  }

  async release(id: string, companyId: string, userId?: string): Promise<ProductionOrder> {
    const order = await this.getRawOrder(id, companyId);
    if (order.status !== ProductionOrderStatus.DRAFT) {
      throw new BadRequestException(`Only DRAFT production orders can be released. Current status: ${order.status}`);
    }

    const routing = await this.validateRouting(order.routingId, companyId, order.productId);
    if (order.bomId) await this.validateBom(order.bomId, companyId, order.productId);

    const existingOps = await this.operationRepo.count({ where: { productionOrderId: order.id } });
    if (existingOps > 0) {
      throw new ConflictException('Production order already contains operations. Cannot release twice.');
    }

    const routingOps = await this.routingOpRepo.find({
      where: { routingId: routing.id, status: 'ACTIVE' },
      order: { sequenceNo: 'ASC' },
    });
    if (routingOps.length === 0) {
      throw new BadRequestException(`Routing '${routing.routingCode}' has no ACTIVE operations to snapshot`);
    }

    const seqSeen = new Set<number>();
    for (const rOp of routingOps) {
      if (seqSeen.has(rOp.sequenceNo)) {
        throw new BadRequestException(`Duplicate sequence_no ${rOp.sequenceNo} in routing '${routing.routingCode}'`);
      }
      seqSeen.add(rOp.sequenceNo);
      await this.validateOperationOrg(rOp.divisionId, rOp.sectionId, rOp.departmentId);
    }

    for (const rOp of routingOps) {
      const op = this.operationRepo.create({
        companyId,
        productionOrderId: order.id,
        routingOperationId: rOp.id,
        sequenceNo: rOp.sequenceNo,
        operationCode: rOp.operationCode,
        operationName: rOp.operationName,
        description: rOp.description ?? null,
        divisionId: rOp.divisionId ?? null,
        sectionId: rOp.sectionId ?? null,
        departmentId: rOp.departmentId ?? null,
        setupTimeMinutes: Number(rOp.setupTimeMinutes ?? 0),
        runTimeMinutes: Number(rOp.runTimeMinutes ?? 0),
        plannedQuantity: Number(order.plannedQuantity),
        inputQuantity: null,
        outputQuantity: null,
        scrappedQuantity: 0,
        uomId: rOp.uomId ?? order.uomId,
        status: ProductionOperationStatus.PENDING,
        remarks: null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      });
      await this.operationRepo.save(op);
    }

    order.status = ProductionOrderStatus.RELEASED;
    order.updatedBy = userId ?? null;
    return this.orderRepo.save(order);
  }

  async startOperation(orderId: string, operationId: string, companyId: string, userId?: string): Promise<ProductionOrderOperation> {
    const order = await this.getRawOrder(orderId, companyId);
    if (order.status !== ProductionOrderStatus.RELEASED && order.status !== ProductionOrderStatus.IN_PROGRESS) {
      throw new BadRequestException(`Operations can only be started on RELEASED or IN_PROGRESS orders. Current status: ${order.status}`);
    }

    const op = await this.getOperation(operationId, order.id);
    if (op.status !== ProductionOperationStatus.PENDING) {
      throw new BadRequestException(`Operation '${op.operationName}' is already ${op.status}. Only PENDING operations can be started.`);
    }

    const preceding = await this.operationRepo.find({
      where: { productionOrderId: order.id, sequenceNo: Not(op.sequenceNo) },
    });
    const blockers = preceding.filter(p => p.sequenceNo < op.sequenceNo && p.status !== ProductionOperationStatus.COMPLETED);
    if (blockers.length > 0) {
      throw new BadRequestException(
        `Cannot start operation ${op.sequenceNo}: preceding operation(s) ${blockers.map(b => b.sequenceNo).sort((a, b) => a - b).join(', ')} are not COMPLETED`,
      );
    }

    const now = new Date();
    op.status = ProductionOperationStatus.IN_PROGRESS;
    op.actualStartDate = now;
    op.updatedBy = userId ?? null;
    const saved = await this.operationRepo.save(op);

    await this.logRepo.save(this.logRepo.create({
      companyId,
      productionOrderOperationId: saved.id,
      eventType: OperationLogEventType.STARTED,
      loggedBy: userId ?? null,
    }));

    if (order.status === ProductionOrderStatus.RELEASED) {
      order.status = ProductionOrderStatus.IN_PROGRESS;
      order.actualStartDate = now;
      order.updatedBy = userId ?? null;
      await this.orderRepo.save(order);
    }

    return saved;
  }

  async completeOperation(orderId: string, operationId: string, dto: CompleteOperationDto, companyId: string, userId?: string): Promise<ProductionOrderOperation> {
    const order = await this.getRawOrder(orderId, companyId);
    if (order.status !== ProductionOrderStatus.IN_PROGRESS) {
      throw new BadRequestException(`Operations can only be completed on IN_PROGRESS orders. Current status: ${order.status}`);
    }

    const op = await this.getOperation(operationId, order.id);
    if (op.status !== ProductionOperationStatus.IN_PROGRESS) {
      throw new BadRequestException(`Operation '${op.operationName}' is ${op.status}. Only IN_PROGRESS operations can be completed.`);
    }

    const { inputQuantity, outputQuantity, scrappedQuantity } = dto;
    const sum = this.round4(outputQuantity + scrappedQuantity);
    if (sum > this.round4(inputQuantity)) {
      throw new BadRequestException(`Invalid quantities: output (${outputQuantity}) + scrap (${scrappedQuantity}) = ${sum} exceeds input (${inputQuantity})`);
    }
    if (inputQuantity <= 0) {
      throw new BadRequestException('inputQuantity must be greater than 0');
    }

    op.inputQuantity = inputQuantity;
    op.outputQuantity = outputQuantity;
    op.scrappedQuantity = scrappedQuantity;
    op.status = ProductionOperationStatus.COMPLETED;
    op.actualEndDate = new Date();
    if (dto.remarks !== undefined) op.remarks = dto.remarks;
    op.updatedBy = userId ?? null;
    const saved = await this.operationRepo.save(op);

    await this.logRepo.save(this.logRepo.create({
      companyId,
      productionOrderOperationId: saved.id,
      eventType: OperationLogEventType.COMPLETED,
      inputQuantity,
      outputQuantity,
      scrappedQuantity,
      notes: dto.remarks ?? null,
      loggedBy: userId ?? null,
    }));

    return saved;
  }

  async completeProductionOrder(orderId: string, dto: CompleteProductionOrderDto, companyId: string, userId?: string): Promise<ProductionOrder> {
    const order = await this.getRawOrder(orderId, companyId);
    if (order.status === ProductionOrderStatus.COMPLETED) {
      throw new ConflictException(`Production Order '${order.orderNumber}' is already COMPLETED. Duplicate receipt rejected.`);
    }
    if (order.status !== ProductionOrderStatus.IN_PROGRESS) {
      throw new BadRequestException(`Only IN_PROGRESS production orders can be completed. Current status: ${order.status}`);
    }

    const ops = await this.operationRepo.find({
      where: { productionOrderId: order.id },
      order: { sequenceNo: 'ASC' },
    });
    if (ops.length === 0) {
      throw new BadRequestException('Production order has no operations');
    }
    const incomplete = ops.filter(o => o.status !== ProductionOperationStatus.COMPLETED);
    if (incomplete.length > 0) {
      throw new BadRequestException(`All operations must be COMPLETED before finishing the order. Pending: ${incomplete.map(o => o.sequenceNo).join(', ')}`);
    }

    const finalOp = ops[ops.length - 1];
    if (this.round4(dto.completedQuantity) !== this.round4(Number(finalOp.outputQuantity))) {
      throw new BadRequestException(
        `completedQuantity (${dto.completedQuantity}) must equal final operation output (${finalOp.outputQuantity})`,
      );
    }

    const fgWarehouseId = dto.finishedGoodsWarehouseId ?? order.finishedGoodsWarehouseId;
    if (!fgWarehouseId) {
      throw new BadRequestException('Finished goods warehouse is required to receive finished goods (set on order or pass in request)');
    }
    await this.validateWarehouse(fgWarehouseId, companyId);

    const totalScrap = this.round4(ops.reduce((s, o) => s + Number(o.scrappedQuantity ?? 0), 0));

    await this.stockLedgerService.create({
      companyId,
      transactionType: 'PRODUCTION_RECEIPT',
      itemId: order.productId,
      warehouseId: fgWarehouseId,
      quantity: dto.completedQuantity,
      uomId: order.uomId,
      direction: 'IN',
      referenceType: ISSUE_REFERENCE_TYPE,
      referenceId: order.id,
      referenceNumber: order.orderNumber,
      notes: dto.remarks ?? `FG receipt from production order ${order.orderNumber}`,
      createdBy: userId ?? undefined,
    });
    await this.inventoryBalanceService.updateBalance(companyId, order.productId, fgWarehouseId, null, null, order.uomId, dto.completedQuantity, 'IN');

    if (totalScrap > 0) {
      await this.stockLedgerService.create({
        companyId,
        transactionType: 'PRODUCTION_SCRAP',
        itemId: order.productId,
        warehouseId: fgWarehouseId,
        quantity: totalScrap,
        uomId: order.uomId,
        direction: 'OUT',
        referenceType: ISSUE_REFERENCE_TYPE,
        referenceId: order.id,
        referenceNumber: order.orderNumber,
        notes: `Scrap recorded during production of ${order.orderNumber} (audit trail; no balance impact)`,
        createdBy: userId ?? undefined,
      });
    }

    order.completedQuantity = dto.completedQuantity;
    order.scrappedQuantity = totalScrap;
    order.status = ProductionOrderStatus.COMPLETED;
    order.actualEndDate = new Date();
    if (dto.remarks !== undefined) order.remarks = dto.remarks;
    order.updatedBy = userId ?? null;

    return this.orderRepo.save(order);
  }

  async cancel(id: string, companyId: string, userId?: string): Promise<ProductionOrder> {
    const order = await this.getRawOrder(id, companyId);
    if (order.status !== ProductionOrderStatus.DRAFT && order.status !== ProductionOrderStatus.RELEASED) {
      throw new BadRequestException(`Only DRAFT or RELEASED production orders can be cancelled. Current status: ${order.status}`);
    }

    const ops = await this.operationRepo.count({
      where: { productionOrderId: order.id, status: Not(ProductionOperationStatus.PENDING) },
    });
    if (ops > 0) {
      throw new BadRequestException('Cannot cancel an order with started or completed operations');
    }

    order.status = ProductionOrderStatus.CANCELLED;
    order.updatedBy = userId ?? null;
    return this.orderRepo.save(order);
  }

  async issueMaterials(orderId: string, dto: IssueMaterialsDto, companyId: string, userId?: string): Promise<any> {
    const order = await this.getRawOrder(orderId, companyId);
    if (order.status !== ProductionOrderStatus.RELEASED && order.status !== ProductionOrderStatus.IN_PROGRESS) {
      throw new BadRequestException(`Materials can only be issued against RELEASED or IN_PROGRESS orders. Current status: ${order.status}`);
    }
    if (!order.bomId) {
      throw new BadRequestException(`Production Order '${order.orderNumber}' has no BOM linked; material requirements cannot be validated`);
    }
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('At least one material issue line is required');
    }

    const results = [];
    for (const lineDto of dto.lines) {
      const bomLine = await this.bomLineRepo.findOne({
        where: { id: lineDto.bomLineId, bomId: order.bomId },
        relations: ['item', 'uom'],
      });
      if (!bomLine) {
        throw new NotFoundException(`BOM line '${lineDto.bomLineId}' does not belong to the production order's BOM`);
      }

      const required = await this.computeRequiredQuantity(
        Number(bomLine.quantity),
        Number(order.plannedQuantity),
        Number(bomLine.scrapFactor ?? 0),
        Number(bomLine.yieldPercentage ?? 100),
        bomLine.itemId,
        bomLine.uomId,
      );
      const issuedBefore = await this.getIssuedQuantity(order.id, companyId, bomLine.itemId);
      const issuedAfter = this.round4(issuedBefore + lineDto.quantity);
      if (issuedAfter > required + 0.0001) {
        throw new BadRequestException(
          `Over-issue rejected for item '${bomLine.item?.itemCode ?? bomLine.itemId}': required ${required}, already issued ${issuedBefore}, attempted total ${issuedAfter}`,
        );
      }

      const warehouseId = lineDto.warehouseId ?? order.rawMaterialWarehouseId;
      if (!warehouseId) {
        throw new BadRequestException('No raw material warehouse specified on line or production order');
      }
      await this.validateWarehouse(warehouseId, companyId);

      const available = await this.inventoryBalanceService.getAvailableStock(
        companyId, bomLine.itemId, warehouseId, lineDto.locationId, lineDto.batchId,
      );
      if (available < lineDto.quantity) {
        throw new BadRequestException(
          `Insufficient stock for item '${bomLine.item?.itemCode ?? bomLine.itemId}' in warehouse: available ${available}, requested ${lineDto.quantity}`,
        );
      }

      const ledgerEntry = await this.stockLedgerService.create({
        companyId,
        transactionType: 'PRODUCTION_ISSUE',
        itemId: bomLine.itemId,
        warehouseId,
        locationId: lineDto.locationId,
        batchId: lineDto.batchId,
        quantity: lineDto.quantity,
        uomId: bomLine.uomId,
        direction: 'OUT',
        referenceType: ISSUE_REFERENCE_TYPE,
        referenceId: order.id,
        referenceNumber: order.orderNumber,
        notes: `Material issue against production order ${order.orderNumber}`,
        createdBy: userId ?? undefined,
      });
      await this.inventoryBalanceService.updateBalance(
        companyId, bomLine.itemId, warehouseId, lineDto.locationId ?? null, lineDto.batchId ?? null, bomLine.uomId, lineDto.quantity, 'OUT',
      );

      results.push({
        ledgerId: ledgerEntry.id,
        bomLineId: bomLine.id,
        itemId: bomLine.itemId,
        itemCode: bomLine.item?.itemCode,
        quantityIssued: lineDto.quantity,
        issuedTotal: issuedAfter,
        requiredTotal: required,
        remainingRequired: Math.max(0, this.round4(required - issuedAfter)),
      });
    }

    return { orderNumber: order.orderNumber, issues: results };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private round4(n: number): number {
    return Math.round(n * 10000) / 10000;
  }

  private async getRawOrder(id: string, companyId: string): Promise<ProductionOrder> {
    const order = await this.orderRepo.findOne({ where: { id, companyId } });
    if (!order) throw new NotFoundException(`Production Order with ID '${id}' not found`);
    return order;
  }

  private async getOperation(operationId: string, orderId: string): Promise<ProductionOrderOperation> {
    const op = await this.operationRepo.findOne({ where: { id: operationId, productionOrderId: orderId } });
    if (!op) throw new NotFoundException(`Operation '${operationId}' not found on this production order`);
    return op;
  }

  private async assertExists(repo: Repository<any>, id: string, label: string): Promise<void> {
    const found = await repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`${label} with ID '${id}' not found`);
  }

  private async validateProduct(productId: string, companyId: string): Promise<Item> {
    const item = await this.itemRepo.findOne({ where: { id: productId, companyId } });
    if (!item) throw new NotFoundException(`Product item with ID '${productId}' not found in this company`);
    if (!item.isManufacturable) {
      throw new BadRequestException(`Item '${item.itemCode}' is not flagged as manufacturable`);
    }
    return item;
  }

  private async validateRouting(routingId: string, companyId: string, productId: string): Promise<ProductionRouting> {
    const routing = await this.routingRepo.findOne({ where: { id: routingId, companyId }, relations: ['product'] });
    if (!routing) throw new NotFoundException(`Production Routing with ID '${routingId}' not found in this company`);
    if (routing.productId !== productId) {
      throw new BadRequestException(`Routing '${routing.routingCode}' does not belong to the selected product`);
    }
    return routing;
  }

  private async validateBom(bomId: string, companyId: string, productId: string): Promise<BillOfMaterials> {
    const bom = await this.bomRepo.findOne({ where: { id: bomId, companyId } });
    if (!bom) throw new NotFoundException(`BOM with ID '${bomId}' not found in this company`);
    if (bom.productId !== productId) {
      throw new BadRequestException(`BOM '${bom.bomCode}' belongs to a different product than the production order`);
    }
    return bom;
  }

  private async validateDivision(divisionId: string): Promise<Division> {
    const division = await this.divisionRepo.findOne({ where: { id: divisionId } });
    if (!division) throw new NotFoundException(`Division with ID '${divisionId}' not found`);
    if (division.status !== 'ACTIVE') throw new BadRequestException(`Division '${division.divisionCode}' is not ACTIVE`);
    return division;
  }

  private async validateWarehouse(warehouseId: string, companyId: string): Promise<Warehouse> {
    const wh = await this.warehouseRepo.findOne({ where: { id: warehouseId, companyId } });
    if (!wh) throw new NotFoundException(`Warehouse with ID '${warehouseId}' not found in this company`);
    if (wh.status !== 'ACTIVE') throw new BadRequestException(`Warehouse '${wh.warehouseCode}' is not ACTIVE`);
    return wh;
  }

  private async validateSalesOrderItem(salesOrderItemId: string, productId: string): Promise<SalesOrderItem> {
    const soi = await this.salesOrderItemRepo.findOne({ where: { id: salesOrderItemId } });
    if (!soi) throw new NotFoundException(`Sales order item with ID '${salesOrderItemId}' not found`);
    if (soi.itemId && soi.itemId !== productId) {
      throw new BadRequestException('Sales order line refers to a different product than the production order');
    }
    return soi;
  }

  private async validateOperationOrg(divisionId?: string | null, sectionId?: string | null, departmentId?: string | null): Promise<void> {
    if (divisionId) {
      const division = await this.divisionRepo.findOne({ where: { id: divisionId } });
      if (!division) throw new NotFoundException(`Division with ID '${divisionId}' not found for routing operation`);
      if (division.status !== 'ACTIVE') throw new BadRequestException(`Division '${division.divisionCode}' referenced by routing operation is not ACTIVE`);
    }

    if (sectionId) {
      const section = await this.sectionRepo.findOne({ where: { id: sectionId } });
      if (!section) throw new NotFoundException(`Section with ID '${sectionId}' not found for routing operation`);
      if (divisionId && section.divisionId !== divisionId) {
        throw new BadRequestException(`Section '${section.name}' does not belong to the operation's division`);
      }
    }

    if (departmentId) {
      const dept = await this.departmentRepo.findOne({ where: { id: departmentId } });
      if (!dept) throw new NotFoundException(`Department with ID '${departmentId}' not found for routing operation`);
      if (dept.status !== 'ACTIVE') throw new BadRequestException(`Department '${dept.departmentCode}' is not ACTIVE`);

      if (dept.divisionId) {
        if (divisionId && dept.divisionId !== divisionId) {
          throw new BadRequestException(`Department '${dept.name}' belongs to a different division than the operation`);
        }
        if (dept.sectionId && sectionId && dept.sectionId !== sectionId) {
          throw new BadRequestException(`Department '${dept.name}' belongs to a different section than the operation`);
        }
      } else if (divisionId) {
        const scope = await this.scopeRepo.findOne({ where: { departmentId: dept.id, divisionId } });
        if (!scope) {
          throw new BadRequestException(
            `Centralized department '${dept.name}' has no scope mapping to the operation's division`,
          );
        }
      }
    }
  }

  private async convertToBase(quantity: number, fromUomId: string | null, toUomId: string): Promise<number> {
    if (!fromUomId || fromUomId === toUomId) return quantity;
    let conv = await this.uomConversionRepo.findOne({ where: { fromUomId, toUomId } });
    if (conv) return quantity * Number(conv.conversionFactor);
    conv = await this.uomConversionRepo.findOne({ where: { fromUomId: toUomId, toUomId: fromUomId } });
    if (conv && Number(conv.conversionFactor) !== 0) return quantity / Number(conv.conversionFactor);
    throw new BadRequestException(`No UOM conversion defined between UOMs '${fromUomId}' and '${toUomId}'`);
  }

  private async computeRequiredQuantity(
    lineQuantity: number,
    orderQuantity: number,
    scrapFactor: number,
    yieldPercentage: number,
    itemId: string,
    lineUomId: string,
  ): Promise<number> {
    const item = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException(`Component item with ID '${itemId}' not found`);
    if (yieldPercentage <= 0) throw new BadRequestException(`yieldPercentage must be greater than 0`);

    let required = lineQuantity * orderQuantity * (1 + scrapFactor) / yieldPercentage * 100;

    if (item.baseUomId) {
      required = await this.convertToBase(required, lineUomId, item.baseUomId);
    }
    return this.round4(required);
  }

  private async getIssuedQuantity(orderId: string, companyId: string, itemId: string): Promise<number> {
    const result = await this.orderRepo.query(
      `SELECT COALESCE(SUM(quantity), 0)::float8 AS total
       FROM stock_ledger
       WHERE reference_type = $1 AND reference_id = $2
         AND company_id = $3 AND item_id = $4 AND direction = 'OUT'
         AND transaction_type = 'PRODUCTION_ISSUE'`,
      [ISSUE_REFERENCE_TYPE, orderId, companyId, itemId],
    );
    return this.round4(Number(result[0]?.total ?? 0));
  }

  private async generateOrderNumber(companyId: string): Promise<string> {
    const rows = await this.orderRepo.query(
      `SELECT order_number FROM production_orders WHERE company_id = $1 AND order_number LIKE 'PO-%'
       ORDER BY created_at DESC LIMIT 200`,
      [companyId],
    );
    let maxSeq = 0;
    for (const row of rows) {
      const match = /^PO-(\d+)$/.exec(row.order_number);
      if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
    }
    return `PO-${String(maxSeq + 1).padStart(6, '0')}`;
  }
}
