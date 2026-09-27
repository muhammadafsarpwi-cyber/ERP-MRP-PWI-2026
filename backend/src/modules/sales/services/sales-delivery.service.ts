import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesDelivery, SalesDeliveryLine, SalesCustomer, SalesOrder, SalesOrderItem, SalesInvoice } from '../entities';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';

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

    const deliveryNumber = await this.generateDeliveryNumber(dto.companyId);

    const delivery = this.repo.create({
      companyId: dto.companyId,
      salesOrderId: dto.salesOrderId || null,
      customerPo: dto.customerPo || null,
      customerId: dto.customerId,
      deliveryNumber,
      deliveryDate: dto.deliveryDate || new Date().toISOString().split('T')[0],
      expectedDate: dto.expectedDate || null,
      warehouseId: dto.warehouseId || null,
      shipToAddress: dto.shipToAddress || null,
      carrier: dto.carrier || null,
      trackingNumber: dto.trackingNumber || null,
      notes: dto.notes || null,
      status: 'DRAFT',
      createdBy: userId || null,
      updatedBy: userId || null,
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
          itemId: lineDto.itemId,
          description: lineDto.description || null,
          quantity: lineDto.quantity,
          uomId: lineDto.uomId,
          warehouseId: lineDto.warehouseId || null,
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
    const { companyId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('sd')
      .leftJoinAndSelect('sd.customer', 'customer')
      .leftJoinAndSelect('sd.salesOrder', 'salesOrder')
      .leftJoinAndSelect('salesOrder.division', 'division')
      .leftJoinAndSelect('salesOrder.section', 'section');
    let hasWhere = false;
    if (companyId) { qb.where('sd.companyId = :companyId', { companyId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('sd.status ILIKE :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(sd.deliveryNumber ILIKE :search OR customer.companyName ILIKE :search OR salesOrder.orderNumber ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'deliveryNumber', 'deliveryDate', 'status'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`sd.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [rawDeliveries, total] = await qb.getManyAndCount();
    const data = rawDeliveries.map((sd: any) => ({
      ...sd,
      salesOrderNumber: sd.salesOrder?.orderNumber || null,
      divisionName: sd.salesOrder?.division?.name || null,
      sectionName: sd.salesOrder?.section?.name || null,
    }));
    return { data, total };
  }

  async findOne(id: string, companyId?: string): Promise<any> {
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
        'lines',
        'lines.item',
        'lines.uom',
        'warehouse',
      ],
    });
    if (!delivery) throw new NotFoundException(`Sales delivery with ID '${id}' not found`);

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

  async update(id: string, dto: any, userId?: string, companyId?: string): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId);
    if (delivery.status !== 'DRAFT') {
      throw new BadRequestException('Can only update deliveries in DRAFT status');
    }

    Object.assign(delivery, {
      salesOrderId: dto.salesOrderId !== undefined ? (dto.salesOrderId || null) : delivery.salesOrderId,
      customerPo: dto.customerPo !== undefined ? (dto.customerPo || null) : delivery.customerPo,
      deliveryDate: dto.deliveryDate ? dto.deliveryDate : delivery.deliveryDate,
      expectedDate: dto.expectedDate ? dto.expectedDate : null,
      warehouseId: dto.warehouseId ? dto.warehouseId : delivery.warehouseId,
      shipToAddress: dto.shipToAddress !== undefined ? (dto.shipToAddress || null) : delivery.shipToAddress,
      carrier: dto.carrier !== undefined ? (dto.carrier || null) : delivery.carrier,
      trackingNumber: dto.trackingNumber !== undefined ? (dto.trackingNumber || null) : delivery.trackingNumber,
      notes: dto.notes !== undefined ? (dto.notes || null) : delivery.notes,
      updatedBy: userId || null,
    });

    if (dto.lines && Array.isArray(dto.lines) && dto.lines.length > 0) {
      let subtotal = 0;
      let taxAmount = 0;
      let totalAmount = 0;

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
          itemId: l.itemId || null,
          description: l.description || l.itemName || null,
          quantity: qty,
          uomId: l.uomId || null,
          warehouseId: l.warehouseId || delivery.warehouseId || null,
          unitPrice: rate,
          taxAmount: lTax,
          lineTotal: lTot,
        });
      });

      await this.lineRepo.save(newLines);
      delivery.subtotal = subtotal;
      delivery.taxAmount = taxAmount;
      delivery.totalAmount = totalAmount;
    }

    return this.repo.save(delivery);
  }

  async ship(id: string, userId?: string, companyId?: string): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId);
    if (delivery.status !== 'DRAFT') {
      throw new BadRequestException('Can only ship deliveries in DRAFT status');
    }
    delivery.status = 'SHIPPED';
    delivery.updatedBy = userId || null;
    return this.repo.save(delivery);
  }

  async deliver(id: string, userId?: string, companyId?: string): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId);
    if (delivery.status !== 'SHIPPED') {
      throw new BadRequestException('Can only mark deliveries as delivered when in SHIPPED status');
    }
    delivery.status = 'DELIVERED';
    delivery.updatedBy = userId || null;
    return this.repo.save(delivery);
  }

  async confirm(id: string, userId?: string, companyId?: string): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId);
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
      const qty = Number(line.quantity);

      await this.ledgerService.create({
        companyId: delivery.companyId,
        transactionType: 'SALES_DELIVERY',
        transactionDate: new Date(),
        itemId: line.itemId,
        warehouseId: lineWarehouse,
        quantity: qty,
        uomId: line.uomId,
        direction: 'OUT',
        referenceType: 'SALES_DELIVERY',
        referenceId: delivery.id,
        referenceNumber: delivery.deliveryNumber,
        notes: `Sales delivery ${delivery.deliveryNumber} confirmed`,
        createdBy: userId,
      });

      await this.balanceService.updateBalance(
        delivery.companyId,
        line.itemId,
        lineWarehouse,
        null,
        null,
        line.uomId,
        qty,
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

  async convertToInvoice(id: string, userId?: string, companyId?: string): Promise<SalesInvoice> {
    const delivery = await this.findOne(id, companyId);
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

  async cancel(id: string, userId?: string, companyId?: string): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId);
    if (delivery.status === 'CANCELLED' || delivery.status === 'CONFIRMED') {
      throw new BadRequestException('Cannot cancel a delivery that is already cancelled or confirmed');
    }
    delivery.status = 'CANCELLED';
    delivery.updatedBy = userId || null;
    return this.repo.save(delivery);
  }

  private async generateDeliveryNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `DN-${year}-`;
    const result = await this.repo
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
