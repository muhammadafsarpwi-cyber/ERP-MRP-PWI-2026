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
    let customer = await this.customerRepo.findOne({
      where: { id: dto.customerId, companyId: dto.companyId },
    });
    if (!customer) {
      customer = await this.customerRepo.findOne({ where: { id: dto.customerId } });
    }
    if (!customer) {
      // Check public.customers and auto-replicate if present
      const pubCust = await this.repo.manager.query(
        'SELECT * FROM public.customers WHERE id = $1',
        [dto.customerId],
      );
      if (pubCust && pubCust.length > 0) {
        const pc = pubCust[0];
        customer = this.customerRepo.create({
          id: pc.id,
          companyId: pc.company_id || dto.companyId,
          customerCode: pc.customer_code,
          companyName: pc.name,
          contactPerson: pc.contact_person,
          email: pc.email,
          phone: pc.phone,
          divisionId: pc.division_id,
          status: pc.status || 'Active',
          isActive: pc.is_active !== false,
          currency: 'PKR',
        });
        await this.customerRepo.save(customer);
      }
    }
    if (!customer) {
      throw new BadRequestException('Customer not found for this company');
    }

    let orderNumber = dto.orderNumber ? String(dto.orderNumber).trim() : '';
    if (!orderNumber && dto.socNumber) {
      orderNumber = String(dto.socNumber).trim();
    }
    if (orderNumber) {
      if (!orderNumber.toUpperCase().startsWith('SOC-') && !orderNumber.toUpperCase().startsWith('SO-')) {
        orderNumber = `SOC-${orderNumber}`;
      }
      const existing = await this.repo.findOne({ where: { companyId: dto.companyId, orderNumber } });
      if (existing) {
        throw new BadRequestException(`Order / SOC Number '${orderNumber}' already exists.`);
      }
    } else {
      orderNumber = await this.generateOrderNumber(dto.companyId, 'SOC-');
    }

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
      divisionId: dto.divisionId && String(dto.divisionId).trim() !== '' ? dto.divisionId : null,
      sectionId: dto.sectionId && String(dto.sectionId).trim() !== '' ? dto.sectionId : null,
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

    const validItems = (dto.items || []).filter(
      (it: any) => it && it.itemId && String(it.itemId).trim() !== '',
    );

    if (validItems.length > 0) {
      let subtotal = 0;
      let lineNumber = 1;
      for (const itemDto of validItems) {
        let uomId = itemDto.uomId;
        if (!uomId) {
          const itm = await this.repo.manager.query('SELECT sales_uom_id, base_uom_id FROM items WHERE id = $1', [itemDto.itemId]);
          if (itm && itm[0]) {
            uomId = itm[0].sales_uom_id || itm[0].base_uom_id;
          }
        }

        const lineTotal = itemDto.lineTotal || itemDto.quantity * itemDto.unitPrice * (1 - (itemDto.discountPercent || 0) / 100);
        const item = this.itemRepo.create({
          salesOrderId: saved.id,
          lineNumber: lineNumber++,
          itemId: itemDto.itemId,
          description: itemDto.description || null,
          quantity: itemDto.quantity,
          uomId: uomId || 'b932052f-141f-4d78-9baf-7025e5302442',
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

  async getCustomers(companyId?: string, divisionId?: string): Promise<SalesCustomer[]> {
    const qb = this.customerRepo.createQueryBuilder('c');
    if (companyId) {
      qb.andWhere('c.companyId = :companyId', { companyId });
    }
    if (divisionId) {
      qb.andWhere('c.divisionId = :divisionId', { divisionId });
    }
    qb.orderBy('c.customerCode', 'ASC');
    return qb.getMany();
  }

  async getNextOrderNumber(companyId: string, prefixType: string = 'SOC-'): Promise<string> {
    return this.generateOrderNumber(companyId, prefixType);
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

    const newOrderNumber = dto.orderNumber || dto.socNumber;
    if (newOrderNumber && typeof newOrderNumber === 'string' && newOrderNumber.trim()) {
      const trimmed = newOrderNumber.trim();
      order.orderNumber = trimmed.toUpperCase().startsWith('SOC-') ? trimmed : `SOC-${trimmed}`;
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
      subtotal: dto.subtotal !== undefined ? Number(dto.subtotal) : order.subtotal,
      discountAmount: dto.discountAmount ?? order.discountAmount,
      taxAmount: dto.taxAmount ?? order.taxAmount,
      freightAmount: dto.freightAmount ?? order.freightAmount,
      totalAmount: dto.totalAmount !== undefined ? Number(dto.totalAmount) : order.totalAmount,
      notes: dto.notes ?? order.notes,
      updatedBy: userId || null,
    });

    if (dto.items !== undefined) {
      const validItems = (dto.items || []).filter(
        (it: any) => it && it.itemId && String(it.itemId).trim() !== '',
      );

      await this.itemRepo.delete({ salesOrderId: order.id });
      if (validItems.length > 0) {
        let subtotal = 0;
        let lineNumber = 1;
        for (const itemDto of validItems) {
          let uomId = itemDto.uomId;
          if (!uomId) {
            const itm = await this.repo.manager.query('SELECT sales_uom_id, base_uom_id FROM items WHERE id = $1', [itemDto.itemId]);
            if (itm && itm[0]) {
              uomId = itm[0].sales_uom_id || itm[0].base_uom_id;
            }
          }

          const lineTotal = itemDto.lineTotal || itemDto.quantity * itemDto.unitPrice * (1 - (itemDto.discountPercent || 0) / 100);
          const item = this.itemRepo.create({
            salesOrderId: order.id,
            lineNumber: lineNumber++,
            itemId: itemDto.itemId,
            description: itemDto.description || null,
            quantity: itemDto.quantity,
            uomId: uomId || 'b932052f-141f-4d78-9baf-7025e5302442',
            unitPrice: itemDto.unitPrice,
            discountPercent: itemDto.discountPercent || 0,
            taxAmount: itemDto.taxAmount || 0,
            lineTotal,
            deliveryDate: itemDto.deliveryDate || null,
          });
          await this.itemRepo.save(item);
          subtotal += lineTotal;
        }
        order.subtotal = Number(subtotal);
        order.totalAmount = Number(subtotal) - Number(order.discountAmount || 0) + Number(order.taxAmount || 0) + Number(order.freightAmount || 0);
      }
    }

    // Detach relations so TypeORM does not attempt cascade updates on child rows
    delete (order as any).items;
    delete (order as any).customer;
    delete (order as any).division;
    delete (order as any).section;
    delete (order as any).quotation;
    delete (order as any).creator;
    delete (order as any).updater;

    await this.repo.save(order);
    return this.findOne(order.id, companyId, allowedDivisionIds);
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

  /**
   * Move a Customer Purchase Order to the Recycle Bin.
   *
   * Draft-only, exactly like the Sales Quotation screen: a confirmed order is
   * a commitment the ERP may have already propagated downstream (a delivery
   * raised from it, a production order spawned from it). Those documents must
   * be cancelled on their own screens first, so the operator gets a refusal
   * that names the reason rather than an order that vanishes while its
   * deliveries still reference it.
   */
  async remove(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId, allowedDivisionIds);
    if ((order.status || '').toLowerCase() !== 'draft') {
      throw new BadRequestException(
        `A ${order.status || 'confirmed'} order has already been committed and cannot be recycled. ` +
          'Cancel it, and cancel any delivery raised from it, first.',
      );
    }
    order.deletedAt = new Date();
    order.deletedBy = userId || null;
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
      const lineInputs = (dto?.lines && dto.lines.length > 0) ? dto.lines : ((dto as any)?.items && (dto as any).items.length > 0 ? (dto as any).items : null);
      if (lineInputs && lineInputs.length > 0) {
        const customLine = lineInputs.find((l: any) => 
          (l.itemId && l.itemId === item.itemId) || 
          (l.salesOrderItemId && l.salesOrderItemId === item.id) ||
          (l.orderItemId && l.orderItemId === item.id)
        );
        if (customLine) {
          const reqQty = Number(customLine.quantity || 0);
          if (reqQty > remaining) {
            throw new BadRequestException(
              `Requested delivery quantity (${reqQty}) exceeds remaining undelivered quantity (${remaining}) for item ${item.item?.name || item.itemId}`,
            );
          }
          deliveryQty = reqQty;
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
      orderItemId?: string;
      salesOrderItemId?: string;
      routingId?: string;
      bomId?: string;
      plannedQuantity?: number;
      rawMaterialWarehouseId?: string;
      finishedGoodsWarehouseId?: string;
      dueDate?: string;
      plannedStartDate?: string;
      plannedEndDate?: string;
      priority?: any;
      remarks?: string;
    },
    userId?: string,
    companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ): Promise<ProductionOrder> {
    const order = await this.findOne(id, companyId, allowedDivisionIds);
    const targetItemId = dto.orderItemId || dto.salesOrderItemId;
    const orderItem = (order.items || []).find((it: any) => it.id === targetItemId || it.itemId === targetItemId);
    if (!orderItem) {
      throw new BadRequestException(`Order line item with ID '${targetItemId || 'unknown'}' not found on order ${order.orderNumber}`);
    }

    const plannedQuantity = Number(dto.plannedQuantity || orderItem.quantity);
    if (plannedQuantity <= 0) {
      throw new BadRequestException('Planned quantity must be greater than zero');
    }

    // Auto-resolve routing if not explicitly supplied
    // Only routings that belong to this exact product are valid — never fall back
    // to an unrelated routing (production-order validation would reject it).
    let routingId = dto.routingId;
    if (!routingId && orderItem.itemId) {
      try {
        const routingRows = await this.repo.manager.query(
          `SELECT id FROM production_routings
            WHERE product_id = $1 AND company_id = $2 AND status = 'ACTIVE'
            ORDER BY is_default DESC, updated_at DESC NULLS LAST
            LIMIT 1`,
          [orderItem.itemId, order.companyId]
        );
        if (routingRows && routingRows.length > 0) {
          routingId = routingRows[0].id;
        }
      } catch (e) {
        this.logger.warn(`Could not auto-resolve routing for item ${orderItem.itemId}: ${e}`);
      }
    }
    if (!routingId) {
      const itemLabel = orderItem.item?.itemCode || orderItem.item?.name || orderItem.itemId || 'this item';
      throw new BadRequestException(
        `No ACTIVE production routing found for product '${itemLabel}'. ` +
        `Please create and activate a routing for this product before planning production.`
      );
    }

    // Auto-resolve BOM if not explicitly supplied
    let bomId = dto.bomId;
    if (!bomId && orderItem.itemId) {
      try {
        const bomRows = await this.repo.manager.query(
          `SELECT id FROM bill_of_materials WHERE product_id = $1 AND status = 'ACTIVE' LIMIT 1`,
          [orderItem.itemId]
        );
        if (bomRows && bomRows.length > 0) {
          bomId = bomRows[0].id;
        }
      } catch (e) {
        this.logger.warn(`Could not auto-resolve BOM for item ${orderItem.itemId}: ${e}`);
      }
    }

    const poDto: any = {
      productId: orderItem.itemId,
      routingId: routingId,
      bomId: bomId || null,
      divisionId: order.divisionId || null,
      plannedQuantity,
      uomId: orderItem.uomId,
      salesOrderItemId: orderItem.id,
      demandSource: ProductionDemandSource.CUSTOMER_ORDER,
      rawMaterialWarehouseId: dto.rawMaterialWarehouseId || null,
      finishedGoodsWarehouseId: dto.finishedGoodsWarehouseId || null,
      plannedStartDate: dto.plannedStartDate || null,
      plannedEndDate: dto.plannedEndDate || null,
      dueDate: dto.dueDate || dto.plannedEndDate || order.deliveryDate || null,
      priority: dto.priority || 'NORMAL',
      remarks: dto.remarks
        ? `Order ${order.orderNumber}: ${dto.remarks}`
        : `Production for Sales Order ${order.orderNumber} (${orderItem.item?.name || 'Line Item'})`,
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

  private async generateOrderNumber(companyId: string, prefixType: string = 'SOC-'): Promise<string> {
    const year = new Date().getFullYear();
    const cleanPrefix = prefixType.endsWith('-') ? prefixType : `${prefixType}-`;
    const fullPrefix = `${cleanPrefix}${year}-`;
    const result = await this.repo
      .createQueryBuilder('so')
      .select("MAX(CAST(SUBSTRING(so.orderNumber FROM '[0-9]+$') AS INT))", 'maxNum')
      .where('so.companyId = :companyId', { companyId })
      .andWhere('(so.orderNumber LIKE :p1 OR so.orderNumber LIKE :p2)', {
        p1: `${fullPrefix}%`,
        p2: `SO-${year}-%`,
      })
      .getRawOne();
    const maxNum = Number(result?.maxNum) || 0;
    const nextNum = maxNum + 1;
    return `${fullPrefix}${String(nextNum).padStart(5, '0')}`;
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
