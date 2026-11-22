import { Injectable, NotFoundException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
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
export class SalesDeliveryService implements OnModuleInit {
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

  async onModuleInit() {
    try {
      await this.repo.manager.query(
        `ALTER TABLE erp_sales.sales_deliveries ADD COLUMN IF NOT EXISTS gate_pass_number VARCHAR(60) NULL`,
      );
    } catch (err: any) {
      this.logger.warn(`Could not auto-verify gate_pass_number column: ${err?.message || err}`);
    }
  }

  /**
   * Computes the next sequential Gate Pass Book serial number from the last recorded value.
   * Examples: "GP-1045" -> "GP-1046", "1045" -> "1046", "0045" -> "0046", null -> "GP-0001".
   */
  computeNextGatePassNumber(lastValue?: string | null): string {
    const trimmed = String(lastValue || '').trim();
    if (!trimmed) return 'GP-0001';
    const match = trimmed.match(/^(.*?)(\d+)([^0-9]*)$/);
    if (!match) return `${trimmed}-1`;
    const [, prefix, digits, suffix] = match;
    const nextInt = parseInt(digits, 10) + 1;
    const padded = String(nextInt).padStart(digits.length, '0');
    return `${prefix}${padded}${suffix}`;
  }

  async getNextGatePassNumber(companyId?: string): Promise<{ lastGatePassNumber: string | null; nextGatePassNumber: string }> {
    try {
      const params: any[] = [];
      let where = `WHERE gate_pass_number IS NOT NULL AND TRIM(gate_pass_number) <> '' AND deleted_at IS NULL`;
      if (companyId) {
        params.push(companyId);
        where += ` AND company_id = $1`;
      }
      const rows = await this.repo.manager.query(
        `SELECT gate_pass_number
         FROM erp_sales.sales_deliveries
         ${where}
         ORDER BY created_at DESC, updated_at DESC
         LIMIT 1`,
        params,
      );
      const lastGatePassNumber = rows?.[0]?.gate_pass_number ? String(rows[0].gate_pass_number).trim() : null;
      return {
        lastGatePassNumber,
        nextGatePassNumber: this.computeNextGatePassNumber(lastGatePassNumber),
      };
    } catch (err: any) {
      this.logger.warn(`Failed to compute next gate pass number: ${err?.message || err}`);
      return { lastGatePassNumber: null, nextGatePassNumber: 'GP-0001' };
    }
  }

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
      gatePassNumber: dto.gatePassNumber ? String(dto.gatePassNumber).trim() : null,
      notes: dto.notes || null,
      status: 'DRAFT',
      createdBy: safeUserId,
      updatedBy: safeUserId,
    });
    const saved = await this.repo.save(delivery) as SalesDelivery;

    if (dto.lines && dto.lines.length > 0) {
      let subtotal = 0;
      let taxAmount = 0;
      let totalAmount = 0;
      let lineNumber = 1;
      for (const lineDto of dto.lines) {
        const qty = Number(lineDto.quantity || 0);
        const rate = Number(lineDto.unitPrice ?? lineDto.rate ?? 0);
        const lSub = Math.round(qty * rate * 100) / 100;
        const lTax = Math.round(Number(lineDto.taxAmount || 0) * 100) / 100;
        const lineTotal =
          lineDto.lineTotal !== undefined && lineDto.lineTotal !== null
            ? Math.round(Number(lineDto.lineTotal) * 100) / 100
            : Math.round((lSub + lTax) * 100) / 100;
        const line = this.lineRepo.create({
          deliveryId: saved.id,
          lineNumber: lineNumber++,
          itemId: isUuid(lineDto.itemId) ? lineDto.itemId : null,
          description: lineDto.description || null,
          quantity: qty,
          uomId: isUuid(lineDto.uomId) ? lineDto.uomId : null,
          warehouseId: isUuid(lineDto.warehouseId) ? lineDto.warehouseId : (isUuid(saved.warehouseId) ? saved.warehouseId : null),
          unitPrice: rate,
          taxAmount: lTax,
          lineTotal,
        });
        await this.lineRepo.save(line);
        subtotal += lSub;
        taxAmount += lTax;
        totalAmount += lineTotal;
      }
      saved.subtotal = Math.round(subtotal * 100) / 100;
      saved.taxAmount = Math.round(taxAmount * 100) / 100;
      saved.totalAmount = Math.round(totalAmount * 100) / 100;
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
    if (search) { qb[hasWhere ? 'andWhere' : 'where']('(sd.deliveryNumber ILIKE :search OR sd.gatePassNumber ILIKE :search OR sd.carrier ILIKE :search OR sd.trackingNumber ILIKE :search OR customer.companyName ILIKE :search OR salesOrder.orderNumber ILIKE :search)', { search: `%${search}%` }); hasWhere = true; }
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
    const gatePassMeta = await this.getNextGatePassNumber(companyId);
    return { data, total, ...gatePassMeta } as any;
  }

  private formatDispatchOrdinal(n: number): string {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${n}th Dispatch`;
    switch (n % 10) {
      case 1: return `${n}st Dispatch`;
      case 2: return `${n}nd Dispatch`;
      case 3: return `${n}rd Dispatch`;
      default: return `${n}th Dispatch`;
    }
  }

  private async enrichDeliveriesWithSocData(rawDeliveries: any[]): Promise<any[]> {
    if (!rawDeliveries || rawDeliveries.length === 0) return [];

    // 1. Collect all distinct SOC numbers referenced across the deliveries
    const allSocNumbers = new Set<string>();
    const companyIds = Array.from(
      new Set(rawDeliveries.map((sd) => sd.companyId).filter(Boolean)),
    );
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
    const shippedBySocItemMap = new Map<string, number>();
    const socTimelineMap = new Map<string, Array<{
      deliveryId: string;
      status: string;
      lineQtyByItem: Map<string, number>;
    }>>();

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

        // Fetch all non-cancelled deliveries chronologically to compute accurate
        // per-SOC dispatch sequence ordinals (1st, 2nd, 3rd, 4th...) & cumulative balances.
        const chronoParams: any[] = [];
        const whereClauses = [
          `sd.deleted_at IS NULL`,
          `UPPER(COALESCE(sd.status, 'DRAFT')) <> 'CANCELLED'`,
        ];
        if (companyIds.length > 0) {
          chronoParams.push(companyIds);
          whereClauses.push(`sd.company_id = ANY($${chronoParams.length})`);
        }
        const chronoRows = await this.repo.manager.query(
          `SELECT sd.id AS delivery_id, sd.delivery_number,
                  UPPER(COALESCE(sd.status, 'DRAFT')) AS status,
                  sd.delivery_date, sd.created_at,
                  sdl.item_id, sdl.description, sdl.quantity AS line_qty,
                  so.order_number AS header_soc, i.packaging_size
           FROM erp_sales.sales_deliveries sd
           LEFT JOIN erp_sales.sales_orders so ON so.id = sd.sales_order_id
           LEFT JOIN erp_sales.sales_delivery_lines sdl ON sdl.delivery_id = sd.id
           LEFT JOIN public.items i ON i.id = sdl.item_id
           WHERE ${whereClauses.join(' AND ')}
           ORDER BY sd.delivery_date ASC, sd.created_at ASC, sd.delivery_number ASC`,
          chronoParams,
        );

        const shippedStatuses = new Set(['CONFIRMED', 'DELIVERED', 'SHIPPED']);
        const deliveryEntryBySoc = new Map<string, Map<string, { deliveryId: string; status: string; lineQtyByItem: Map<string, number> }>>();

        for (const r of chronoRows) {
          const socMatch = r.description?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
          const lineSoc = (socMatch ? socMatch[1].trim() : (r.header_soc ? String(r.header_soc).trim() : null));
          const headerSoc = r.header_soc ? String(r.header_soc).trim() : null;

          // Record timeline membership per distinct (soc, delivery_id)
          const touchedSocs = Array.from(new Set([lineSoc, headerSoc].filter(Boolean) as string[]))
            .filter((s) => allSocNumbers.has(s));

          for (const soc of touchedSocs) {
            let socDelivMap = deliveryEntryBySoc.get(soc);
            if (!socDelivMap) {
              socDelivMap = new Map();
              deliveryEntryBySoc.set(soc, socDelivMap);
            }
            let dEntry = socDelivMap.get(r.delivery_id);
            if (!dEntry) {
              dEntry = {
                deliveryId: r.delivery_id,
                status: r.status,
                lineQtyByItem: new Map<string, number>(),
              };
              socDelivMap.set(r.delivery_id, dEntry);
              const list = socTimelineMap.get(soc) || [];
              list.push(dEntry);
              socTimelineMap.set(soc, list);
            }
            if (lineSoc === soc && r.item_id) {
              const q = Number(r.line_qty || 0);
              dEntry.lineQtyByItem.set(r.item_id, (dEntry.lineQtyByItem.get(r.item_id) || 0) + q);
            }
          }

          if (lineSoc && allSocNumbers.has(lineSoc) && shippedStatuses.has(r.status)) {
            const pSize = Number(r.packaging_size || 10) || 10;
            const q = Number(r.line_qty || 0);
            const c = Math.round((q / pSize) * 100) / 100;
            const curr = shippedPerSocMap.get(lineSoc) || { qty: 0, ctn: 0 };
            shippedPerSocMap.set(lineSoc, { qty: curr.qty + q, ctn: curr.ctn + c });
            if (r.item_id) {
              const siKey = `${lineSoc}_${r.item_id}`;
              shippedBySocItemMap.set(siKey, (shippedBySocItemMap.get(siKey) || 0) + q);
            }
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to enrich deliveries with SOC data: ${err.message}`);
      }
    }

    const isMeterUom = (u?: string | null) =>
      ['M', 'MTR', 'METER', 'METRE', 'METERS', 'METRES'].includes(String(u || '').toUpperCase().trim());

    const shippedStatuses = new Set(['CONFIRMED', 'DELIVERED', 'SHIPPED']);

    return rawDeliveries.map((sd: any) => {
      // Precompute per-SOC ordinal index for this delivery (CONFIRMED/SHIPPED/DELIVERED + current sd if DRAFT)
      const seqBySoc = new Map<string, { dispatchOrdinal: number; totalSocDispatches: number; dispatchLabel: string; shippedUpToByItem: Map<string, number> }>();
      const getSocSequence = (soc: string | null) => {
        if (!soc) return null;
        if (seqBySoc.has(soc)) return seqBySoc.get(soc)!;
        const timeline = socTimelineMap.get(soc) || [];
        const activeTimeline = timeline.filter(
          (entry) => shippedStatuses.has(entry.status) || entry.deliveryId === sd.id,
        );
        const idx = activeTimeline.findIndex((entry) => entry.deliveryId === sd.id);
        const dispatchOrdinal = idx >= 0 ? idx + 1 : activeTimeline.length + 1;
        const totalSocDispatches = idx >= 0 ? activeTimeline.length : activeTimeline.length + 1;
        const shippedUpToByItem = new Map<string, number>();
        const upperLimit = idx >= 0 ? idx : activeTimeline.length - 1;
        for (let i = 0; i <= upperLimit; i++) {
          const entry = activeTimeline[i];
          if (shippedStatuses.has(entry.status) || entry.deliveryId === sd.id) {
            entry.lineQtyByItem.forEach((qtyVal, itemId) => {
              shippedUpToByItem.set(itemId, (shippedUpToByItem.get(itemId) || 0) + qtyVal);
            });
          }
        }
        const computed = {
          dispatchOrdinal,
          totalSocDispatches,
          dispatchLabel: this.formatDispatchOrdinal(dispatchOrdinal),
          shippedUpToByItem,
        };
        seqBySoc.set(soc, computed);
        return computed;
      };

      const lines = (sd.lines || []).map((l: any) => {
        const socMatch = l.description?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
        const lineSoc = socMatch ? socMatch[1].trim() : (sd.salesOrder?.orderNumber || null);
        const uomCode = l.uom?.code || 'GRS';
        const isMeter = isMeterUom(uomCode);
        const pSize = Number(l.item?.packagingSize || l.packagingSize || 10) || 10;
        const qty = Number(l.quantity) || 0;
        const ctn = Math.round((qty / pSize) * 100) / 100;
        const rawWpm = l.item?.weightPerMeter != null ? Number(l.item.weightPerMeter) : null;
        const finWpm = l.item?.finishedWeightPerMeter != null ? Number(l.item.finishedWeightPerMeter) : null;
        const effectiveWpm = isMeter
          ? ((finWpm != null && finWpm > 0) ? finWpm : ((rawWpm != null && rawWpm > 0) ? rawWpm : 0))
          : 0;
        const totalWeightKg = isMeter && effectiveWpm > 0 ? Number((qty * effectiveWpm).toFixed(3)) : null;

        const socSeq = getSocSequence(lineSoc);
        const soItems = lineSoc ? (soItemsMap.get(lineSoc) || []) : [];
        const matchedSoi = soItems.find((oi: any) => oi.item_id === l.itemId);
        const lineOrderQty = matchedSoi ? Math.round(Number(matchedSoi.order_qty || 0) * 100) / 100 : null;
        const shippedUpToLine = lineSoc && l.itemId
          ? (socSeq?.shippedUpToByItem.get(l.itemId) ?? (shippedBySocItemMap.get(`${lineSoc}_${l.itemId}`) || 0) + (shippedStatuses.has(String(sd.status || '').toUpperCase()) ? 0 : qty))
          : qty;
        const lineBalanceAfter = lineOrderQty != null ? Math.max(0, Math.round((lineOrderQty - shippedUpToLine) * 100) / 100) : null;
        const lineIsFinal = lineOrderQty != null && lineOrderQty > 0 && lineBalanceAfter != null && lineBalanceAfter <= 0.001;

        return {
          ...l,
          socNumber: lineSoc,
          packagingSize: pSize,
          packagingUnit: l.item?.packagingUnit || (isMeter ? 'Coil' : 'CTN'),
          cartons: ctn,
          itemCode: l.item?.itemCode || l.itemCode,
          itemName: l.item?.name || l.itemName || l.description,
          uomCode,
          weightPerMeter: rawWpm,
          finishedWeightPerMeter: finWpm,
          ...(totalWeightKg != null ? { totalWeightKg } : {}),
          ...(socSeq ? {
            dispatchOrdinal: socSeq.dispatchOrdinal,
            dispatchLabel: socSeq.dispatchLabel,
            totalSocDispatches: socSeq.totalSocDispatches,
          } : {}),
          ...(lineOrderQty != null ? { orderQuantity: lineOrderQty } : {}),
          ...(lineBalanceAfter != null ? { balanceQuantity: lineBalanceAfter } : {}),
          isFinalDispatch: lineIsFinal,
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

        const shipped = shippedPerSocMap.get(soc) || { qty: 0, ctn: 0 };
        const isCurrentShipped = shippedStatuses.has(String(sd.status || '').toUpperCase());
        const effectiveTotalDelivered = isCurrentShipped ? shipped.qty : shipped.qty + thisDispQty;
        const balQty = Math.max(0, orderQty - (shipped.qty > 0 || isCurrentShipped ? shipped.qty : thisDispQty));
        const balAfterThisDelivery = Math.max(0, orderQty - effectiveTotalDelivered);
        const balCtn = Math.max(0, orderCtn - (shipped.ctn > 0 || isCurrentShipped ? shipped.ctn : thisDispCtn));
        const pct = orderQty > 0 ? Math.min(100, Math.round(((orderQty - balQty) / orderQty) * 100)) : 100;
        const socSeq = getSocSequence(soc);
        const dispatchOrdinal = socSeq?.dispatchOrdinal || 1;
        const totalSocDispatches = socSeq?.totalSocDispatches || 1;

        return {
          socNumber: soc,
          salesOrderId: soMetaMap.get(soc)?.id || null,
          customerPo: soMetaMap.get(soc)?.customerPo || null,
          dispatchOrdinal,
          dispatchLabel: this.formatDispatchOrdinal(dispatchOrdinal),
          totalSocDispatches,
          isFinalDispatch: orderQty > 0 && balAfterThisDelivery <= 0.001,
          thisDeliveryQuantity: Math.round(thisDispQty * 100) / 100,
          thisDeliveryCartons: Math.round(thisDispCtn * 100) / 100,
          totalOrderQuantity: Math.round(orderQty * 100) / 100,
          totalOrderCartons: Math.round(orderCtn * 100) / 100,
          totalShippedQuantity: Math.round(shipped.qty * 100) / 100,
          totalShippedCartons: Math.round(shipped.ctn * 100) / 100,
          balanceQuantity: Math.round(balQty * 100) / 100,
          balanceAfterThisDelivery: Math.round(balAfterThisDelivery * 100) / 100,
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
      salesOrderNumber: enriched?.salesOrderNumber || delivery.salesOrder?.orderNumber || null,
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
      gatePassNumber: dto.gatePassNumber !== undefined ? (dto.gatePassNumber ? String(dto.gatePassNumber).trim() : null) : delivery.gatePassNumber,
      notes: dto.notes !== undefined ? (dto.notes || null) : delivery.notes,
      subtotal,
      taxAmount,
      totalAmount,
      updatedBy: safeUserId,
    });

    return this.findOne(id, companyId, allowedDivisionIds);
  }

  /**
   * Apply a uniform tax percentage (e.g., 18% GST or 0% Tax-Free) across all lines
   * of an active delivery note and recalculate line & header totals atomically.
   */
  async applyTaxRate(
    id: string,
    taxPercent: number = 18,
    userId?: string,
    companyId?: string,
    allowedDivisionIds?: DivisionAccess,
  ): Promise<SalesDelivery> {
    const ratePct = Number(taxPercent);
    if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
      throw new BadRequestException('Tax percentage must be between 0 and 100');
    }

    const delivery = await this.findOne(id, companyId, allowedDivisionIds);
    const statusUpper = String(delivery.status || '').toUpperCase();
    if (statusUpper === 'CANCELLED') {
      throw new BadRequestException('Cannot apply tax to a cancelled delivery note');
    }

    const lines = await this.lineRepo.find({
      where: { deliveryId: id },
      order: { lineNumber: 'ASC' },
    });
    if (lines.length === 0) {
      throw new BadRequestException('Delivery has no lines to update tax on');
    }

    let subtotal = 0;
    let taxAmount = 0;
    let totalAmount = 0;

    for (const line of lines) {
      const qty = Number(line.quantity || 0);
      const unitPrice = Number(line.unitPrice || 0);
      const lineSub = Math.round(qty * unitPrice * 100) / 100;
      const lineTax = Math.round(lineSub * (ratePct / 100) * 100) / 100;
      const lineTotal = Math.round((lineSub + lineTax) * 100) / 100;
      await this.lineRepo.update(line.id, {
        taxAmount: lineTax,
        lineTotal,
      });
      subtotal += lineSub;
      taxAmount += lineTax;
      totalAmount += lineTotal;
    }

    const safeUserId = isUuid(userId) ? userId : null;
    await this.repo.update(id, {
      subtotal: Math.round(subtotal * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
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

    // Update parent Sales Order(s) line items shipped quantities (supports multi-SOC lines via [SOC: ...])
    try {
      const affectedOrderIds = new Set<string>();
      if (delivery.salesOrderId) affectedOrderIds.add(delivery.salesOrderId);

      for (const line of lines) {
        let targetOrderId = delivery.salesOrderId;
        const socMatch = line.description?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
        if (socMatch) {
          const lineSoc = socMatch[1].trim();
          const lineOrder = await this.orderRepo.findOne({
            where: { orderNumber: lineSoc, companyId: delivery.companyId },
          });
          if (lineOrder) {
            targetOrderId = lineOrder.id;
          }
        }
        if (!targetOrderId) continue;
        affectedOrderIds.add(targetOrderId);

        const orderItems = await this.orderItemRepo.find({ where: { salesOrderId: targetOrderId } });
        const matched = orderItems.find((oi) => oi.itemId === line.itemId);
        if (matched) {
          matched.shippedQuantity = Number(matched.shippedQuantity || 0) + Number(line.quantity);
          if (matched.shippedQuantity >= Number(matched.quantity)) {
            matched.status = 'Delivered';
          }
          await this.orderItemRepo.save(matched);
        }
      }

      for (const orderId of affectedOrderIds) {
        const orderItems = await this.orderItemRepo.find({ where: { salesOrderId: orderId } });
        const parentOrder = await this.orderRepo.findOne({ where: { id: orderId } });
        if (parentOrder && parentOrder.status !== 'Closed' && orderItems.length > 0) {
          const allDelivered = orderItems.every((oi) => Number(oi.shippedQuantity || 0) >= Number(oi.quantity));
          parentOrder.status = allDelivered ? 'Delivered' : 'Processing';
          await this.orderRepo.save(parentOrder);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to update sales order shipment tracking: ${err.message}`);
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
    delivery.updatedBy = isUuid(userId) ? userId : null;
    return this.repo.save(delivery);
  }

  async restoreToDraft(id: string, userId?: string, companyId?: string, allowedDivisionIds?: DivisionAccess): Promise<SalesDelivery> {
    const delivery = await this.findOne(id, companyId, allowedDivisionIds);
    if (String(delivery.status || '').toUpperCase() !== 'CANCELLED') {
      throw new BadRequestException('Only CANCELLED deliveries can be restored to DRAFT');
    }
    const safeUserId = isUuid(userId) ? userId : null;
    await this.repo.update(delivery.id, {
      status: 'DRAFT',
      updatedBy: safeUserId,
    });
    delivery.status = 'DRAFT';
    delivery.updatedBy = safeUserId;
    return delivery;
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
