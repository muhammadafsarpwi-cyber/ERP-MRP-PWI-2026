import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Quotation,
  QuotationLine,
  RequestForQuotation,
  RfqSupplier,
  PurchaseOrder,
  PurchaseOrderLine,
} from '../entities';
import { CreateQuotationDto, QuotationFilterDto } from '../dto';

@Injectable()
export class QuotationService {
  private readonly logger = new Logger(QuotationService.name);

  constructor(
    @InjectRepository(Quotation)
    private readonly repo: Repository<Quotation>,
    @InjectRepository(QuotationLine)
    private readonly lineRepo: Repository<QuotationLine>,
    @InjectRepository(RequestForQuotation)
    private readonly rfqRepo: Repository<RequestForQuotation>,
    @InjectRepository(RfqSupplier)
    private readonly rfqSupplierRepo: Repository<RfqSupplier>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLine)
    private readonly poLineRepo: Repository<PurchaseOrderLine>,
  ) {}

  async create(dto: CreateQuotationDto, userId?: string): Promise<Quotation> {
    const existing = await this.repo.findOne({
      where: { quotationCode: dto.quotationCode, companyId: dto.companyId },
    });
    if (existing) {
      throw new ConflictException(`Quotation code '${dto.quotationCode}' already exists`);
    }

    const { lines, purchaseType, divisionId, warehouseId, ...restDto } = dto;
    const computedSubtotal = (dto.lines || []).reduce((sum, l) => {
      const qty = Number(l.quantity || 0);
      const price = Number(l.unitPrice ?? l.rate ?? 0);
      const disc = Number(l.discountPercent || 0);
      return sum + qty * price * (1 - disc / 100);
    }, 0);
    const headerDiscount = Number(dto.discountPercent || 0);
    const headerTax = Number(dto.taxPercent || 0);
    const discountedSub = computedSubtotal * (1 - headerDiscount / 100);
    const computedGrandTotal = Math.round(discountedSub * (1 + headerTax / 100) * 100) / 100;

    const quotation = this.repo.create({
      ...restDto,
      totalAmount: dto.totalAmount && Number(dto.totalAmount) > 0 ? dto.totalAmount : computedGrandTotal,
      status: 'RECEIVED',
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const saved = await this.repo.save(quotation);

    if (dto.lines && dto.lines.length > 0) {
      for (const lineDto of dto.lines) {
        const unitPrice = Number(lineDto.unitPrice ?? lineDto.rate ?? 0);
        const line = this.lineRepo.create({
          quotationId: saved.id,
          ...lineDto,
          unitPrice,
          totalPrice:
            lineDto.quantity * unitPrice * (1 - (lineDto.discountPercent || 0) / 100),
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await this.lineRepo.save(line);
      }
    }

    // Auto-update multi-supplier RFQ tracking status to QUOTED
    if (dto.rfqId && dto.supplierId) {
      await this.rfqSupplierRepo
        .createQueryBuilder()
        .update(RfqSupplier)
        .set({ status: 'QUOTED', quotedAt: new Date(), updatedBy: userId || null })
        .where('rfq_id = :rfqId AND supplier_id = :supplierId', {
          rfqId: dto.rfqId,
          supplierId: dto.supplierId,
        })
        .execute();
    }

    return this.findOne(saved.id);
  }

  async findAll(filter: QuotationFilterDto): Promise<{ data: Quotation[]; total: number }> {
    const { page = 1, limit = 20, companyId, supplierId, rfqId, status, search, sortField = 'createdAt', sortOrder = 'DESC' } = filter;
    const qb = this.repo.createQueryBuilder('q')
      .leftJoinAndSelect('q.supplier', 'supplier')
      .leftJoinAndSelect('q.rfq', 'rfq');
    let hasWhere = false;
    if (companyId) { qb.where('q.companyId = :companyId', { companyId }); hasWhere = true; }
    if (supplierId) { qb[hasWhere ? 'andWhere' : 'where']('q.supplierId = :supplierId', { supplierId }); hasWhere = true; }
    if (rfqId) { qb[hasWhere ? 'andWhere' : 'where']('q.rfqId = :rfqId', { rfqId }); hasWhere = true; }
    if (status) { qb[hasWhere ? 'andWhere' : 'where']('q.status = :status', { status }); hasWhere = true; }
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(q.quotationCode ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
    const validSortFields = ['createdAt', 'quotationCode', 'status', 'totalAmount'];
    const field = validSortFields.includes(sortField) ? sortField : 'createdAt';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy(`q.${field}`, order);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(id: string): Promise<Quotation> {
    const quotation = await this.repo.findOne({
      where: { id },
      relations: ['supplier', 'rfq', 'lines', 'lines.item', 'lines.uom'],
    });
    if (!quotation) throw new NotFoundException(`Quotation with ID '${id}' not found`);
    return quotation;
  }

  async evaluate(id: string, evaluationNotes: string, userId?: string): Promise<Quotation> {
    const quotation = await this.findOne(id);
    if (quotation.status !== 'RECEIVED') {
      throw new BadRequestException('Can only evaluate quotations in RECEIVED status');
    }
    quotation.status = 'EVALUATED';
    quotation.evaluationNotes = evaluationNotes;
    quotation.evaluatedBy = userId || null;
    quotation.evaluatedAt = new Date();
    quotation.updatedBy = userId || null;
    return this.repo.save(quotation);
  }

  async select(id: string, userId?: string): Promise<Quotation> {
    const quotation = await this.findOne(id);
    if (quotation.status !== 'EVALUATED' && quotation.status !== 'RECEIVED') {
      throw new BadRequestException('Can only select quotations in RECEIVED or EVALUATED status');
    }

    await this.repo.manager.transaction(async (manager) => {
      await manager.update(
        Quotation,
        { id: quotation.id },
        { status: 'SELECTED', updatedBy: userId || null },
      );

      // Auto-reject competing quotations for the same RFQ
      if (quotation.rfqId) {
        await manager
          .createQueryBuilder()
          .update(Quotation)
          .set({ status: 'REJECTED', updatedBy: userId || null })
          .where('rfq_id = :rfqId AND id != :id AND status NOT IN (:...excluded)', {
            rfqId: quotation.rfqId,
            id: quotation.id,
            excluded: ['CANCELLED', 'REJECTED'],
          })
          .execute();

        // Mark parent RFQ as AWARDED
        await manager.update(
          RequestForQuotation,
          { id: quotation.rfqId },
          {
            status: 'AWARDED',
            evaluatedBy: userId || null,
            evaluatedAt: new Date(),
            updatedBy: userId || null,
          },
        );
      }
    });

    return this.findOne(id);
  }

  async compareByRfq(rfqId: string) {
    const rfq = await this.rfqRepo.findOne({
      where: { id: rfqId },
      relations: ['supplier', 'rfqSuppliers', 'rfqSuppliers.supplier', 'lines', 'lines.item', 'lines.uom'],
    });
    if (!rfq) throw new NotFoundException(`RFQ with ID '${rfqId}' not found`);

    const quotes = await this.repo.find({
      where: { rfqId },
      relations: ['supplier', 'lines', 'lines.item', 'lines.uom'],
      order: { createdAt: 'ASC' },
    });

    const activeQuotes = quotes.filter((q) => q.status !== 'CANCELLED');

    const quoteSummaries = activeQuotes.map((q) => {
      const subtotal = (q.lines || []).reduce((acc, l) => {
        const lineNet =
          Number(l.totalPrice ?? 0) > 0
            ? Number(l.totalPrice)
            : Number(l.quantity || 0) * Number(l.unitPrice || 0) * (1 - Number(l.discountPercent || 0) / 100);
        return acc + lineNet;
      }, 0);
      const discPct = Number(q.discountPercent || 0);
      const taxPct = Number(q.taxPercent || 0);
      const discountedSub = subtotal * (1 - discPct / 100);
      const taxAmount = Math.round(discountedSub * (taxPct / 100) * 100) / 100;
      const grandTotal =
        Number(q.totalAmount || 0) > 0
          ? Number(q.totalAmount)
          : Math.round((discountedSub + taxAmount) * 100) / 100;

      return {
        quotationId: q.id,
        quotationCode: q.quotationCode,
        supplierId: q.supplierId,
        supplierName: q.supplier?.name || 'Supplier',
        status: q.status,
        subtotal: Math.round(subtotal * 100) / 100,
        discountPercent: discPct,
        taxPercent: taxPct,
        taxAmount,
        grandTotal,
        deliveryLeadTimeDays: q.deliveryLeadTimeDays ?? null,
        paymentTerms: q.paymentTerms ?? null,
        deliveryTerms: q.deliveryTerms ?? null,
        validUntil: q.validUntil ?? null,
        isLowestOverall: false,
      };
    });

    let lowestOverallAmount = Infinity;
    let lowestOverallQuotationId: string | null = null;
    let lowestOverallSupplierId: string | null = null;
    for (const qs of quoteSummaries) {
      if (qs.grandTotal > 0 && qs.grandTotal < lowestOverallAmount) {
        lowestOverallAmount = qs.grandTotal;
        lowestOverallQuotationId = qs.quotationId;
        lowestOverallSupplierId = qs.supplierId;
      }
    }
    for (const qs of quoteSummaries) {
      qs.isLowestOverall = qs.quotationId === lowestOverallQuotationId;
    }

    // Build item-by-item matrix across RFQ lines + any quoted items
    const itemMap = new Map<
      string,
      {
        itemId: string;
        itemCode: string;
        itemName: string;
        uomCode: string;
        requestedQty: number;
        lowestUnitPrice: number | null;
        lowestSupplierId: string | null;
        quotesBySupplier: Record<
          string,
          {
            quotationId: string;
            unitPrice: number;
            discountPercent: number;
            lineTotal: number;
            leadTimeDays: number | null;
            isLowestUnitPrice: boolean;
          }
        >;
      }
    >();

    for (const rfqLine of rfq.lines || []) {
      itemMap.set(rfqLine.itemId, {
        itemId: rfqLine.itemId,
        itemCode: rfqLine.item?.itemCode || '',
        itemName: rfqLine.item?.name || 'Item',
        uomCode: rfqLine.uom?.code || '',
        requestedQty: Number(rfqLine.quantity || 0),
        lowestUnitPrice: null,
        lowestSupplierId: null,
        quotesBySupplier: {},
      });
    }

    for (const q of activeQuotes) {
      for (const ql of q.lines || []) {
        if (!itemMap.has(ql.itemId)) {
          itemMap.set(ql.itemId, {
            itemId: ql.itemId,
            itemCode: ql.item?.itemCode || '',
            itemName: ql.item?.name || 'Item',
            uomCode: ql.uom?.code || '',
            requestedQty: Number(ql.quantity || 0),
            lowestUnitPrice: null,
            lowestSupplierId: null,
            quotesBySupplier: {},
          });
        }
        const entry = itemMap.get(ql.itemId)!;
        const unitPrice = Number(ql.unitPrice || 0);
        const lineTotal =
          Number(ql.totalPrice ?? 0) > 0
            ? Number(ql.totalPrice)
            : Number(ql.quantity || 0) * unitPrice * (1 - Number(ql.discountPercent || 0) / 100);
        entry.quotesBySupplier[q.supplierId] = {
          quotationId: q.id,
          unitPrice,
          discountPercent: Number(ql.discountPercent || 0),
          lineTotal: Math.round(lineTotal * 100) / 100,
          leadTimeDays: ql.leadTimeDays ?? q.deliveryLeadTimeDays ?? null,
          isLowestUnitPrice: false,
        };
        if (unitPrice > 0 && (entry.lowestUnitPrice === null || unitPrice < entry.lowestUnitPrice)) {
          entry.lowestUnitPrice = unitPrice;
          entry.lowestSupplierId = q.supplierId;
        }
      }
    }

    for (const entry of itemMap.values()) {
      if (entry.lowestSupplierId && entry.quotesBySupplier[entry.lowestSupplierId]) {
        entry.quotesBySupplier[entry.lowestSupplierId].isLowestUnitPrice = true;
      }
    }

    return {
      rfq: {
        id: rfq.id,
        rfqCode: rfq.rfqCode,
        title: rfq.title,
        status: rfq.status,
        dueDate: rfq.dueDate,
        suppliers: (rfq.rfqSuppliers || []).map((rs) => ({
          supplierId: rs.supplierId,
          supplierName: rs.supplier?.name || 'Supplier',
          status: rs.status,
          sentAt: rs.sentAt,
          quotedAt: rs.quotedAt,
        })),
      },
      quotations: quoteSummaries,
      items: Array.from(itemMap.values()),
      lowestOverallQuotationId,
      lowestOverallSupplierId,
      lowestOverallAmount: lowestOverallAmount === Infinity ? 0 : lowestOverallAmount,
    };
  }

  async convertToPo(
    id: string,
    options?: { warehouseId?: string; expectedDeliveryDate?: string; notes?: string },
    userId?: string,
  ): Promise<PurchaseOrder> {
    const quotation = await this.findOne(id);
    if (quotation.status !== 'SELECTED' && quotation.status !== 'EVALUATED' && quotation.status !== 'RECEIVED') {
      throw new BadRequestException(`Cannot convert quotation in '${quotation.status}' status to a PO`);
    }

    return this.repo.manager.transaction(async (manager) => {
      // Ensure winning quotation & RFQ status are marked awarded if not already
      if (quotation.status !== 'SELECTED') {
        await manager.update(Quotation, { id: quotation.id }, { status: 'SELECTED', updatedBy: userId || null });
        if (quotation.rfqId) {
          await manager
            .createQueryBuilder()
            .update(Quotation)
            .set({ status: 'REJECTED', updatedBy: userId || null })
            .where('rfq_id = :rfqId AND id != :id AND status NOT IN (:...excluded)', {
              rfqId: quotation.rfqId,
              id: quotation.id,
              excluded: ['CANCELLED', 'REJECTED'],
            })
            .execute();
          await manager.update(
            RequestForQuotation,
            { id: quotation.rfqId },
            { status: 'AWARDED', updatedBy: userId || null },
          );
        }
      }

      const year = new Date().getFullYear();
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const poCode = `PO-${year}-${randomSuffix}`;

      let subtotal = 0;
      const lineValues = (quotation.lines || []).map((ql) => {
        const qty = Number(ql.quantity || 0);
        const unitPrice = Number(ql.unitPrice || 0);
        const disc = Number(ql.discountPercent || 0);
        const lineTotal = Math.round(qty * unitPrice * (1 - disc / 100) * 100) / 100;
        subtotal += lineTotal;
        return { ql, qty, unitPrice, disc, lineTotal };
      });

      const discountAmount = Math.round(subtotal * (Number(quotation.discountPercent || 0) / 100) * 100) / 100;
      const taxPercent = Number(quotation.taxPercent || 0);
      const taxAmount = Math.round((subtotal - discountAmount) * (taxPercent / 100) * 100) / 100;
      const totalAmount = Math.round((subtotal - discountAmount + taxAmount) * 100) / 100;

      const po = manager.create(PurchaseOrder, {
        companyId: quotation.companyId,
        poCode,
        supplierId: quotation.supplierId,
        quotationId: quotation.id,
        requisitionId: quotation.rfq?.requisitionId || null,
        warehouseId: options?.warehouseId || null,
        orderDate: new Date().toISOString().slice(0, 10),
        expectedDeliveryDate: options?.expectedDeliveryDate || null,
        paymentTerms: quotation.paymentTerms || 'NET 30',
        deliveryTerms: quotation.deliveryTerms || null,
        subtotal,
        discountAmount,
        taxPercent,
        taxAmount,
        totalAmount,
        status: 'DRAFT',
        notes: options?.notes || `Converted from Quotation ${quotation.quotationCode}`,
        createdBy: userId || null,
        updatedBy: userId || null,
      });
      const savedPo = await manager.save(PurchaseOrder, po);

      for (let i = 0; i < lineValues.length; i++) {
        const { ql, qty, unitPrice, disc, lineTotal } = lineValues[i];
        const poLine = manager.create(PurchaseOrderLine, {
          poId: savedPo.id,
          lineNumber: ql.lineNumber || i + 1,
          itemId: ql.itemId,
          uomId: ql.uomId,
          quantity: qty,
          unitPrice,
          discountPercent: disc,
          totalPrice: lineTotal,
          warehouseId: options?.warehouseId || null,
          notes: ql.notes || null,
          createdBy: userId || null,
          updatedBy: userId || null,
        });
        await manager.save(PurchaseOrderLine, poLine);
      }

      const fullPo = await manager.findOne(PurchaseOrder, {
        where: { id: savedPo.id },
        relations: ['supplier', 'warehouse', 'lines', 'lines.item', 'lines.uom'],
      });
      return fullPo!;
    });
  }

  async reject(id: string, userId?: string): Promise<Quotation> {
    const quotation = await this.findOne(id);
    if (quotation.status !== 'RECEIVED' && quotation.status !== 'EVALUATED') {
      throw new BadRequestException('Can only reject quotations in RECEIVED or EVALUATED status');
    }
    quotation.status = 'REJECTED';
    quotation.updatedBy = userId || null;
    return this.repo.save(quotation);
  }
}
