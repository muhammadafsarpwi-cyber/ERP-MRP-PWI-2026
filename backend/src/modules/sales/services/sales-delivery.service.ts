import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesDelivery, SalesDeliveryLine, SalesCustomer, SalesOrder } from '../entities';
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

  async findAll(filter: any): Promise<{ data: SalesDelivery[]; total: number }> {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 20;
    const { companyId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('sd')
      .leftJoinAndSelect('sd.customer', 'customer')
      .leftJoinAndSelect('sd.salesOrder', 'salesOrder');
    let hasWhere = false;
    if (companyId) { qb.where('sd.companyId = :companyId', { companyId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('sd.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('sd.deliveryNumber ILIKE :search', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'deliveryNumber', 'deliveryDate', 'status'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`sd.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string, companyId?: string): Promise<SalesDelivery> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const delivery = await this.repo.findOne({
      where,
      relations: ['customer', 'salesOrder', 'lines', 'lines.item', 'lines.uom', 'warehouse'],
    });
    if (!delivery) throw new NotFoundException(`Sales delivery with ID '${id}' not found`);
    return delivery;
  }

  async update(id: string, dto: any, userId?: string, companyId?: string): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId);
    if (delivery.status !== 'DRAFT') {
      throw new BadRequestException('Can only update deliveries in DRAFT status');
    }

    Object.assign(delivery, {
      deliveryDate: dto.deliveryDate ?? delivery.deliveryDate,
      expectedDate: dto.expectedDate ?? delivery.expectedDate,
      warehouseId: dto.warehouseId ?? delivery.warehouseId,
      shipToAddress: dto.shipToAddress ?? delivery.shipToAddress,
      carrier: dto.carrier ?? delivery.carrier,
      trackingNumber: dto.trackingNumber ?? delivery.trackingNumber,
      notes: dto.notes ?? delivery.notes,
      updatedBy: userId || null,
    });

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
    return this.repo.save(delivery);
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
