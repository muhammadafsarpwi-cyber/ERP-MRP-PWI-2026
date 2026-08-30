import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesInvoice, SalesCustomer, SalesOrder } from '../entities';
import { FinanceAutoPostingService } from '../../finance/services/finance-auto-posting.service';

@Injectable()
export class SalesInvoiceService {
  private readonly logger = new Logger(SalesInvoiceService.name);

  constructor(
    @InjectRepository(SalesInvoice)
    private readonly repo: Repository<SalesInvoice>,
    @InjectRepository(SalesCustomer)
    private readonly customerRepo: Repository<SalesCustomer>,
    @InjectRepository(SalesOrder)
    private readonly orderRepo: Repository<SalesOrder>,
    private readonly autoPosting: FinanceAutoPostingService,
  ) {}

  async create(dto: any, userId?: string): Promise<SalesInvoice> {
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

    const invoiceNo = await this.generateInvoiceNumber(dto.companyId);

    const invoice = this.repo.create({
      companyId: dto.companyId,
      salesOrderId: dto.salesOrderId || null,
      customerId: dto.customerId,
      invoiceNo,
      invoiceDate: dto.invoiceDate || new Date().toISOString().split('T')[0],
      dueDate: dto.dueDate || null,
      subtotal: dto.subtotal || 0,
      discountAmount: dto.discountAmount || 0,
      taxAmount: dto.taxAmount || 0,
      totalAmount: dto.totalAmount || 0,
      paidAmount: 0,
      balance: dto.totalAmount || 0,
      status: 'Pending',
      createdBy: userId || null,
    });
    const saved = await this.repo.save(invoice) as SalesInvoice;

    return this.findOne(saved.id);
  }

  async findAll(filter: any): Promise<{ data: SalesInvoice[]; total: number }> {
    const page = Number(filter.page) || 1;
    const limit = Number(filter.limit) || 20;
    const { companyId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('si')
      .leftJoinAndSelect('si.customer', 'customer')
      .leftJoinAndSelect('si.salesOrder', 'salesOrder');
    let hasWhere = false;
    if (companyId) { qb.where('si.companyId = :companyId', { companyId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('si.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('si.invoiceNo ILIKE :search', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'invoiceNo', 'invoiceDate', 'dueDate', 'status', 'totalAmount'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`si.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string, companyId?: string): Promise<SalesInvoice> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException(`Invalid ID format: ${id}`);
    }
    const where: any = { id };
    if (companyId) where.companyId = companyId;
    const invoice = await this.repo.findOne({
      where,
      relations: ['customer', 'salesOrder'],
    });
    if (!invoice) throw new NotFoundException(`Sales invoice with ID '${id}' not found`);
    return invoice;
  }

  async update(id: string, dto: any, userId?: string, companyId?: string): Promise<SalesInvoice> {
    const invoice = await this.findOne(id, companyId);
    if (invoice.status !== 'Pending') {
      throw new BadRequestException('Can only update invoices in Pending status');
    }

    Object.assign(invoice, {
      salesOrderId: dto.salesOrderId ?? invoice.salesOrderId,
      customerId: dto.customerId ?? invoice.customerId,
      invoiceDate: dto.invoiceDate ?? invoice.invoiceDate,
      dueDate: dto.dueDate ?? invoice.dueDate,
      subtotal: dto.subtotal ?? invoice.subtotal,
      discountAmount: dto.discountAmount ?? invoice.discountAmount,
      taxAmount: dto.taxAmount ?? invoice.taxAmount,
      totalAmount: dto.totalAmount ?? invoice.totalAmount,
      balance: dto.totalAmount ?? invoice.totalAmount,
    });

    return this.repo.save(invoice);
  }

  async recordPayment(id: string, amount: number, userId?: string, companyId?: string): Promise<SalesInvoice> {
    const invoice = await this.findOne(id, companyId);
    if (invoice.status === 'Cancelled') {
      throw new BadRequestException('Cannot record payment for a cancelled invoice');
    }
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }
    if (amount > invoice.balance) {
      throw new BadRequestException('Payment amount exceeds the outstanding balance');
    }

    invoice.paidAmount = Number(invoice.paidAmount) + amount;
    invoice.balance = Number(invoice.totalAmount) - Number(invoice.paidAmount);

    if (invoice.balance <= 0) {
      invoice.status = 'Paid';
    } else if (Number(invoice.paidAmount) > 0) {
      invoice.status = 'Partial';
    }

    const saved = await this.repo.save(invoice);
    // Auto-post customer receipt: DR Cash, CR AR
    try {
      await this.autoPosting.postCustomerReceipt(invoice.companyId, invoice.invoiceNo, id, amount, userId);
    } catch (e: any) {
      this.logger.warn(`Auto-posting for receipt on invoice ${id} failed: ${e.message}`);
    }
    return saved;
  }

  async post(id: string, userId?: string, companyId?: string): Promise<SalesInvoice> {
    const invoice = await this.findOne(id, companyId);
    if (invoice.status !== 'Pending') {
      throw new BadRequestException('Can only post invoices in Pending status');
    }
    invoice.status = 'Posted';
    const saved = await this.repo.save(invoice);
    // Auto-post AR journal
    try {
      await this.autoPosting.postSalesInvoice(invoice.companyId, invoice.invoiceNo, id, Number(invoice.totalAmount), userId);
    } catch (e: any) {
      this.logger.warn(`Auto-posting for sales invoice ${id} failed: ${e.message}`);
    }
    return saved;
  }

  async cancel(id: string, userId?: string, companyId?: string): Promise<SalesInvoice> {
    const invoice = await this.findOne(id, companyId);
    if (invoice.status === 'Cancelled') {
      throw new BadRequestException('Invoice is already cancelled');
    }
    if (invoice.status === 'Paid') {
      throw new BadRequestException('Cannot cancel a fully paid invoice');
    }
    invoice.status = 'Cancelled';
    return this.repo.save(invoice);
  }

  private async generateInvoiceNumber(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SI-${year}-`;
    const result = await this.repo
      .createQueryBuilder('si')
      .select("MAX(CAST(SUBSTRING(si.invoiceNo FROM 'SI-[0-9]{4}-([0-9]+)') AS INT))", 'maxNum')
      .where('si.companyId = :companyId', { companyId })
      .andWhere('si.invoiceNo LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne();
    const maxNum = result?.maxNum || 0;
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(5, '0')}`;
  }
}
