import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesDelivery, SalesDeliveryLine, SalesCustomer, SalesOrder, SalesOrderItem, SalesInvoice } from '../entities';
import { Item, Uom, UomConversion } from '../../item/entities';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import {
  applyDivisionScopeFilter,
  assertDivisionInScope,
  DivisionAccess,
} from '../../../common/division-scope.util';

const isUuid = (val?: string | null): boolean =>
  typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

@Injectable()
export class SalesDeliveryService {
  private readonly logger = new Logger(SalesDeliveryService.name);

  constructor(
    @InjectRepository(SalesDelivery)
    private readonly repo: Repository<SalesDelivery>,
    @InjectRepository(SalesDeliveryLine)
    private readonly lineRepo: Repository<SalesDeliveryLine>,
    @InjectRepository(SalesCustomer)
    private readonly customerRepo: Repository<SalesCustomer>,
    @InjectRepository(SalesOrder)
    private readonly orderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderItem)
    private readonly orderItemRepo: Repository<SalesOrderItem>,
    @InjectRepository(SalesInvoice)
    private readonly invoiceRepo: Repository<SalesInvoice>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Uom)
    private readonly uomRepo: Repository<Uom>,
    @InjectRepository(UomConversion)
    private readonly uomConversionRepo: Repository<UomConversion>,
    private readonly balanceService: InventoryBalanceService,
    private readonly ledgerService: StockLedgerService,
  ) {}

  async create(dto: any, userId?: string): Promise<SalesDelivery> {
    const customer = await this.customerRepo.findOne({
      where: { id: dto.customerId, companyId: dto.companyId },
    });
    if (!customer) {
      throw new BadRequestException('Customer not found for this company');
    }

    if (dto.salesOrderId) {
      const order = await this.orderRepo.findOne({
        where: { id: dto.salesOrderId, companyId: dto.companyId },
      });
      if (!order) {
        throw new BadRequestException('Sales order not found for this company');
      }
    }

    const safeUserId = isUuid(userId) ? userId : null;
    const deliveryNumber = await this.generateDeliveryNumber(dto.companyId);

    const delivery = this.repo.create({
      companyId: dto.companyId,
      salesOrderId: isUuid(dto.salesOrderId) ? dto.salesOrderId : null,
      customerPo: dto.customerPo || null,
      customerId: dto.customerId,
      deliveryNumber,
      deliveryDate: dto.deliveryDate || new Date().toISOString().split('T')[0],
      expectedDate: dto.expectedDate || null,
      warehouseId: isUuid(dto.warehouseId) ? dto.warehouseId : null,
      shipToAddress: dto.shipToAddress || null,
      carrier: dto.carrier || null,
      trackingNumber: dto.trackingNumber || null,
      notes: dto.notes || null,
      status: 'DRAFT',
      createdBy: safeUserId,
      updatedBy: safeUserId,
    });
    const saved = await this.repo.save(delivery) as SalesDelivery;

    if (dto.lines && dto.lines.length > 0) {
      let subtotal = 0;
      let lineNumber = 1;
      for (const lineDto of dto.lines) {
        const lineTotal = lineDto.lineTotal || lineDto.quantity * lineDto.unitPrice;
        const line = this.lineRepo.create({
          deliveryId: saved.id,
          lineNumber: lineNumber++,
          itemId: isUuid(lineDto.itemId) ? lineDto.itemId : null,
          description: lineDto.description || null,
          quantity: lineDto.quantity,
          uomId: isUuid(lineDto.uomId) ? lineDto.uomId : null,
          warehouseId: isUuid(lineDto.warehouseId) ? lineDto.warehouseId : (isUuid(saved.warehouseId) ? saved.warehouseId : null),
          unitPrice: lineDto.unitPrice,
          taxAmount: lineDto.taxAmount || 0,
          lineTotal,
        });
        await this.lineRepo.save(line);
        subtotal += lineTotal;
      }
      saved.subtotal = Number(subtotal);
      saved.totalAmount = Number(subtotal);
      await this.repo.save(saved);
    }

    return this.findOne(saved.id);
  }

  async findAll(filter: any): Promise<{ data: any[]; total: number }> {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 20;
    const {
      companyId, status, search, sortField = 'createdAt', sortOrder = 'DESC',
      allowedDivisionIds,
    } = filter;
    const qb = this.repo.createQueryBuilder('sd')
      .leftJoinAndSelect('sd.customer', 'customer')
      .leftJoinAndSelect('sd.salesOrder', 'salesOrder')
      .leftJoinAndSelect('salesOrder.division', 'division')
      .leftJoinAndSelect('salesOrder.section', 'section')
      .leftJoinAndSelect('sd.lines', 'lines')
      .leftJoinAndSelect('lines.item', 'lineItem')
      .leftJoinAndSelect('lines.uom', 'lineUom')
      .leftJoinAndSelect('salesOrder.items', 'orderItems')
      .leftJoinAndSelect('orderItems.item', 'orderItemObj')
      .leftJoinAndSelect('orderItems.uom', 'orderItemUom');
    let hasWhere = false;
    if (companyId) { qb.where('sd.companyId = :companyId', { companyId }); hasWhere = true; }
    if (status && status.toLowerCase() !== 'all') { qb[hasWhere ? 'andWhere' : 'where']('sd.status ILIKE :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(sd.deliveryNumber ILIKE :search OR customer.companyName ILIKE :search OR salesOrder.orderNumber ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    // PROMPT #27 — `sales_deliveries` has no `division_id`; it inherits the
    // source order's. The `salesOrder` join already existed here for display
    // (`divisionName` below), so enforcing scope costs no extra query.
    applyDivisionScopeFilter(qb as any, 'salesOrder.divisionId', allowedDivisionIds);
    const validSortFields = ['createdAt', 'deliveryNumber', 'deliveryDate', 'status'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`sd.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [rawDeliveries, total] = await qb.getManyAndCount();
    const data = rawDeliveries.map((sd: any) => {
      const lines = (sd.lines || []).map((l: any) => ({
        ...l,
        itemCode: l.item?.itemCode || l.itemCode,
        itemName: l.item?.name || l.itemName || l.description,
        packagingSize: Number(l.item?.packagingSize || 10) || 10,
        packagingUnit: l.item?.packagingUnit || 'CTN',
        uomCode: l.uom?.code || 'GRS',
      }));

      const orderItems = (sd.salesOrder?.items || []).map((oi: any) => ({
        ...oi,
        itemCode: oi.item?.itemCode || oi.itemCode,
        itemName: oi.item?.name || oi.itemName || oi.description,
        packagingSize: Number(oi.item?.packagingSize || 10) || 10,
        packagingUnit: oi.item?.packagingUnit || 'CTN',
        uomCode: oi.uom?.code || 'GRS',
      }));

      // Calculate totals
      const totalDispatchQuantity = lines.reduce((sum: number, l: any) => sum + (Number(l.quantity) || 0), 0);
      const totalOrderQuantity = orderItems.reduce((sum: number, oi: any) => sum + (Number(oi.quantity) || 0), 0);
      const totalDeliveredQuantity = orderItems.reduce((sum: number, oi: any) => sum + (Number(oi.shippedQuantity ?? oi.shipped_quantity) || 0), 0);
      const totalBalanceQuantity = Math.max(0, totalOrderQuantity - totalDeliveredQuantity);
      const isCompleted = totalOrderQuantity > 0 && totalBalanceQuantity <= 0;

      // Calculate cartons
      const totalDispatchCartons = lines.reduce((sum: number, l: any) => {
        const pSize = Number(l.packagingSize || 10) || 10;
        return sum + Math.round(((Number(l.quantity) || 0) / pSize) * 100) / 100;
      }, 0);

      const totalOrderCartons = orderItems.reduce((sum: number, oi: any) => {
        const pSize = Number(oi.packagingSize || 10) || 10;
        return sum + Math.round(((Number(oi.quantity) || 0) / pSize) * 100) / 100;
      }, 0);

      const totalBalanceCartons = orderItems.reduce((sum: number, oi: any) => {
        const pSize = Number(oi.packagingSize || 10) || 10;
        const bal = Math.max(0, (Number(oi.quantity) || 0) - (Number(oi.shippedQuantity ?? oi.shipped_quantity) || 0));
        return sum + Math.round((bal / pSize) * 100) / 100;
      }, 0);

      // Item-level quantities summary
      const itemsSummary = orderItems.map((oi: any) => {
        const pSize = Number(oi.packagingSize || 10) || 10;
        const pUnit = oi.packagingUnit || 'CTN';
        const ordered = Number(oi.quantity) || 0;
        const shipped = Number(oi.shippedQuantity ?? oi.shipped_quantity) || 0;
        const bal = Math.max(0, ordered - shipped);
        const thisLine = lines.find((l: any) => l.itemId === oi.itemId || (l.itemCode && l.itemCode === oi.itemCode));
        const thisDispatched = thisLine ? (Number(thisLine.quantity) || 0) : 0;

        return {
          itemId: oi.itemId,
          itemCode: oi.itemCode || '-',
          itemName: oi.itemName || 'Product',
          orderedQuantity: ordered,
          orderedCartons: Math.round((ordered / pSize) * 100) / 100,
          dispatchedQuantity: thisDispatched,
          dispatchedCartons: Math.round((thisDispatched / pSize) * 100) / 100,
          totalShippedQuantity: shipped,
          totalShippedCartons: Math.round((shipped / pSize) * 100) / 100,
          balanceQuantity: bal,
          balanceCartons: Math.round((bal / pSize) * 100) / 100,
          isCompleted: ordered > 0 && bal <= 0,
          uom: oi.uomCode || 'GRS',
          packagingUnit: pUnit,
        };
      });

      return {
        ...sd,
        lines,
        salesOrderNumber: sd.salesOrder?.orderNumber || null,
        divisionName: sd.salesOrder?.division?.name || null,
        sectionName: sd.salesOrder?.section?.name || null,
        totalDispatchQuantity,
        totalDispatchCartons,
        totalOrderQuantity,
        totalOrderCartons,
        totalDeliveredQuantity,
        totalBalanceQuantity,
        totalBalanceCartons,
        isCompleted,
        itemsSummary,
      };
    });
    return { data, total };
  }

  async findOne(id: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<any> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const delivery = await this.repo.findOne({
      where,
      relations: [
        'customer',
        'salesOrder',
        'salesOrder.division',
        'salesOrder.section',
        'salesOrder.items',
        'salesOrder.items.item',
        'salesOrder.items.uom',
        'lines',
        'lines.item',
        'lines.uom',
        'warehouse',
      ],
    });
    if (!delivery) throw new NotFoundException(`Sales delivery with ID '${id}' not found`);

    // PROMPT #27 — inherits the source order's division (TEST E).
    assertDivisionInScope(delivery.salesOrder?.divisionId, allowedDivisionIds);

    let relatedInvoices: any[] = [];
    try {
      if (delivery.salesOrderId) {
        relatedInvoices = await this.invoiceRepo.find({
          where: { salesOrderId: delivery.salesOrderId, companyId: delivery.companyId },
          order: { createdAt: 'DESC' },
        });
      }
    } catch {
      relatedInvoices = [];
    }

    return Object.assign(delivery, {
      relatedInvoices,
      salesOrderNumber: delivery.salesOrder?.orderNumber || null,
      divisionName: delivery.salesOrder?.division?.name || null,
      sectionName: delivery.salesOrder?.section?.name || null,
    });
  }

  async update(
    id: string, dto: any, userId?: string, companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId, allowedDivisionIds);
    if (delivery.status !== 'DRAFT') {
      throw new BadRequestException('Can only update deliveries in DRAFT status');
    }

    const isUuid = (val?: string | null): boolean =>
      typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const safeUserId = isUuid(userId) ? userId : null;

    let subtotal = Number(delivery.subtotal || 0);
    let taxAmount = Number(delivery.taxAmount || 0);
    let totalAmount = Number(delivery.totalAmount || 0);

    if (dto.lines && Array.isArray(dto.lines) && dto.lines.length > 0) {
      subtotal = 0;
      taxAmount = 0;
      totalAmount = 0;

      await this.lineRepo.delete({ deliveryId: id });
      const newLines = dto.lines.map((l: any, idx: number) => {
        const qty = Number(l.quantity || 0);
        const rate = Number(l.unitPrice || l.rate || 0);
        const lSub = qty * rate;
        const lTax = Number(l.taxAmount || 0);
        const lTot = Number(l.lineTotal || (lSub + lTax));
        subtotal += lSub;
        taxAmount += lTax;
        totalAmount += lTot;

        return this.lineRepo.create({
          deliveryId: id,
          lineNumber: idx + 1,
          itemId: isUuid(l.itemId) ? l.itemId : null,
          description: l.description || l.itemName || null,
          quantity: qty,
          uomId: isUuid(l.uomId) ? l.uomId : null,
          warehouseId: isUuid(l.warehouseId) ? l.warehouseId : (isUuid(delivery.warehouseId) ? delivery.warehouseId : null),
          unitPrice: rate,
          taxAmount: lTax,
          lineTotal: lTot,
        });
      });

      await this.lineRepo.save(newLines);
    }

    await this.repo.update(id, {
      salesOrderId: dto.salesOrderId !== undefined ? (dto.salesOrderId || null) : delivery.salesOrderId,
      customerPo: dto.customerPo !== undefined ? (dto.customerPo || null) : delivery.customerPo,
      deliveryDate: dto.deliveryDate ? dto.deliveryDate : delivery.deliveryDate,
      expectedDate: dto.expectedDate ? dto.expectedDate : null,
      warehouseId: isUuid(dto.warehouseId) ? dto.warehouseId : delivery.warehouseId,
      shipToAddress: dto.shipToAddress !== undefined ? (dto.shipToAddress || null) : delivery.shipToAddress,
      carrier: dto.carrier !== undefined ? (dto.carrier || null) : delivery.carrier,
      trackingNumber: dto.trackingNumber !== undefined ? (dto.trackingNumber || null) : delivery.trackingNumber,
      notes: dto.notes !== undefined ? (dto.notes || null) : delivery.notes,
      subtotal,
      taxAmount,
      totalAmount,
      updatedBy: safeUserId,
    });

    return this.findOne(id, companyId, allowedDivisionIds);
  }

  async ship(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId, allowedDivisionIds);
    if (delivery.status !== 'DRAFT') {
      throw new BadRequestException('Can only ship deliveries in DRAFT status');
    }
    delivery.status = 'SHIPPED';
    delivery.updatedBy = userId || null;
    return this.repo.save(delivery);
  }

  async deliver(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId, allowedDivisionIds);
    if (delivery.status !== 'SHIPPED') {
      throw new BadRequestException('Can only mark deliveries as delivered when in SHIPPED status');
    }
    delivery.status = 'DELIVERED';
    delivery.updatedBy = userId || null;
    return this.repo.save(delivery);
  }

  async confirm(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId, allowedDivisionIds);
    if (delivery.status !== 'DELIVERED') {
      throw new BadRequestException('Can only confirm deliveries in DELIVERED status');
    }

    const lines = await this.lineRepo.find({ where: { deliveryId: id } });
    if (lines.length === 0) {
      throw new BadRequestException('Delivery has no lines to confirm');
    }

    const warehouseId = delivery.warehouseId;
    if (!warehouseId) {
      throw new BadRequestException('Delivery must have a warehouse assigned before confirmation');
    }

    for (const line of lines) {
      if (!line.itemId) {
        throw new BadRequestException(`Delivery line ${line.lineNumber} has no item assigned`);
      }
      if (!line.uomId) {
        throw new BadRequestException(`Delivery line ${line.lineNumber} has no UOM assigned`);
      }
      const lineWarehouse = line.warehouseId || warehouseId;
      const rawQty = Number(line.quantity || 0);

      // Resolve item and base UOM to ensure accurate physical stock deduction
      const item = await this.itemRepo.findOne({
        where: { id: line.itemId },
        relations: ['baseUom'],
      });

      const lineUom = await this.uomRepo.findOne({ where: { id: line.uomId } });
      const lineUomCode = (lineUom?.code || '').toUpperCase();
      const baseUomId = item?.baseUomId || line.uomId;
      const baseUomCode = (item?.baseUom?.code || lineUomCode || 'PCS').toUpperCase();

      // Convert quantity to base UOM if line UOM differs (e.g. GRS -> 144 PCS, CTN -> cartons * grossPerCarton * 144)
      let baseQty = rawQty;
      if (line.uomId !== baseUomId && lineUomCode !== baseUomCode) {
        if (lineUomCode === 'GRS' && baseUomCode === 'PCS') {
          baseQty = rawQty * 144;
        } else if (lineUomCode === 'CTN' && baseUomCode === 'PCS') {
          const itemPkgSize = Number(item?.packagingSize) || 0;
          const isCS =
            (item?.itemCode || '').toUpperCase().includes('011') ||
            (item?.itemCode || '').toUpperCase().includes('012') ||
            (item?.name || '').toUpperCase().includes('CS');
          const grossPerCarton = itemPkgSize > 0 ? itemPkgSize : (isCS ? 10.555556 : 10);
          baseQty = Math.round(rawQty * grossPerCarton * 144);
        } else if (lineUomCode === 'PCS' && baseUomCode === 'GRS') {
          baseQty = rawQty / 144;
        } else {
          // Check global UOM conversions table
          const conv = await this.uomConversionRepo.findOne({
            where: { fromUomId: line.uomId, toUomId: baseUomId },
          });
          if (conv && Number(conv.conversionFactor) > 0) {
            baseQty = rawQty * Number(conv.conversionFactor);
          } else {
            const invConv = await this.uomConversionRepo.findOne({
              where: { fromUomId: baseUomId, toUomId: line.uomId },
            });
            if (invConv && Number(invConv.conversionFactor) > 0) {
              baseQty = rawQty / Number(invConv.conversionFactor);
            }
          }
        }
      }

      await this.ledgerService.create({
        companyId: delivery.companyId,
        transactionType: 'SALES_DELIVERY',
        transactionDate: new Date(),
        itemId: line.itemId,
        warehouseId: lineWarehouse,
        quantity: baseQty,
        uomId: baseUomId,
        direction: 'OUT',
        referenceType: 'SALES_DELIVERY',
        referenceId: delivery.id,
        referenceNumber: delivery.deliveryNumber,
        notes: `Sales delivery ${delivery.deliveryNumber} confirmed (${rawQty} ${lineUomCode || 'GRS'} = ${baseQty} ${baseUomCode})`,
        createdBy: userId,
      });

      await this.balanceService.updateBalance(
        delivery.companyId,
        line.itemId,
        lineWarehouse,
        null,
        null,
        baseUomId,
        baseQty,
        'OUT',
      );
    }

    delivery.status = 'CONFIRMED';
    delivery.updatedBy = userId || null;
    const saved = await this.repo.save(delivery);

    // Update parent Sales Order line items shipped quantities
    if (delivery.salesOrderId) {
      try {
        const orderItems = await this.orderItemRepo.find({ where: { salesOrderId: delivery.salesOrderId } });
        for (const line of lines) {
          const matched = orderItems.find((oi) => oi.itemId === line.itemId);
          if (matched) {
            matched.shippedQuantity = Number(matched.shippedQuantity || 0) + Number(line.quantity);
            await this.orderItemRepo.save(matched);
          }
        }
        const parentOrder = await this.orderRepo.findOne({ where: { id: delivery.salesOrderId } });
        if (parentOrder && parentOrder.status !== 'Closed') {
          const allDelivered = orderItems.every((oi) => Number(oi.shippedQuantity || 0) >= Number(oi.quantity));
          parentOrder.status = allDelivered ? 'Delivered' : 'Processing';
          await this.orderRepo.save(parentOrder);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to update sales order shipment tracking: ${err.message}`);
      }
    }

    return saved;
  }

  async convertToInvoice(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesInvoice> {
    const delivery = await this.findOne(id, companyId, allowedDivisionIds);
    const statusUpper = String(delivery.status || '').toUpperCase();
    if (statusUpper !== 'CONFIRMED' && statusUpper !== 'DELIVERED' && statusUpper !== 'SHIPPED') {
      throw new BadRequestException('Can only create invoices for DELIVERED or CONFIRMED deliveries');
    }

    // Duplicate protection
    const existing = await this.invoiceRepo.findOne({
      where: { salesOrderId: delivery.salesOrderId, companyId: delivery.companyId, totalAmount: delivery.totalAmount },
    });
    if (existing) {
      return existing;
    }

    const year = new Date().getFullYear();
    const prefix = `SI-${year}-`;
    const result = await this.invoiceRepo
      .createQueryBuilder('si')
      .select("MAX(CAST(SUBSTRING(si.invoiceNo FROM 'SI-[0-9]{4}-([0-9]+)') AS INT))", 'maxNum')
      .where('si.companyId = :companyId', { companyId: delivery.companyId })
      .andWhere('si.invoiceNo LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne();
    const maxNum = result?.maxNum || 0;
    const nextNum = maxNum + 1;
    const invoiceNo = `${prefix}${String(nextNum).padStart(5, '0')}`;

    const invoice = this.invoiceRepo.create({
      companyId: delivery.companyId,
      salesOrderId: delivery.salesOrderId || null,
      customerId: delivery.customerId,
      invoiceNo,
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: delivery.expectedDate || null,
      subtotal: Number(delivery.subtotal || 0),
      discountAmount: 0,
      taxAmount: Number(delivery.taxAmount || 0),
      totalAmount: Number(delivery.totalAmount || 0),
      paidAmount: 0,
      balance: Number(delivery.totalAmount || 0),
      status: 'Pending',
      createdBy: userId || null,
    });

    return this.invoiceRepo.save(invoice);
  }

  async cancel(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId, allowedDivisionIds);
    if (delivery.status === 'CANCELLED' || delivery.status === 'CONFIRMED') {
      throw new BadRequestException('Cannot cancel a delivery that is already cancelled or confirmed');
    }
    delivery.status = 'CANCELLED';
    delivery.updatedBy = userId || null;
    return this.repo.save(delivery);
  }

  /**
   * Move a delivery — the physical GATE PASS document — to the Recycle Bin.
   *
   * `DRAFT` only. Once a delivery is confirmed or shipped, goods have left (or
   * are leaving) the premises and the gate record is the evidence that they
   * did so; hiding it would break the outbound audit trail.
   */
  async remove(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId, allowedDivisionIds);
    const sUpper = (delivery.status || '').toUpperCase();
    if (sUpper !== 'DRAFT' && sUpper !== 'CANCELLED') {
      throw new BadRequestException(
        `A ${delivery.status || 'confirmed'} gate pass has already been raised and cannot be recycled. ` +
          'Cancel the delivery instead.',
      );
    }
    delivery.deletedAt = new Date();
    delivery.deletedBy = userId || null;
    return this.repo.save(delivery);
  }

  private async generateDeliveryNumber(companyId?: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `DN-${year}-`;
    const qb = this.repo
      .createQueryBuilder('sd')
      .withDeleted()
      .select("MAX(CAST(SUBSTRING(sd.delivery_number FROM 'DN-[0-9]{4}-([0-9]+)') AS INT))", 'maxNum')
      .where('sd.delivery_number LIKE :prefix', { prefix: `${prefix}%` });

    if (companyId) {
      qb.andWhere('sd.company_id = :companyId', { companyId });
    }

    const result = await qb.getRawOne();
    const maxNum = Number(result?.maxNum || result?.maxnum || 0);
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  }
}
