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
    const data = await this.enrichDeliveriesWithSocData(rawDeliveries);
    return { data, total };
  }

  private async enrichDeliveriesWithSocData(rawDeliveries: any[]): Promise<any[]> {
    if (!rawDeliveries || rawDeliveries.length === 0) return [];

    // 1. Collect all distinct SOC numbers referenced across the deliveries
    const allSocNumbers = new Set<string>();
    for (const sd of rawDeliveries) {
      if (sd.salesOrder?.orderNumber) {
        allSocNumbers.add(sd.salesOrder.orderNumber.trim());
      }
      for (const l of sd.lines || []) {
        const socMatch = l.description?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
        if (socMatch) {
          allSocNumbers.add(socMatch[1].trim());
        }
      }
    }

    const socList = Array.from(allSocNumbers);
    const soItemsMap = new Map<string, any[]>();
    const soMetaMap = new Map<string, { id: string; customerPo: string | null }>();
    const shippedPerSocMap = new Map<string, { qty: number; ctn: number }>();

    if (socList.length > 0) {
      try {
        const soRows = await this.repo.manager.query(
          `SELECT so.id, so.order_number, so.customer_po,
                  soi.item_id, soi.quantity as order_qty,
                  i.packaging_size, i.item_code, i.name as item_name
           FROM erp_sales.sales_orders so
           JOIN erp_sales.sales_order_items soi ON soi.sales_order_id = so.id
           LEFT JOIN public.items i ON i.id = soi.item_id
           WHERE so.order_number = ANY($1)`,
          [socList],
        );
        for (const r of soRows) {
          if (!soMetaMap.has(r.order_number)) {
            soMetaMap.set(r.order_number, { id: r.id, customerPo: r.customer_po || null });
          }
          const list = soItemsMap.get(r.order_number) || [];
          list.push(r);
          soItemsMap.set(r.order_number, list);
        }

        // Fetch all confirmed shipped quantities across all deliveries for these SOCs
        const shippedRows = await this.repo.manager.query(
          `SELECT sdl.item_id, sdl.description, sdl.quantity as shipped_qty, so.order_number as header_soc,
                  i.packaging_size
           FROM erp_sales.sales_delivery_lines sdl
           JOIN erp_sales.sales_deliveries sd ON sd.id = sdl.delivery_id
           LEFT JOIN erp_sales.sales_orders so ON so.id = sd.sales_order_id
           LEFT JOIN public.items i ON i.id = sdl.item_id
           WHERE sd.status IN ('CONFIRMED', 'DELIVERED', 'SHIPPED')`,
        );
        for (const r of shippedRows) {
          const socMatch = r.description?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
          const soc = socMatch ? socMatch[1].trim() : r.header_soc;
          if (!soc || !allSocNumbers.has(soc)) continue;
          const pSize = Number(r.packaging_size || 10) || 10;
          const q = Number(r.shipped_qty || 0);
          const c = Math.round((q / pSize) * 100) / 100;
          const curr = shippedPerSocMap.get(soc) || { qty: 0, ctn: 0 };
          shippedPerSocMap.set(soc, { qty: curr.qty + q, ctn: curr.ctn + c });
        }
      } catch (err: any) {
        this.logger.warn(`Failed to enrich deliveries with SOC data: ${err.message}`);
      }
    }

    return rawDeliveries.map((sd: any) => {
      const lines = (sd.lines || []).map((l: any) => {
        const socMatch = l.description?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
        const lineSoc = socMatch ? socMatch[1].trim() : (sd.salesOrder?.orderNumber || null);
        const pSize = Number(l.item?.packagingSize || l.packagingSize || 10) || 10;
        const qty = Number(l.quantity) || 0;
        const ctn = Math.round((qty / pSize) * 100) / 100;

        return {
          ...l,
          socNumber: lineSoc,
          packagingSize: pSize,
          packagingUnit: l.item?.packagingUnit || 'CTN',
          cartons: ctn,
          itemCode: l.item?.itemCode || l.itemCode,
          itemName: l.item?.name || l.itemName || l.description,
          uomCode: l.uom?.code || 'GRS',
        };
      });

      // Find all distinct SOCs for this specific delivery
      const delSocs = Array.from(
        new Set([sd.salesOrder?.orderNumber, ...lines.map((l: any) => l.socNumber)].filter(Boolean) as string[]),
      );

      const salesOrdersSummary = delSocs.map((soc: string) => {
        const thisLines = lines.filter((l: any) => l.socNumber === soc);
        const thisDispQty = thisLines.reduce((sum: number, l: any) => sum + (Number(l.quantity) || 0), 0);
        const thisDispCtn = thisLines.reduce((sum: number, l: any) => sum + (Number(l.cartons) || 0), 0);

        const soItems = soItemsMap.get(soc) || [];
        let orderQty = 0;
        let orderCtn = 0;
        for (const soi of soItems) {
          const pSize = Number(soi.packaging_size || 10) || 10;
          const oQty = Number(soi.order_qty) || 0;
          orderQty += oQty;
          orderCtn += Math.round((oQty / pSize) * 100) / 100;
        }

        const shipped = shippedPerSocMap.get(soc) || { qty: thisDispQty, ctn: thisDispCtn };
        const balQty = Math.max(0, orderQty - shipped.qty);
        const balCtn = Math.max(0, orderCtn - shipped.ctn);
        const pct = orderQty > 0 ? Math.min(100, Math.round(((orderQty - balQty) / orderQty) * 100)) : 100;

        return {
          socNumber: soc,
          salesOrderId: soMetaMap.get(soc)?.id || null,
          customerPo: soMetaMap.get(soc)?.customerPo || null,
          thisDeliveryQuantity: Math.round(thisDispQty * 100) / 100,
          thisDeliveryCartons: Math.round(thisDispCtn * 100) / 100,
          totalOrderQuantity: Math.round(orderQty * 100) / 100,
          totalOrderCartons: Math.round(orderCtn * 100) / 100,
          totalShippedQuantity: Math.round(shipped.qty * 100) / 100,
          totalShippedCartons: Math.round(shipped.ctn * 100) / 100,
          balanceQuantity: Math.round(balQty * 100) / 100,
          balanceCartons: Math.round(balCtn * 100) / 100,
          isCompleted: orderQty > 0 && balQty <= 0,
          completionPercent: pct,
        };
      });

      const totalDispatchQuantity = lines.reduce((sum: number, l: any) => sum + (Number(l.quantity) || 0), 0);
      const totalDispatchCartons = lines.reduce((sum: number, l: any) => sum + (Number(l.cartons) || 0), 0);

      const totalOrderQuantity = salesOrdersSummary.reduce((sum: number, s: any) => sum + s.totalOrderQuantity, 0);
      const totalOrderCartons = salesOrdersSummary.reduce((sum: number, s: any) => sum + s.totalOrderCartons, 0);

      const totalDeliveredQuantity = salesOrdersSummary.reduce((sum: number, s: any) => sum + s.totalShippedQuantity, 0);
      const totalBalanceQuantity = salesOrdersSummary.reduce((sum: number, s: any) => sum + s.balanceQuantity, 0);
      const totalBalanceCartons = salesOrdersSummary.reduce((sum: number, s: any) => sum + s.balanceCartons, 0);

      const isCompleted = totalOrderQuantity > 0 && totalBalanceQuantity <= 0;

      // Item summary breakdown
      const itemsSummary = lines.map((l: any) => ({
        itemId: l.itemId,
        itemCode: l.itemCode || '-',
        itemName: l.itemName || 'Product',
        socNumber: l.socNumber,
        dispatchedQuantity: Number(l.quantity) || 0,
        dispatchedCartons: l.cartons,
        packagingUnit: l.packagingUnit || 'CTN',
        uom: l.uomCode || 'GRS',
      }));

      return {
        ...sd,
        lines,
        salesOrderNumber: sd.salesOrder?.orderNumber || (delSocs.length > 0 ? delSocs.join(', ') : null),
        salesOrderNumbers: delSocs,
        salesOrdersSummary,
        divisionName: sd.salesOrder?.division?.name || null,
        sectionName: sd.salesOrder?.section?.name || null,
        totalDispatchQuantity: Math.round(totalDispatchQuantity * 100) / 100,
        totalDispatchCartons: Math.round(totalDispatchCartons * 100) / 100,
        totalOrderQuantity: Math.round(totalOrderQuantity * 100) / 100,
        totalOrderCartons: Math.round(totalOrderCartons * 100) / 100,
        totalDeliveredQuantity: Math.round(totalDeliveredQuantity * 100) / 100,
        totalBalanceQuantity: Math.round(totalBalanceQuantity * 100) / 100,
        totalBalanceCartons: Math.round(totalBalanceCartons * 100) / 100,
        isCompleted,
        itemsSummary,
      };
    });
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

    const [enriched] = await this.enrichDeliveriesWithSocData([delivery]);

    return Object.assign(delivery, enriched, {
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
    if (delivery.status !== 'SHIPPED' && delivery.status !== 'DRAFT') {
      throw new BadRequestException('Can only mark deliveries as delivered when in SHIPPED or DRAFT status');
    }
    delivery.status = 'DELIVERED';
    delivery.updatedBy = userId || null;
    await this.repo.save(delivery);
    // Auto-confirm so stock ledger entries and stock balances are deducted immediately
    return this.confirm(id, userId, companyId, allowedDivisionIds);
  }

  async confirm(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId, allowedDivisionIds);
    if (delivery.status === 'CONFIRMED') {
      return delivery;
    }
    if (delivery.status !== 'DELIVERED' && delivery.status !== 'SHIPPED') {
      throw new BadRequestException('Can only confirm deliveries in DELIVERED or SHIPPED status');
    }

    const lines = await this.lineRepo.find({ where: { deliveryId: id } });
    if (lines.length === 0) {
      throw new BadRequestException('Delivery has no lines to confirm');
    }

    const warehouseId = delivery.warehouseId;
    if (!warehouseId) {
      throw new BadRequestException('Delivery must have a warehouse assigned before confirmation');
    }

    // Check if ledger entries already created for this delivery (to prevent duplicate stock deduction)
    const existingLedgers = await this.ledgerService.findAll({
      companyId: delivery.companyId,
      referenceType: 'SALES_DELIVERY',
      referenceId: delivery.id,
    });

    if (!existingLedgers || existingLedgers.total === 0) {
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

        const safeUserIdForLedger = isUuid(userId) ? userId : undefined;
        const txDate = delivery.deliveryDate ? new Date(delivery.deliveryDate) : new Date();
        const customerName = delivery.customer?.companyName || (delivery.customer as any)?.name || '';
        const notesStr = customerName
          ? `Sales delivery to ${customerName} (${delivery.deliveryNumber}) confirmed (${rawQty} ${lineUomCode || 'GRS'} = ${baseQty} ${baseUomCode})`
          : `Sales delivery ${delivery.deliveryNumber} confirmed (${rawQty} ${lineUomCode || 'GRS'} = ${baseQty} ${baseUomCode})`;

        await this.ledgerService.create({
          companyId: delivery.companyId,
          transactionType: 'SALES_DELIVERY',
          transactionDate: txDate,
          itemId: line.itemId,
          warehouseId: lineWarehouse,
          quantity: baseQty,
          uomId: baseUomId,
          direction: 'OUT',
          referenceType: 'SALES_DELIVERY',
          referenceId: delivery.id,
          referenceNumber: delivery.deliveryNumber,
          notes: notesStr,
          createdBy: safeUserIdForLedger,
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
    } else {
      this.logger.warn(`Ledger entries already exist for delivery ${delivery.deliveryNumber}. Skipping balance re-deduction.`);
    }

    const safeUserId = isUuid(userId) ? userId : null;
    await this.repo.update(delivery.id, {
      status: 'CONFIRMED',
      updatedBy: safeUserId,
    });
    delivery.status = 'CONFIRMED';
    delivery.updatedBy = safeUserId;

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

    return delivery;
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
