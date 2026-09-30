import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  SalesOrder,
  SalesOrderItem,
  SalesCustomer,
  SalesQuotation,
  SalesDelivery,
  SalesDeliveryLine,
  SalesInvoice,
} from '../entities';
import { ProductionOrder, ProductionDemandSource } from '../../production/entities';
import { ProductionOrderService } from '../../production/services/production-order.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { NotificationsService } from '../../notification/notifications.service';
import {
  applyDivisionScopeFilter,
  assertDivisionInScope,
  DivisionAccess,
} from '../../../common/division-scope.util';

@Injectable()
export class SalesOrderService {
  private readonly logger = new Logger(SalesOrderService.name);

  constructor(
    @InjectRepository(SalesOrder)
    private readonly repo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderItem)
    private readonly itemRepo: Repository<SalesOrderItem>,
    @InjectRepository(SalesCustomer)
    private readonly customerRepo: Repository<SalesCustomer>,
    @InjectRepository(SalesQuotation)
    private readonly quotationRepo: Repository<SalesQuotation>,
    @InjectRepository(SalesDelivery)
    private readonly deliveryRepo: Repository<SalesDelivery>,
    @InjectRepository(SalesDeliveryLine)
    private readonly deliveryLineRepo: Repository<SalesDeliveryLine>,
    @InjectRepository(SalesInvoice)
    private readonly invoiceRepo: Repository<SalesInvoice>,
    @InjectRepository(ProductionOrder)
    private readonly productionOrderRepo: Repository<ProductionOrder>,
    @Inject(forwardRef(() => ProductionOrderService))
    private readonly productionOrderService: ProductionOrderService,
    private readonly balanceService: InventoryBalanceService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * PROMPT #27 — a client-supplied `divisionId` on create must land inside the
   * caller's permitted divisions. Without this a restricted caller could create
   * an order attributed to a division they cannot read (and would then be
   * unable to see their own creation).
   */
  async create(dto: any, userId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesOrder> {
    if (dto.divisionId) {
      assertDivisionInScope(dto.divisionId, allowedDivisionIds);
    }
    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId, companyId: dto.companyId },
    });
    if (!customer) {
      throw new BadRequestException('Customer not found for this company');
    }

    const orderNumber = await this.generateOrderNumber(dto.companyId);

    const order = this.repo.create({
      companyId: dto.companyId,
      customerId: dto.customerId,
      customerPo: dto.customerPo || null,
      quotationId: dto.quotationId || null,
      orderNumber,
      orderDate: dto.orderDate || new Date().toISOString().split('T')[0],
      deliveryDate: dto.deliveryDate || null,
      shipToAddress: dto.shipToAddress || null,
      billToAddress: dto.billToAddress || null,
      divisionId: dto.divisionId || null,
      sectionId: dto.sectionId || null,
      currency: dto.currency || 'USD',
      subtotal: dto.subtotal || 0,
      discountAmount: dto.discountAmount || 0,
      taxAmount: dto.taxAmount || 0,
      freightAmount: dto.freightAmount || 0,
      totalAmount: dto.totalAmount || 0,
      notes: dto.notes || null,
      status: 'Draft',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(order);

    if (dto.items && dto.items.length > 0) {
      let subtotal = 0;
      let lineNumber = 1;
      for (const itemDto of dto.items) {
        const lineTotal = itemDto.lineTotal || itemDto.quantity * itemDto.unitPrice * (1 - (itemDto.discountPercent || 0) / 100);
        const item = this.itemRepo.create({
          salesOrderId: saved.id,
          lineNumber: lineNumber++,
          itemId: itemDto.itemId,
          description: itemDto.description || null,
          quantity: itemDto.quantity,
          uomId: itemDto.uomId,
          unitPrice: itemDto.unitPrice,
          discountPercent: itemDto.discountPercent || 0,
          taxAmount: itemDto.taxAmount || 0,
          lineTotal,
          deliveryDate: itemDto.deliveryDate || null,
        });
        await this.itemRepo.save(item);
        subtotal += lineTotal;
      }
      saved.subtotal = Number(subtotal);
      saved.totalAmount = Number(subtotal) - Number(saved.discountAmount || 0) + Number(saved.taxAmount || 0) + Number(saved.freightAmount || 0);
      await this.repo.save(saved);
    }

    await this.notificationsService.notifyActiveUsers({
      type: 'sales_order.created',
      title: 'New sales order created',
      message: `Order ${saved.orderNumber} for ${customer?.companyName || 'a customer'} was created`,
      entityType: 'sales_order',
      entityId: saved.id,
      actorAuthUserId: userId || null,
    });

    return this.findOne(saved.id);
  }

  async findAll(filter: any): Promise<{ data: SalesOrder[]; total: number }> {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 50;
    const {
      companyId, customerId, status, search, divisionId,
      sortField = 'createdAt', sortOrder = 'DESC',
      allowedDivisionIds,
    } = filter;
    const qb = this.repo.createQueryBuilder('so')
      .leftJoinAndSelect('so.customer', 'customer')
      .leftJoinAndSelect('so.division', 'division')
      .leftJoinAndSelect('so.section', 'section')
      .leftJoinAndSelect('so.items', 'items')
      .leftJoinAndSelect('items.item', 'item')
      .leftJoinAndSelect('items.uom', 'uom');
    let hasWhere = false;
    if (companyId) { qb.where('so.companyId = :companyId', { companyId }); hasWhere = true; }
    if (customerId) { qb[hasWhere ? 'andWhere' : 'where']('so.customerId = :customerId', { customerId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('so.status = :status', { status }); hasWhere = true; }
    if (divisionId) { qb[hasWhere ? 'andWhere' : 'where']('so.divisionId = :divisionId', { divisionId }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(so.orderNumber ILIKE :search OR customer.companyName ILIKE :search OR so.customerPo ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    // PROMPT #27 — server-authoritative division scope.
    //
    // The `divisionId` filter above is a client-supplied *display filter*; it
    // must never widen visibility, and `SalesOrderController` now rejects an
    // out-of-scope one with 403 before reaching here. This clause is what makes
    // the list safe when the client omits `divisionId` entirely: a restricted
    // caller can only ever see their own divisions' orders.
    //
    // Not `includeUnassigned`: an order with `division_id IS NULL` belongs to no
    // division, so it is not inside any restricted caller's permitted set and
    // must not be returned. This matches `assertDivisionInScope` below and the
    // convention already proven by the Raw Material Receiving fix.
    applyDivisionScopeFilter(qb as any, 'so.divisionId', allowedDivisionIds);
    const validSortFields = ['createdAt', 'orderNumber', 'orderDate', 'status', 'totalAmount'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`so.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async getCustomers(companyId?: string): Promise<SalesCustomer[]> {
    const where: any = {};
    if (companyId) where.companyId = companyId;
    return this.customerRepo.find({
      where,
      order: { customerCode: 'ASC' },
    });
  }

  async findOne(id: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<any> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const order = await this.repo.findOne({
      where,
      relations: ['customer', 'division', 'section', 'items', 'items.item', 'items.uom'],
    });
    if (!order) throw new NotFoundException(`Sales order with ID '${id}' not found`);

    // PROMPT #27 — by-id reads and every by-id mutation below funnel through
    // this method, so asserting here closes TEST E (guessing another
    // division's order UUID) for all of them at once. Runs AFTER the
    // not-found check so a caller cannot use 403-vs-404 to probe for the
    // existence of records in divisions they cannot read.
    assertDivisionInScope(order.divisionId, allowedDivisionIds);

    let relatedQuotation = null;
    if (order.quotationId) {
      try {
        relatedQuotation = await this.quotationRepo.findOne({
          where: { id: order.quotationId, companyId: order.companyId },
          select: ['id', 'quotationNumber', 'quotationDate', 'status', 'totalAmount'],
        });
      } catch {
        relatedQuotation = null;
      }
    }

    let linkedDeliveries: any[] = [];
    try {
      linkedDeliveries = await this.deliveryRepo.find({
        where: { salesOrderId: order.id, companyId: order.companyId },
        relations: ['lines'],
        order: { createdAt: 'DESC' },
      });
    } catch {
      linkedDeliveries = [];
    }

    let linkedInvoices: any[] = [];
    try {
      linkedInvoices = await this.invoiceRepo.find({
        where: { salesOrderId: order.id, companyId: order.companyId },
        order: { createdAt: 'DESC' },
      });
    } catch {
      linkedInvoices = [];
    }

    let linkedProductionOrders: any[] = [];
    try {
      const orderItemIds = (order.items || []).map((it) => it.id);
      const productIds = (order.items || []).map((it) => it.itemId).filter(Boolean) as string[];
      if (orderItemIds.length > 0 || productIds.length > 0) {
        linkedProductionOrders = await this.productionOrderRepo.find({
          where: [
            ...(orderItemIds.length > 0 ? [{ salesOrderItemId: In(orderItemIds), companyId: order.companyId }] : []),
            ...(productIds.length > 0 ? [{ productId: In(productIds), demandSource: ProductionDemandSource.CUSTOMER_ORDER, companyId: order.companyId }] : []),
          ],
          select: ['id', 'orderNumber', 'productId', 'salesOrderItemId', 'plannedQuantity', 'completedQuantity', 'scrappedQuantity', 'status', 'dueDate', 'createdAt'],
          order: { createdAt: 'DESC' },
        });
      }
    } catch {
      linkedProductionOrders = [];
    }

    // Compute item fulfillment breakdown
    const itemFulfillment = await Promise.all(
      (order.items || []).map(async (item) => {
        const ordered = Number(item.quantity) || 0;

        // Produced from matching production orders
        const matchingPOs = linkedProductionOrders.filter(
          (po) => po.salesOrderItemId === item.id || (po.productId === item.itemId && !po.salesOrderItemId),
        );
        const produced = matchingPOs.reduce((acc, po) => acc + Number(po.completedQuantity || 0), 0);

        // Delivered from confirmed deliveries
        const delivered = linkedDeliveries
          .filter((d) => d.status === 'DELIVERED' || d.status === 'CONFIRMED' || d.status === 'SHIPPED')
          .reduce((acc, d) => {
            const line = (d.lines || []).find((l: any) => l.itemId === item.itemId);
            return acc + (line ? Number(line.quantity) : 0);
          }, 0);

        // Real FG stock available
        let availableStock = 0;
        if (item.itemId) {
          try {
            availableStock = await this.balanceService.getAvailableStock(order.companyId, item.itemId);
          } catch {
            availableStock = 0;
          }
        }

        const remainingDelivery = Math.max(0, ordered - delivered);

        return {
          orderItemId: item.id,
          itemId: item.itemId,
          itemCode: item.item?.itemCode,
          itemName: item.item?.name,
          uomCode: item.uom?.code,
          orderedQuantity: ordered,
          producedQuantity: produced,
          deliveredQuantity: delivered,
          availableStock: Math.max(0, availableStock),
          remainingDeliveryQuantity: remainingDelivery,
        };
      }),
    );

    return Object.assign(order, {
      relatedQuotation,
      linkedProductionOrders,
      linkedDeliveries,
      linkedInvoices,
      itemFulfillment,
    });
  }

  async update(
    id: string, dto: any, userId?: string, companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId, allowedDivisionIds);
    if (order.status !== 'Draft') {
      throw new BadRequestException('Can only update orders in Draft status');
    }

    // PROMPT #27 — a client-supplied `divisionId` in the body must not be able
    // to MOVE an order into (or out of) a division the caller does not hold.
    // The guard validates the body's value up front; this asserts it again at
    // the point of write so the rule holds for any future caller of the service.
    if (dto.divisionId) {
      assertDivisionInScope(dto.divisionId, allowedDivisionIds);
    }

    Object.assign(order, {
      customerId: dto.customerId ?? order.customerId,
      quotationId: dto.quotationId ?? order.quotationId,
      orderDate: dto.orderDate ?? order.orderDate,
      deliveryDate: dto.deliveryDate ?? order.deliveryDate,
      shipToAddress: dto.shipToAddress ?? order.shipToAddress,
      billToAddress: dto.billToAddress ?? order.billToAddress,
      divisionId: dto.divisionId !== undefined ? (dto.divisionId || null) : order.divisionId,
      sectionId: dto.sectionId !== undefined ? (dto.sectionId || null) : order.sectionId,
      currency: dto.currency ?? order.currency,
      discountAmount: dto.discountAmount ?? order.discountAmount,
      taxAmount: dto.taxAmount ?? order.taxAmount,
      freightAmount: dto.freightAmount ?? order.freightAmount,
      notes: dto.notes ?? order.notes,
      updatedBy: userId || null,
    });

    return this.repo.save(order);
  }

  /**
   * PROMPT #27 — `allowedDivisionIds` is threaded through the by-id methods
   * below purely so each forwards it to {@link findOne}, which owns the single
   * division assertion. Every handler is a thin status-transition wrapper, so
   * asserting once in `findOne` covers all of them without duplicating logic.
   */
  async confirm(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId, allowedDivisionIds);
    if (order.status !== 'Draft') throw new BadRequestException('Can only confirm orders in Draft status');
    order.status = 'Confirmed';
    order.updatedBy = userId || null;
    return this.repo.save(order);
  }

  async process(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId, allowedDivisionIds);
    if (order.status !== 'Confirmed') throw new BadRequestException('Can only process orders in Confirmed status');
    order.status = 'Processing';
    order.updatedBy = userId || null;
    return this.repo.save(order);
  }

  async ship(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId, allowedDivisionIds);
    if (order.status !== 'Processing') throw new BadRequestException('Can only ship orders in Processing status');
    order.status = 'Shipped';
    order.updatedBy = userId || null;
    return this.repo.save(order);
  }

  async deliver(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId, allowedDivisionIds);
    if (order.status !== 'Shipped') throw new BadRequestException('Can only deliver orders in Shipped status');
    order.status = 'Delivered';
    order.updatedBy = userId || null;
    return this.repo.save(order);
  }

  async close(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId, allowedDivisionIds);
    if (order.status !== 'Delivered') throw new BadRequestException('Can only close orders in Delivered status');
    order.status = 'Closed';
    order.updatedBy = userId || null;
    return this.repo.save(order);
  }

  async cancel(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId, allowedDivisionIds);
    if (order.status === 'Cancelled' || order.status === 'Closed') {
      throw new BadRequestException('Cannot cancel an order that is already cancelled or closed');
    }
    order.status = 'Cancelled';
    order.updatedBy = userId || null;
    return this.repo.save(order);
  }

  async convertToDelivery(
    id: string,
    dto?: { warehouseId?: string; deliveryDate?: string; carrier?: string; trackingNumber?: string; notes?: string; lines?: Array<{ itemId: string; quantity: number }> },
    userId?: string,
    companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ): Promise<SalesDelivery> {
    const order = await this.findOne(id, companyId, allowedDivisionIds);
    if (order.status !== 'Confirmed' && order.status !== 'Processing') {
      throw new BadRequestException(
        `Sales order must be in 'Confirmed' or 'Processing' status to create a delivery. Current status: ${order.status}`,
      );
    }

    if (!order.items || order.items.length === 0) {
      throw new BadRequestException('Sales order has no line items to deliver');
    }

    const deliveryLinesToCreate: Array<{
      itemId: string;
      quantity: number;
      uomId: string | null;
      unitPrice: number;
      taxAmount: number;
      lineTotal: number;
      description: string | null;
    }> = [];

    let totalSubtotal = 0;
    let totalTax = 0;

    for (const item of order.items) {
      const fulfillment = (order.itemFulfillment || []).find((f: any) => f.orderItemId === item.id);
      const remaining = fulfillment ? fulfillment.remainingDeliveryQuantity : Number(item.quantity);

      if (remaining <= 0) continue;

      let deliveryQty = remaining;
      if (dto?.lines && dto.lines.length > 0) {
        const customLine = dto.lines.find((l) => l.itemId === item.itemId);
        if (customLine) {
          if (customLine.quantity > remaining) {
            throw new BadRequestException(
              `Requested delivery quantity (${customLine.quantity}) exceeds remaining undelivered quantity (${remaining}) for item ${item.item?.name || item.itemId}`,
            );
          }
          deliveryQty = customLine.quantity;
        } else {
          continue; // omitted from partial delivery
        }
      }

      if (deliveryQty <= 0) continue;

      const unitPrice = Number(item.unitPrice) || 0;
      const lineSubtotal = deliveryQty * unitPrice;
      const taxRate = Number(item.taxAmount || 0) / (Number(item.lineTotal || 1) || 1);
      const lineTax = lineSubtotal * taxRate;
      const lineTotal = lineSubtotal + lineTax;

      deliveryLinesToCreate.push({
        itemId: item.itemId,
        quantity: deliveryQty,
        uomId: item.uomId,
        unitPrice,
        taxAmount: lineTax,
        lineTotal,
        description: item.description,
      });

      totalSubtotal += lineSubtotal;
      totalTax += lineTax;
    }

    if (deliveryLinesToCreate.length === 0) {
      throw new BadRequestException('All items in this sales order have already been delivered or delivery quantity is zero');
    }

    const deliveryNumber = await this.generateDeliveryNumber(order.companyId);

    const delivery = this.deliveryRepo.create({
      companyId: order.companyId,
      salesOrderId: order.id,
      customerId: order.customerId,
      deliveryNumber,
      deliveryDate: dto?.deliveryDate || new Date().toISOString().split('T')[0],
      warehouseId: dto?.warehouseId || null,
      shipToAddress: order.shipToAddress || null,
      carrier: dto?.carrier || null,
      trackingNumber: dto?.trackingNumber || null,
      subtotal: totalSubtotal,
      taxAmount: totalTax,
      totalAmount: totalSubtotal + totalTax,
      status: 'DRAFT',
      notes: dto?.notes || `Created from Sales Order ${order.orderNumber}`,
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const savedDelivery = await this.deliveryRepo.save(delivery);

    let lineNum = 1;
    for (const dLine of deliveryLinesToCreate) {
      const line = this.deliveryLineRepo.create({
        deliveryId: savedDelivery.id,
        lineNumber: lineNum++,
        itemId: dLine.itemId,
        quantity: dLine.quantity,
        uomId: dLine.uomId,
        unitPrice: dLine.unitPrice,
        taxAmount: dLine.taxAmount,
        lineTotal: dLine.lineTotal,
        description: dLine.description,
      });
      await this.deliveryLineRepo.save(line);
    }

    if (order.status === 'Confirmed') {
      order.status = 'Processing';
      await this.repo.save(order);
    }

    return this.deliveryRepo.findOne({
      where: { id: savedDelivery.id },
      relations: ['lines', 'lines.item', 'lines.uom', 'customer', 'salesOrder'],
    }) as Promise<SalesDelivery>;
  }

  async createProductionOrder(
    id: string,
    dto: {
      orderItemId: string;
      routingId: string;
      bomId?: string;
      plannedQuantity?: number;
      rawMaterialWarehouseId?: string;
      finishedGoodsWarehouseId?: string;
      dueDate?: string;
      priority?: any;
      remarks?: string;
    },
    userId?: string,
    companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ): Promise<ProductionOrder> {
    const order = await this.findOne(id, companyId, allowedDivisionIds);
    const orderItem = (order.items || []).find((it: any) => it.id === dto.orderItemId);
    if (!orderItem) {
      throw new BadRequestException(`Order line item with ID '${dto.orderItemId}' not found on order ${order.orderNumber}`);
    }

    const plannedQuantity = Number(dto.plannedQuantity || orderItem.quantity);
    if (plannedQuantity <= 0) {
      throw new BadRequestException('Planned quantity must be greater than zero');
    }

    const poDto: any = {
      productId: orderItem.itemId,
      routingId: dto.routingId,
      bomId: dto.bomId || null,
      plannedQuantity,
      uomId: orderItem.uomId,
      salesOrderItemId: orderItem.id,
      demandSource: ProductionDemandSource.CUSTOMER_ORDER,
      rawMaterialWarehouseId: dto.rawMaterialWarehouseId || null,
      finishedGoodsWarehouseId: dto.finishedGoodsWarehouseId || null,
      dueDate: dto.dueDate || order.deliveryDate || null,
      priority: dto.priority || 'NORMAL',
      remarks: dto.remarks
        ? `Order ${order.orderNumber}: ${dto.remarks}`
        : `Production for Sales Order ${order.orderNumber} (Line #${orderItem.lineNumber || 1})`,
    };

    const newPO = await this.productionOrderService.create(poDto, order.companyId, userId);

    if (order.status === 'Confirmed') {
      order.status = 'Processing';
      await this.repo.save(order);
    }

    return newPO;
  }

  async getOrderTraceability(id: string, companyId?: string, allowedDivisionIds?: DivisionAccess) {
    const order = await this.findOne(id, companyId, allowedDivisionIds);
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      orderStatus: order.status,
      customer: {
        id: order.customerId,
        code: order.customer?.customerCode,
        name: order.customer?.name || order.customer?.companyName,
      },
      quotation: order.relatedQuotation || null,
      productionOrders: order.linkedProductionOrders || [],
      deliveries: order.linkedDeliveries || [],
      invoices: order.linkedInvoices || [],
      itemFulfillment: order.itemFulfillment || [],
    };
  }

  private async generateOrderNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SO-${year}-`;
    const result = await this.repo
      .createQueryBuilder('so')
      .select("MAX(CAST(SUBSTRING(so.orderNumber FROM 'SO-[0-9]{4}-([0-9]+)') AS INT))", 'maxNum')
      .where('so.companyId = :companyId', { companyId })
      .andWhere('so.orderNumber LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne();
    const maxNum = result?.maxNum || 0;
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  }

  private async generateDeliveryNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `DN-${year}-`;
    const result = await this.deliveryRepo
      .createQueryBuilder('sd')
      .select("MAX(CAST(SUBSTRING(sd.deliveryNumber FROM 'DN-[0-9]{4}-([0-9]+)') AS INT))", 'maxNum')
      .where('sd.companyId = :companyId', { companyId })
      .andWhere('sd.deliveryNumber LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne();
    const maxNum = result?.maxNum || 0;
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  }
}
