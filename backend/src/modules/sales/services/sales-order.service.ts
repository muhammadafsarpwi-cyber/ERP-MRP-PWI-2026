import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder, SalesOrderItem, SalesCustomer } from '../entities';

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
  ) {}

  async create(dto: any, userId?: string): Promise<SalesOrder> {
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
      quotationId: dto.quotationId || null,
      orderNumber,
      orderDate: dto.orderDate || new Date().toISOString().split('T')[0],
      deliveryDate: dto.deliveryDate || null,
      shipToAddress: dto.shipToAddress || null,
      billToAddress: dto.billToAddress || null,
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

    return this.findOne(saved.id);
  }

  async findAll(filter: any): Promise<{ data: SalesOrder[]; total: number }> {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 20;
    const { companyId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('so')
      .leftJoinAndSelect('so.customer', 'customer');
    let hasWhere = false;
    if (companyId) { qb.where('so.companyId = :companyId', { companyId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('so.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('so.orderNumber ILIKE :search', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'orderNumber', 'orderDate', 'status', 'totalAmount'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`so.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string, companyId?: string): Promise<SalesOrder> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const order = await this.repo.findOne({
      where,
      relations: ['customer', 'items', 'items.item', 'items.uom'],
    });
    if (!order) throw new NotFoundException(`Sales order with ID '${id}' not found`);
    return order;
  }

  async update(id: string, dto: any, userId?: string, companyId?: string): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId);
    if (order.status !== 'Draft') {
      throw new BadRequestException('Can only update orders in Draft status');
    }

    Object.assign(order, {
      customerId: dto.customerId ?? order.customerId,
      quotationId: dto.quotationId ?? order.quotationId,
      orderDate: dto.orderDate ?? order.orderDate,
      deliveryDate: dto.deliveryDate ?? order.deliveryDate,
      shipToAddress: dto.shipToAddress ?? order.shipToAddress,
      billToAddress: dto.billToAddress ?? order.billToAddress,
      currency: dto.currency ?? order.currency,
      discountAmount: dto.discountAmount ?? order.discountAmount,
      taxAmount: dto.taxAmount ?? order.taxAmount,
      freightAmount: dto.freightAmount ?? order.freightAmount,
      notes: dto.notes ?? order.notes,
      updatedBy: userId || null,
    });

    return this.repo.save(order);
  }

  async confirm(id: string, userId?: string, companyId?: string): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId);
    if (order.status !== 'Draft') throw new BadRequestException('Can only confirm orders in Draft status');
    order.status = 'Confirmed';
    order.updatedBy = userId || null;
    return this.repo.save(order);
  }

  async process(id: string, userId?: string, companyId?: string): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId);
    if (order.status !== 'Confirmed') throw new BadRequestException('Can only process orders in Confirmed status');
    order.status = 'Processing';
    order.updatedBy = userId || null;
    return this.repo.save(order);
  }

  async ship(id: string, userId?: string, companyId?: string): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId);
    if (order.status !== 'Processing') throw new BadRequestException('Can only ship orders in Processing status');
    order.status = 'Shipped';
    order.updatedBy = userId || null;
    return this.repo.save(order);
  }

  async deliver(id: string, userId?: string, companyId?: string): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId);
    if (order.status !== 'Shipped') throw new BadRequestException('Can only deliver orders in Shipped status');
    order.status = 'Delivered';
    order.updatedBy = userId || null;
    return this.repo.save(order);
  }

  async close(id: string, userId?: string, companyId?: string): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId);
    if (order.status !== 'Delivered') throw new BadRequestException('Can only close orders in Delivered status');
    order.status = 'Closed';
    order.updatedBy = userId || null;
    return this.repo.save(order);
  }

  async cancel(id: string, userId?: string, companyId?: string): Promise<SalesOrder> {
    const order = await this.findOne(id, companyId);
    if (order.status === 'Cancelled' || order.status === 'Closed') {
      throw new BadRequestException('Cannot cancel an order that is already cancelled or closed');
    }
    order.status = 'Cancelled';
    order.updatedBy = userId || null;
    return this.repo.save(order);
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
}
