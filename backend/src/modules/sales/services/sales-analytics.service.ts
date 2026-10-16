import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import {
  SalesOrder, SalesOrderItem,
  SalesDelivery, SalesDeliveryLine,
  SalesInvoice,
  SalesQuotation,
  SalesReturn, SalesReturnLine,
  SalesCustomer,
} from '../entities';
import { ProductionOrder } from '../../production/entities/production-order.entity';
import { InventoryBalance } from '../../inventory/entities/inventory-balance.entity';
import { CustomerLedgerEntry, CustomerDocumentType } from '../../customer/entities/customer-ledger.entity';
import { Item, ItemType } from '../../item/entities/item.entity';
import { Customer } from '../../customer/entities/customer.entity';
import { CustomerLedgerService } from '../../customer/services/customer-ledger.service';
import { customerNameMatchKeys, normalizeCustomerName } from './customer-match.util';
import { isCommittedReturnStatus } from './sales-return-status.util';
import {
  applyDivisionScopeFilter,
  narrowWhereByDivision,
  DivisionAccess,
} from '../../../common/division-scope.util';
import {
  SalesAnalyticsFilterDto,
  SalesAnalyticsPeriod,
  CustomerRankingMetric,
} from '../dto/sales-analytics.dto';

export interface MatrixCell {
  customerId: string;
  customerCode: string;
  customerName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  uom: string;
  ordered: number;
  produced: number;
  delivered: number;
  returned: number;
  netSold?: number;
  invoiced: number;
  paid: number;
  outstanding: number;
}

@Injectable()
export class SalesAnalyticsService {
  private readonly logger = new Logger(SalesAnalyticsService.name);

  constructor(
    @InjectRepository(SalesOrder)
    private readonly orderRepo: Repository<SalesOrder>,
    @InjectRepository(SalesOrderItem)
    private readonly orderItemRepo: Repository<SalesOrderItem>,
    @InjectRepository(SalesDelivery)
    private readonly deliveryRepo: Repository<SalesDelivery>,
    @InjectRepository(SalesDeliveryLine)
    private readonly deliveryLineRepo: Repository<SalesDeliveryLine>,
    @InjectRepository(SalesInvoice)
    private readonly invoiceRepo: Repository<SalesInvoice>,
    @InjectRepository(SalesQuotation)
    private readonly quotationRepo: Repository<SalesQuotation>,
    @InjectRepository(SalesReturn)
    private readonly returnRepo: Repository<SalesReturn>,
    @InjectRepository(SalesReturnLine)
    private readonly returnLineRepo: Repository<SalesReturnLine>,
    @InjectRepository(SalesCustomer)
    private readonly salesCustomerRepo: Repository<SalesCustomer>,
    @InjectRepository(ProductionOrder)
    private readonly productionOrderRepo: Repository<ProductionOrder>,
    @InjectRepository(InventoryBalance)
    private readonly balanceRepo: Repository<InventoryBalance>,
    @InjectRepository(CustomerLedgerEntry)
    private readonly ledgerRepo: Repository<CustomerLedgerEntry>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Customer)
    private readonly customerMasterRepo: Repository<Customer>,
    @Inject(forwardRef(() => CustomerLedgerService))
    private readonly customerLedgerService: CustomerLedgerService,
  ) {}

  /**
   * Helper to convert quantity between UOM codes for sales analytics.
   * Standard conversion: 1 GRS = 144 PCS (or reverse).
   */
  private convertQty(qty: number, fromCode?: string, toCode?: string): number {
    const n = Number(qty || 0);
    if (!n || !fromCode || !toCode) return n;
    const from = fromCode.toUpperCase().trim();
    const to = toCode.toUpperCase().trim();
    if (from === to) return n;
    if ((from === 'PCS' || from === 'PC' || from === 'EA') && (to === 'GRS' || to === 'GROSS')) {
      return Math.round((n / 144) * 10000) / 10000;
    }
    if ((from === 'GRS' || from === 'GROSS') && (to === 'PCS' || to === 'PC' || to === 'EA')) {
      return Math.round(n * 144);
    }
    return n;
  }

  /**
   * Helper to resolve date range from filter
   */
  private resolveDateRange(filter?: SalesAnalyticsFilterDto): { startDate?: string; endDate?: string } {
    if (!filter) return {};
    const now = new Date();
    if (filter.period) {
      switch (filter.period) {
        case SalesAnalyticsPeriod.ALL:
        case 'all' as any:
          return {};
        case SalesAnalyticsPeriod.TODAY: {
          const today = now.toISOString().split('T')[0];
          return { startDate: today, endDate: today };
        }
        case SalesAnalyticsPeriod.THIS_WEEK: {
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(now.setDate(diff));
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 6);
          return {
            startDate: monday.toISOString().split('T')[0],
            endDate: sunday.toISOString().split('T')[0],
          };
        }
        case SalesAnalyticsPeriod.THIS_MONTH: {
          const year = now.getFullYear();
          const month = now.getMonth();
          const start = new Date(year, month, 1);
          const end = new Date(year, month + 1, 0);
          return {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
          };
        }
        case SalesAnalyticsPeriod.THIS_QUARTER: {
          const quarter = Math.floor(now.getMonth() / 3);
          const start = new Date(now.getFullYear(), quarter * 3, 1);
          const end = new Date(now.getFullYear(), (quarter + 1) * 3, 0);
          return {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
          };
        }
        case SalesAnalyticsPeriod.THIS_YEAR: {
          const year = now.getFullYear();
          return {
            startDate: `${year}-01-01`,
            endDate: `${year}-12-31`,
          };
        }
        case SalesAnalyticsPeriod.CUSTOM:
        default:
          return { startDate: filter.dateFrom, endDate: filter.dateTo };
      }
    }
    return { startDate: filter.dateFrom, endDate: filter.dateTo };
  }

  /**
   * 1. SALES DASHBOARD & EXECUTIVE KPIS
   */
  async getSalesDashboard(
    companyId: string,
    filter?: SalesAnalyticsFilterDto,
    allowedDivisionIds?: DivisionAccess,
  ) {
    const { startDate, endDate } = this.resolveDateRange(filter);

    // 1. Sales Orders query
    const orderQb = this.orderRepo.createQueryBuilder('so')
      .where('so.companyId = :companyId', { companyId });
    if (startDate) orderQb.andWhere('so.orderDate >= :startDate', { startDate });
    if (endDate) orderQb.andWhere('so.orderDate <= :endDate', { endDate });
    // PROMPT #27 — `so.divisionId` is the single authoritative attribution for
    // the whole dashboard, so scoping this one query keeps every order-derived
    // KPI (open / in-production / delivered / pipeline value) inside the
    // caller's divisions. Not `includeUnassigned`: an order with no division
    // is not inside any restricted caller's permitted set.
    applyDivisionScopeFilter(orderQb as any, 'so.divisionId', allowedDivisionIds);
    const orders = await orderQb.getMany();

    const totalSalesOrders = orders.length;
    const openOrders = orders.filter(o => !['Delivered', 'Cancelled', 'Closed'].includes(o.status)).length;
    const ordersInProduction = orders.filter(o => ['Processing', 'IN_PRODUCTION'].includes(o.status)).length;
    const deliveredOrders = orders.filter(o => ['Delivered', 'Partially Delivered', 'PARTIALLY_DELIVERED'].includes(o.status)).length;
    const pendingDelivery = orders.filter(o => ['Confirmed', 'Processing', 'Ready', 'PARTIALLY_DELIVERED'].includes(o.status)).length;

    // 2. Invoices query — invoices have no division of their own; they inherit
    // the billing order's, so the scope is applied through a join to that order.
    const invQb = this.invoiceRepo.createQueryBuilder('si')
      .leftJoin('si.salesOrder', 'invOrder')
      .where('si.companyId = :companyId', { companyId });
    if (startDate) invQb.andWhere('si.invoiceDate >= :startDate', { startDate });
    if (endDate) invQb.andWhere('si.invoiceDate <= :endDate', { endDate });
    applyDivisionScopeFilter(invQb as any, 'invOrder.divisionId', allowedDivisionIds);
    const invoices = await invQb.getMany();

    const activeInvoices = invoices.filter(i => i.status !== 'Cancelled');
    const invoicedAmount = activeInvoices.reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
    const paidAmount = activeInvoices.reduce((sum, i) => sum + (Number(i.paidAmount) || 0), 0);
    const outstandingAmount = Math.max(0, invoicedAmount - paidAmount);

    // 3. Finished Goods stock (FG-only: converted to Sales UOM e.g. GRS)
    const fgItems = await this.itemRepo.find({
      where: { companyId, itemType: ItemType.FINISHED_GOOD },
      relations: ['baseUom', 'salesUom'],
      select: ['id', 'itemCode', 'name', 'safetyStockLevel', 'itemType', 'baseUomId', 'salesUomId'],
    });
    const fgItemIds = fgItems.map(i => i.id);

    let finishedGoodsReady = 0;
    let balances: InventoryBalance[] = [];
    if (fgItemIds.length > 0) {
      balances = await this.balanceRepo.createQueryBuilder('ib')
        .where('ib.companyId = :companyId', { companyId })
        .andWhere('ib.itemId IN (:...fgItemIds)', { fgItemIds })
        .getMany();

      const itemMap = new Map<string, Item>();
      fgItems.forEach(i => itemMap.set(i.id, i));

      finishedGoodsReady = balances.reduce((sum, b) => {
        const item = itemMap.get(b.itemId);
        const baseUom = item?.baseUom?.code || 'PCS';
        const salesUom = item?.salesUom?.code || baseUom || 'GRS';
        const availableInSalesUom = this.convertQty(Number(b.available) || 0, baseUom, salesUom);
        return sum + availableInSalesUom;
      }, 0);
      finishedGoodsReady = Math.round(finishedGoodsReady * 100) / 100;
    }

    // 4. Quotations
    const qtnQb = this.quotationRepo.createQueryBuilder('sq')
      .where('sq.companyId = :companyId', { companyId });
    if (startDate) qtnQb.andWhere('sq.quotationDate >= :startDate', { startDate });
    if (endDate) qtnQb.andWhere('sq.quotationDate <= :endDate', { endDate });
    const quotations = await qtnQb.getMany();
    const totalQuotationsCount = quotations.length;
    const totalQuotationsAmount = quotations.reduce((sum, q) => sum + (Number(q.totalAmount) || 0), 0);

    // 5. Deliveries — inherits the source order's division.
    const delQb = this.deliveryRepo.createQueryBuilder('sd')
      .leftJoin('sd.salesOrder', 'delOrder')
      .where('sd.companyId = :companyId', { companyId });
    if (startDate) delQb.andWhere('sd.deliveryDate >= :startDate', { startDate });
    if (endDate) delQb.andWhere('sd.deliveryDate <= :endDate', { endDate });
    applyDivisionScopeFilter(delQb as any, 'delOrder.divisionId', allowedDivisionIds);
    const deliveries = await delQb.getMany();
    const totalDeliveriesCount = deliveries.length;
    const totalDeliveriesAmount = deliveries.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0);

    // 6. Production Orders
    const prodQb = this.productionOrderRepo.createQueryBuilder('po')
      .where('po.companyId = :companyId', { companyId });
    const productionOrders = await prodQb.getMany();
    const totalProdOrdersCount = productionOrders.length;
    const totalProdPlannedQty = productionOrders.reduce((sum, p) => sum + (Number(p.plannedQuantity) || 0), 0);

    // 7. Returns & Credit Notes — inherits the source order's division.
    const retQb = this.returnRepo.createQueryBuilder('sr')
      .leftJoin('sr.salesOrder', 'retOrder')
      .where('sr.companyId = :companyId', { companyId });
    if (startDate) retQb.andWhere('sr.returnDate >= :startDate', { startDate });
    if (endDate) retQb.andWhere('sr.returnDate <= :endDate', { endDate });
    applyDivisionScopeFilter(retQb as any, 'retOrder.divisionId', allowedDivisionIds);
    const allReturns = await retQb.getMany();

    const activeReturns = allReturns.filter(r => isCommittedReturnStatus(r.status));
    const returnCount = activeReturns.length;
    const returnAmount = activeReturns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
    const creditNotesCount = activeReturns.filter(r => Boolean(r.creditNoteNumber) || r.creditPosted).length;
    const creditNoteAmount = activeReturns.filter(r => r.creditPosted).reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);

    const grossSales = invoicedAmount;
    const netSales = Math.max(0, grossSales - returnAmount);
    const reconciledOutstanding = Math.max(0, grossSales - paidAmount - returnAmount);

    // 8. Visual Sales Pipeline with counts & monetary values
    const salesPipeline = [
      { stage: 'QUOTATION', title: 'Quotations', count: totalQuotationsCount, value: totalQuotationsAmount, unit: 'PKR', color: '#1890ff' },
      { stage: 'SALES_ORDER', title: 'Sales Orders', count: totalSalesOrders, value: orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0), unit: 'PKR', color: '#722ed1' },
      { stage: 'PRODUCTION', title: 'Production Orders', count: totalProdOrdersCount, value: totalProdPlannedQty, unit: 'PCS', color: '#fa8c16' },
      { stage: 'FINISHED_GOODS', title: 'FG Available', count: fgItems.length, value: finishedGoodsReady, unit: 'GRS', color: '#13c2c2' },
      { stage: 'DELIVERY', title: 'Deliveries / Dispatches', count: totalDeliveriesCount, value: totalDeliveriesAmount, unit: 'PKR', color: '#faad14' },
      { stage: 'INVOICE', title: 'Gross Invoices', count: activeInvoices.length, value: invoicedAmount, unit: 'PKR', color: '#2f54eb' },
      { stage: 'SALES_RETURN', title: 'Sales Returns', count: returnCount, value: returnAmount, unit: 'PKR', color: '#f5222d' },
      { stage: 'CREDIT_NOTE', title: 'Credit Notes', count: creditNotesCount, value: creditNoteAmount, unit: 'PKR', color: '#722ed1' },
      { stage: 'PAYMENT', title: 'Customer Payments', count: activeInvoices.filter(i => Number(i.paidAmount) > 0).length, value: paidAmount, unit: 'PKR', color: '#52c41a' },
    ];

    // 9. Customer Section: Top customers & recent records
    const customerAgg = await this.getCustomerSalesAnalytics(companyId, filter, allowedDivisionIds);
    const activeCustomerAgg = customerAgg.filter(c => (c.totalSalesOrders > 0 || c.invoicedAmount > 0 || c.orderedQuantity > 0));
    const customerPool = activeCustomerAgg.length > 0 ? activeCustomerAgg : customerAgg;

    const topCustomersBySalesAmount = [...customerPool].sort((a, b) => {
      const aVal = (a.invoicedAmount > 0 ? a.invoicedAmount : ((a as any).salesOrderAmount || 0));
      const bVal = (b.invoicedAmount > 0 ? b.invoicedAmount : ((b as any).salesOrderAmount || 0));
      return bVal - aVal;
    }).slice(0, 5);

    const topCustomersByDeliveredQty = [...customerPool].sort((a, b) => (b.deliveredQuantity || 0) - (a.deliveredQuantity || 0)).slice(0, 5);
    const topCustomersByOutstanding = [...customerPool].sort((a, b) => (b.outstandingAmount || 0) - (a.outstandingAmount || 0)).slice(0, 5);

    const recentOrders = await this.orderRepo.find({
      where: narrowWhereByDivision({ companyId }, 'divisionId', allowedDivisionIds),
      order: { createdAt: 'DESC' },
      take: 5,
    });
    // PROMPT #27 — "recent invoices" must not surface another division's
    // billing activity, so the scope is applied through the billing order.
    const recentInvoiceQb = this.invoiceRepo
      .createQueryBuilder('si')
      .leftJoin('si.salesOrder', 'riOrder')
      .where('si.companyId = :companyId', { companyId })
      .orderBy('si.createdAt', 'DESC')
      .take(5);
    applyDivisionScopeFilter(recentInvoiceQb as any, 'riOrder.divisionId', allowedDivisionIds);
    const recentInvoices = await recentInvoiceQb.getMany();

    // 10. Item Section: Top selling FG & alerts
    const itemAgg = await this.getItemSalesAnalysis(companyId, filter, allowedDivisionIds);
    const activeItemAgg = itemAgg.filter(i => (i.orderedQuantity > 0 || i.salesAmount > 0 || i.deliveredQuantity > 0));
    const itemPool = activeItemAgg.length > 0 ? activeItemAgg : itemAgg;

    const topSellingFinishedGoods = [...itemPool].sort((a, b) => {
      const aVal = (a.salesAmount > 0 ? a.salesAmount : (a.orderedQuantity || 0));
      const bVal = (b.salesAmount > 0 ? b.salesAmount : (b.orderedQuantity || 0));
      return bVal - aVal;
    }).slice(0, 5);

    const highestOrderedFinishedGoods = [...itemPool].sort((a, b) => (b.orderedQuantity || 0) - (a.orderedQuantity || 0)).slice(0, 5);
    const highestDeliveredFinishedGoods = [...itemPool].sort((a, b) => (b.deliveredQuantity || 0) - (a.deliveredQuantity || 0)).slice(0, 5);

    const fgPlanning = await this.getFinishedGoodsAvailability(companyId, filter);
    const finishedGoodsWithOpenOrders = fgPlanning.filter(p => p.openSalesOrderQuantity > 0).slice(0, 5);
    const finishedGoodsBelowSafetyStock = fgPlanning.filter(p => ['BELOW_REQUIREMENT', 'SHORTAGE'].includes(p.status)).slice(0, 5);

    // 11. Nipple Analytics: Map Spoke Set orders to required Nipple components and compare with FG Stock
    const nippleItems = itemAgg.filter(i => 
      (i.itemCode && i.itemCode.startsWith('FG-NP-')) || 
      (i.itemName && i.itemName.toLowerCase().includes('nipple') && !i.itemName.includes('_'))
    );

    const spokeSetsWithNipples = itemAgg.filter(i => i.itemName && i.itemName.includes('_'));

    const nippleAnalytics = nippleItems.map(nItem => {
      const nName = (nItem.itemName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const linkedSpokeSets: Array<{
        spokeName: string;
        itemCode: string;
        orderedQuantity: number;
        packedQuantity: number;
        pendingQuantity: number;
        uom: string;
      }> = [];

      let totalDemand = 0;
      let totalPackedInSpokes = 0;
      let netPendingDemand = 0;

      spokeSetsWithNipples.forEach(sItem => {
        const parts = sItem.itemName.split('_');
        const nippleSpec = parts.slice(1).join('_').trim();
        const cleanSpec = nippleSpec.toLowerCase().replace(/[^a-z0-9]/g, '');

        let matches = false;
        if (nName && cleanSpec) {
          if (cleanSpec.includes('225x17') && nName.includes('225x17')) matches = true;
          else if (cleanSpec.includes('125s9') && nName.includes('125s9')) matches = true;
          else if (cleanSpec.includes('rm250') && nName.includes('rm250')) matches = true;
          else if (cleanSpec.includes('cd250') && nName.includes('cd250')) matches = true;
          else if ((cleanSpec.includes('125300') || cleanSpec.includes('300x17')) && (nName.includes('125300') || nName.includes('300x17'))) matches = true;
          else if (cleanSpec === nName || nName.includes(cleanSpec) || cleanSpec.includes(nName)) matches = true;
        }

        if (matches && ((Number(sItem.orderedQuantity) || 0) > 0 || (Number(sItem.deliveredQuantity) || 0) > 0)) {
          const ordQty = Number(sItem.orderedQuantity) || 0;
          const packedQty = Number(sItem.finishedGoodsAvailable) || 0;
          const pendingQty = Math.max(0, ordQty - packedQty);

          linkedSpokeSets.push({
            spokeName: parts[0].trim(),
            itemCode: sItem.itemCode,
            orderedQuantity: ordQty,
            packedQuantity: packedQty,
            pendingQuantity: pendingQty,
            uom: sItem.uom || 'GRS',
          });
          totalDemand += ordQty;
          totalPackedInSpokes += packedQty;
          netPendingDemand += pendingQty;
        }
      });

      const fgStock = Number(nItem.finishedGoodsAvailable) || 0;
      // Balance is Available Loose Nipple Stock minus Net Pending Demand (unpacked spoke requirement)
      const balance = fgStock - netPendingDemand;

      return {
        itemId: nItem.itemId,
        itemCode: nItem.itemCode,
        itemName: nItem.itemName,
        uom: 'GRS',
        linkedSpokeSets,
        totalDemand: Math.round(totalDemand * 100) / 100,
        totalPackedInSpokes: Math.round(totalPackedInSpokes * 100) / 100,
        netPendingDemand: Math.round(netPendingDemand * 100) / 100,
        fgStock: Math.round(fgStock * 100) / 100,
        baseQuantity: nItem.baseQuantity || 0,
        baseUom: nItem.baseUom || 'PCS',
        balance: Math.round(balance * 100) / 100,
        status: balance < 0 ? 'SHORTAGE' : balance === 0 && netPendingDemand > 0 ? 'EXACT' : 'SUFFICIENT',
      };
    }).sort((a, b) => b.totalDemand - a.totalDemand);

    return {
      kpis: {
        totalSalesOrders,
        openOrders,
        ordersInProduction,
        finishedGoodsReady,
        pendingDelivery,
        deliveredOrders,
        grossSales,
        invoicedAmount,
        returnCount,
        returnAmount,
        creditNotesCount,
        creditNoteAmount,
        netSales,
        paidAmount,
        outstandingAmount: reconciledOutstanding,
      },
      salesPipeline,
      customerSection: {
        topCustomersBySalesAmount,
        topCustomersByDeliveredQty,
        topCustomersByOutstanding,
        recentOrders,
        recentInvoices,
      },
      itemSection: {
        topSellingFinishedGoods,
        highestOrderedFinishedGoods,
        highestDeliveredFinishedGoods,
        finishedGoodsWithOpenOrders,
        finishedGoodsBelowSafetyStock,
        nippleAnalytics,
      },
      nippleAnalytics,
    };
  }

  /**
   * 2. CUSTOMER-WISE SALES ANALYTICS
   */
  async getCustomerSalesAnalytics(
    companyId: string,
    filter?: SalesAnalyticsFilterDto,
    allowedDivisionIds?: DivisionAccess,
  ) {
    const { startDate, endDate } = this.resolveDateRange(filter);

    // Fetch all sales customers in company
    const salesCustomers = await this.salesCustomerRepo.find({
      where: { companyId },
    });

    // Fetch all master customers to reconcile names/codes
    const masterCustomers = await this.customerMasterRepo.find({
      where: { companyId },
    });
    const masterMapByName = new Map<string, Customer>();
    const masterMapByCode = new Map<string, Customer>();
    const masterMapById = new Map<string, Customer>();
    masterCustomers.forEach(c => {
      if (c.name) masterMapByName.set(c.name.trim().toLowerCase(), c);
      if (c.customerCode) masterMapByCode.set(c.customerCode.trim().toLowerCase(), c);
      masterMapById.set(c.id, c);
    });

    // Fetch orders, quotations, deliveries, delivery lines, invoices, returns, return lines
    const [orders, orderItems, quotations, deliveries, deliveryLines, invoices, returns, returnLines, prodOrders, ledgerEntries] = await Promise.all([
      this.orderRepo.find({ 
        where: narrowWhereByDivision({ companyId }, 'divisionId', allowedDivisionIds),
        relations: ['customer'],
      }),
      this.orderItemRepo.find(),
      this.quotationRepo.find({ where: { companyId } }),
      this.deliveryRepo.find({ where: { companyId } }),
      this.deliveryLineRepo.find(),
      this.invoiceRepo.find({ where: { companyId } }),
      this.returnRepo.find({ where: { companyId } }),
      this.returnLineRepo.find(),
      this.productionOrderRepo.find({ where: { companyId } }),
      this.ledgerRepo.find({ where: { companyId } }),
    ]);

    // Map order lines by orderId
    const orderItemsByOrderId = new Map<string, SalesOrderItem[]>();
    orderItems.forEach(item => {
      const arr = orderItemsByOrderId.get(item.salesOrderId) || [];
      arr.push(item);
      orderItemsByOrderId.set(item.salesOrderId, arr);
    });

    // Map return lines by returnId
    const retLinesByRetId = new Map<string, SalesReturnLine[]>();
    returnLines.forEach(line => {
      const arr = retLinesByRetId.get(line.returnId) || [];
      arr.push(line);
      retLinesByRetId.set(line.returnId, arr);
    });

    // Map production completed by salesOrderItemId
    const prodBySoItem = new Map<string, number>();
    prodOrders.forEach(po => {
      if (po.salesOrderItemId) {
        prodBySoItem.set(po.salesOrderItemId, (prodBySoItem.get(po.salesOrderItemId) || 0) + (Number(po.completedQuantity) || 0));
      }
    });

    // Map delivery lines by deliveryId
    const delLinesByDelId = new Map<string, SalesDeliveryLine[]>();
    deliveryLines.forEach(line => {
      const arr = delLinesByDelId.get(line.deliveryId) || [];
      arr.push(line);
      delLinesByDelId.set(line.deliveryId, arr);
    });

    // Build unified customers list: start with salesCustomers
    const unifiedCustomers = new Map<string, { id: string; customerCode: string; companyName: string; creditDays?: number }>();
    salesCustomers.forEach(sc => {
      unifiedCustomers.set(sc.id, {
        id: sc.id,
        customerCode: sc.customerCode,
        companyName: sc.companyName,
        creditDays: sc.creditDays,
      });
    });

    // Also inject any customer from orders that may not be in salesCustomers
    orders.forEach(o => {
      if (o.customerId && !unifiedCustomers.has(o.customerId)) {
        const mc = masterMapById.get(o.customerId);
        const name = o.customer?.companyName || mc?.name || (o as any).customerName || 'Customer';
        const code = o.customer?.customerCode || mc?.customerCode || 'CUST';
        unifiedCustomers.set(o.customerId, {
          id: o.customerId,
          customerCode: code,
          companyName: name,
          creditDays: 30,
        });
      }
    });

    const results = Array.from(unifiedCustomers.values()).map(sc => {
      const master = masterMapByName.get((sc.companyName || '').trim().toLowerCase()) ||
                     masterMapByCode.get((sc.customerCode || '').trim().toLowerCase()) ||
                     masterMapById.get(sc.id);

      const cOrders = orders.filter(o => 
        o.customerId === sc.id || 
        (master && o.customerId === master.id) ||
        (o.customer?.companyName && (sc.companyName || '').trim().toLowerCase() === o.customer.companyName.trim().toLowerCase())
      );
      const cQuotations = quotations.filter(q => q.customerId === sc.id || (master && q.customerId === master.id));
      const cDeliveries = deliveries.filter(d => d.customerId === sc.id || (master && d.customerId === master.id));
      const cInvoices = invoices.filter(i => (i.customerId === sc.id || (master && i.customerId === master.id)) && i.status !== 'Cancelled');
      const cReturns = returns.filter(r => (r.customerId === sc.id || (master && r.customerId === master.id)) && isCommittedReturnStatus(r.status));
      const salesOrderAmount = cOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);

      // Quantities and Item Diversity
      const custItemIds = new Set<string>();
      let orderedQuantity = 0;
      let producedQuantity = 0;
      let totalItemLines = 0;
      cOrders.forEach(o => {
        const items = orderItemsByOrderId.get(o.id) || [];
        totalItemLines += items.length;
        items.forEach(it => {
          if (it.itemId) custItemIds.add(it.itemId);
          orderedQuantity += Number(it.quantity) || 0;
          producedQuantity += prodBySoItem.get(it.id) || 0;
        });
      });

      let deliveredQuantity = 0;
      cDeliveries.forEach(d => {
        const lines = delLinesByDelId.get(d.id) || [];
        lines.forEach(l => {
          deliveredQuantity += Number(l.quantity) || 0;
        });
      });

      // Returns and Credit Notes
      let returnedQuantity = 0;
      cReturns.forEach(r => {
        const lines = retLinesByRetId.get(r.id) || [];
        lines.forEach(l => {
          returnedQuantity += Number(l.quantity) || 0;
        });
      });
      const returnAmount = cReturns.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
      const creditNoteAmount = cReturns.filter(r => r.creditPosted).reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0);
      const creditNotesCount = cReturns.filter(r => Boolean(r.creditNoteNumber) || r.creditPosted).length;

      const invoicedAmount = cInvoices.reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
      const paidAmount = cInvoices.reduce((sum, i) => sum + (Number(i.paidAmount) || 0), 0);
      const netSoldQuantity = Math.max(0, deliveredQuantity - returnedQuantity);
      const netSales = Math.max(0, invoicedAmount - returnAmount);

      // Outstanding: credits (posted credit notes) reduce AR, not un-credited
      // return proposals. The ledger becomes authoritative only once it fully
      // covers this customer's invoices; legacy invoices predate ledger posting.
      let outstandingAmount = Math.max(0, invoicedAmount - paidAmount - creditNoteAmount);
      if (master) {
        const cLedger = ledgerEntries.filter(l => l.customerId === master.id);
        const ledgerInvoiceDebits = cLedger
          .filter(l => l.documentType === CustomerDocumentType.SALES_INVOICE)
          .reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
        if (cLedger.length > 0 && ledgerInvoiceDebits >= invoicedAmount) {
          const debits = cLedger.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
          const credits = cLedger.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
          outstandingAmount = Math.max(0, debits - credits);
        }
      }

      // Dates
      const orderDates = cOrders.map(o => o.orderDate).filter(Boolean).sort();
      const lastOrderDate = orderDates.length > 0 ? orderDates[orderDates.length - 1] : null;

      const delDates = cDeliveries.map(d => d.deliveryDate).filter(Boolean).sort();
      const lastDeliveryDate = delDates.length > 0 ? delDates[delDates.length - 1] : null;

      const invDates = cInvoices.map(i => i.invoiceDate).filter(Boolean).sort();
      const lastInvoiceDate = invDates.length > 0 ? invDates[invDates.length - 1] : null;

      const retDates = cReturns.map(r => r.returnDate).filter(Boolean).sort();
      const lastReturnDate = retDates.length > 0 ? retDates[retDates.length - 1] : null;
      const lastSaleDate = lastInvoiceDate || lastDeliveryDate || lastOrderDate;

      return {
        customerId: sc.id,
        masterCustomerId: master ? master.id : null,
        customerCode: sc.customerCode,
        customerName: sc.companyName,
        customerStatus: master ? master.status : 'ACTIVE',
        paymentTerms: master?.paymentTerms || 'Net 30 Days',
        totalQuotations: cQuotations.length,
        totalSalesOrders: cOrders.length,
        totalItemsCount: custItemIds.size,
        itemCount: custItemIds.size,
        totalItemLines,
        uom: 'GRS',
        salesOrderAmount,
        orderedQuantity,
        producedQuantity,
        deliveredQuantity,
        returnedQuantity,
        netSoldQuantity,
        invoicedAmount,
        returnAmount,
        creditNoteAmount,
        netSales,
        paidAmount,
        creditNotesCount,
        outstandingAmount: Math.max(0, outstandingAmount),
        lastOrderDate,
        lastDeliveryDate,
        lastInvoiceDate,
        lastSaleDate,
        lastReturnDate,
      };
    });

    const sortedResults = results.sort((a, b) => {
      if (b.totalSalesOrders !== a.totalSalesOrders) {
        return b.totalSalesOrders - a.totalSalesOrders;
      }
      const bVal = b.invoicedAmount || b.salesOrderAmount || 0;
      const aVal = a.invoicedAmount || a.salesOrderAmount || 0;
      if (bVal !== aVal) return bVal - aVal;
      return a.customerName.localeCompare(b.customerName);
    });

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      return sortedResults.filter(r => r.customerName.toLowerCase().includes(q) || r.customerCode.toLowerCase().includes(q));
    }

    return sortedResults;
  }

  /**
   * 3. ITEM-WISE SALES ANALYSIS
   * Sellable Finished Goods Only
   */
  async getItemSalesAnalysis(
    companyId: string,
    filter?: SalesAnalyticsFilterDto,
    allowedDivisionIds?: DivisionAccess,
  ) {
    // Sellable FG Items only (exclude Raw Materials, Chemicals, Packaging, Spare Parts, Machinery, Consumables)
    const rawItems = await this.itemRepo.find({
      where: { companyId, itemType: ItemType.FINISHED_GOOD },
      relations: ['baseUom', 'salesUom'],
    });

    const nonSellableTypes = [
      ItemType.RAW_MATERIAL,
      ItemType.PACKAGING_MATERIAL,
      ItemType.SPARE_PART,
      ItemType.CONSUMABLE,
      ItemType.SERVICE,
      ItemType.ASSET,
      ItemType.OTHER,
      ItemType.WORK_IN_PROGRESS,
      ItemType.SEMI_FINISHED,
    ];

    const items = rawItems.filter(item => {
      if (item.itemType === ItemType.FINISHED_GOOD) return true;
      if (item.isSellable && !nonSellableTypes.includes(item.itemType as any)) return true;
      return false;
    });

    if (items.length === 0) return [];

    const itemIds = items.map(i => i.id);

    const [orderItems, deliveryLines, returnLines, allReturns, prodOrders, balances, orders] = await Promise.all([
      this.orderItemRepo.createQueryBuilder('soi')
        .where('soi.itemId IN (:...itemIds)', { itemIds })
        .getMany(),
      this.deliveryLineRepo.createQueryBuilder('sdl')
        .where('sdl.itemId IN (:...itemIds)', { itemIds })
        .getMany(),
      this.returnLineRepo.createQueryBuilder('srl')
        .where('srl.itemId IN (:...itemIds)', { itemIds })
        .getMany(),
      this.returnRepo.find({ where: { companyId }, select: ['id', 'status'] }),
      this.productionOrderRepo.createQueryBuilder('po')
        .where('po.companyId = :companyId', { companyId })
        .andWhere('po.productId IN (:...itemIds)', { itemIds })
        .getMany(),
      this.balanceRepo.createQueryBuilder('ib')
        .where('ib.companyId = :companyId', { companyId })
        .andWhere('ib.itemId IN (:...itemIds)', { itemIds })
        .getMany(),
      this.orderRepo.find({ where: narrowWhereByDivision({ companyId }, 'divisionId', allowedDivisionIds), select: ['id', 'customerId', 'orderDate', 'divisionId'] }),
    ]);

    // Only committed returns (approved or later) may reduce returned quantities/values;
    // DRAFT/SUBMITTED return lines are proposals and are excluded.
    const committedReturnIds = new Set(
      allReturns.filter(r => isCommittedReturnStatus(r.status)).map(r => r.id),
    );

    const orderCustMap = new Map<string, string>();
    const orderDateMap = new Map<string, string>();
    orders.forEach(o => {
      orderCustMap.set(o.id, o.customerId);
      if (o.orderDate) orderDateMap.set(o.id, o.orderDate);
    });

    return items.map(item => {
      const curOrderItems = orderItems.filter(oi => oi.itemId === item.id);
      const curDelLines = deliveryLines.filter(dl => dl.itemId === item.id);
      const curReturnLines = returnLines.filter(rl => rl.itemId === item.id && committedReturnIds.has(rl.returnId));
      const curProdOrders = prodOrders.filter(po => po.productId === item.id);
      const curBalances = balances.filter(b => b.itemId === item.id);

      // Customer count
      const custSet = new Set<string>();
      curOrderItems.forEach(oi => {
        const cId = orderCustMap.get(oi.salesOrderId);
        if (cId) custSet.add(cId);
      });

      const baseUomCode = item.baseUom?.code || 'PCS';
      const salesUomCode = item.salesUom?.code || baseUomCode || 'GRS';

      const orderedQuantity = curOrderItems.reduce((sum, oi) => sum + (Number(oi.quantity) || 0), 0);
      const deliveredQuantity = curDelLines.reduce((sum, dl) => sum + (Number(dl.quantity) || 0), 0);
      const returnedQuantity = curReturnLines.reduce((sum, rl) => sum + (Number(rl.quantity) || 0), 0);
      const producedQuantityBase = curProdOrders.reduce((sum, po) => sum + (Number(po.completedQuantity) || 0), 0);
      const producedQuantity = Math.round(this.convertQty(producedQuantityBase, baseUomCode, salesUomCode) * 100) / 100;
      
      const rawAvailableBase = curBalances.reduce((sum, b) => sum + (Number(b.available) || 0), 0);
      const finishedGoodsAvailable = Math.round(this.convertQty(rawAvailableBase, baseUomCode, salesUomCode) * 100) / 100;

      const netSoldQuantity = Math.max(0, deliveredQuantity - returnedQuantity);
      const salesAmount = curDelLines.reduce((sum, dl) => sum + (Number(dl.lineTotal) || 0), 0);
      const returnValue = curReturnLines.reduce((sum, rl) => sum + (Number(rl.lineTotal) || 0), 0);
      const netSalesValue = Math.max(0, salesAmount - returnValue);
      const averageSellingPrice = netSoldQuantity > 0 ? netSalesValue / netSoldQuantity : 0;

      // Last sale date
      const saleDates = curOrderItems
        .map(oi => orderDateMap.get(oi.salesOrderId))
        .filter(Boolean)
        .sort();
      const lastSaleDate = saleDates.length > 0 ? saleDates[saleDates.length - 1] : null;

      return {
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.name,
        itemType: item.itemType || 'FINISHED_GOOD',
        uom: salesUomCode,
        salesUom: salesUomCode,
        baseUom: baseUomCode,
        baseQuantity: rawAvailableBase,
        baseProducedQuantity: producedQuantityBase,
        customerCount: custSet.size,
        orderedQuantity,
        producedQuantity,
        finishedGoodsAvailable,
        fgAvailable: finishedGoodsAvailable,
        deliveredQuantity,
        invoicedQuantity: deliveredQuantity,
        returnedQuantity,
        netSoldQuantity,
        salesAmount,
        salesValue: salesAmount,
        invoicedValue: salesAmount,
        returnAmount: returnValue,
        returnValue,
        netSalesValue,
        averageSellingPrice: Math.round(averageSellingPrice * 100) / 100,
        lastSaleDate,
      };
    });
  }

  /**
   * 4. CUSTOMER × ITEM MATRIX
   */
  async getCustomerItemMatrix(
    companyId: string,
    filter?: SalesAnalyticsFilterDto,
    allowedDivisionIds?: DivisionAccess,
  ) {
    const [salesCustomers, items, orders, orderItems, deliveryLines, invoices, deliveries, returns, returnLines, prodOrders] = await Promise.all([
      this.salesCustomerRepo.find({ where: { companyId } }),
      this.itemRepo.find({ where: { companyId }, relations: ['baseUom', 'salesUom'] }),
      this.orderRepo.find({ where: narrowWhereByDivision({ companyId }, 'divisionId', allowedDivisionIds) }),
      this.orderItemRepo.find(),
      this.deliveryLineRepo.find(),
      this.invoiceRepo.find({ where: { companyId } }),
      this.deliveryRepo.find({ where: { companyId } }),
      this.returnRepo.find({ where: { companyId } }),
      this.returnLineRepo.find(),
      this.productionOrderRepo.find({ where: { companyId } }),
    ]);

    // Production completed quantity mapped by sales order line
    const prodBySoItem = new Map<string, number>();
    prodOrders.forEach(po => {
      if (po.salesOrderItemId) {
        prodBySoItem.set(po.salesOrderItemId, (prodBySoItem.get(po.salesOrderItemId) || 0) + (Number(po.completedQuantity) || 0));
      }
    });

    const custMap = new Map(salesCustomers.map(c => [c.id, c]));
    const itemMap = new Map(items.map(i => [i.id, i]));
    const orderMap = new Map(orders.map(o => [o.id, o]));
    const delMap = new Map(deliveries.map(d => [d.id, d]));
    const retMap = new Map(returns.map(r => [r.id, r]));

    const matrix = new Map<string, MatrixCell>();

    // 1. Accumulate orders
    orderItems.forEach(oi => {
      if (!oi.itemId) return;
      const order = orderMap.get(oi.salesOrderId);
      if (!order) return;
      const cust = custMap.get(order.customerId);
      const item = itemMap.get(oi.itemId);
      if (!cust || !item) return;

      const key = `${cust.id}:${item.id}`;
      let cell = matrix.get(key);
      if (!cell) {
        cell = {
          customerId: cust.id,
          customerCode: cust.customerCode,
          customerName: cust.companyName,
          itemId: item.id,
          itemCode: item.itemCode,
          itemName: item.name,
          uom: item.salesUom?.code || item.baseUom?.code || 'GRS',
          ordered: 0,
          produced: 0,
          delivered: 0,
          returned: 0,
          netSold: 0,
          invoiced: 0,
          paid: 0,
          outstanding: 0,
        };
        matrix.set(key, cell);
      }
      cell.ordered += Number(oi.quantity) || 0;
      cell.produced += prodBySoItem.get(oi.id) || 0; // actual production completion (not shipped qty)
    });

    // 2. Accumulate deliveries
    deliveryLines.forEach(dl => {
      if (!dl.itemId) return;
      const delivery = delMap.get(dl.deliveryId);
      if (!delivery) return;
      const cust = custMap.get(delivery.customerId);
      const item = itemMap.get(dl.itemId);
      if (!cust || !item) return;

      const key = `${cust.id}:${item.id}`;
      let cell = matrix.get(key);
      if (!cell) {
        cell = {
          customerId: cust.id,
          customerCode: cust.customerCode,
          customerName: cust.companyName,
          itemId: item.id,
          itemCode: item.itemCode,
          itemName: item.name,
          uom: item.salesUom?.code || item.baseUom?.code || 'GRS',
          ordered: 0,
          produced: 0,
          delivered: 0,
          returned: 0,
          netSold: 0,
          invoiced: 0,
          paid: 0,
          outstanding: 0,
        };
        matrix.set(key, cell);
      }
      cell.delivered += Number(dl.quantity) || 0;
      cell.invoiced += Number(dl.lineTotal) || 0;
    });

    // 3. Accumulate returns
    returnLines.forEach(rl => {
      if (!rl.itemId) return;
      const ret = retMap.get(rl.returnId);
      if (!ret || !isCommittedReturnStatus(ret.status)) return;
      const cust = custMap.get(ret.customerId);
      const item = itemMap.get(rl.itemId);
      if (!cust || !item) return;

      const key = `${cust.id}:${item.id}`;
      let cell = matrix.get(key);
      if (!cell) {
        cell = {
          customerId: cust.id,
          customerCode: cust.customerCode,
          customerName: cust.companyName,
          itemId: item.id,
          itemCode: item.itemCode,
          itemName: item.name,
          uom: item.salesUom?.code || item.baseUom?.code || 'GRS',
          ordered: 0,
          produced: 0,
          delivered: 0,
          returned: 0,
          netSold: 0,
          invoiced: 0,
          paid: 0,
          outstanding: 0,
        };
        matrix.set(key, cell);
      }
      cell.returned += Number(rl.quantity) || 0;
    });

    // Allocate invoice payments and posted credit notes to matrix cells.
    // Sales invoices are header-only (no per-item lines), so money columns are
    // distributed by each cell's share of the customer's delivered value; this
    // keeps the invoiced column reconciled with actual invoice headers instead
    // of raw delivery line totals, and makes paid/outstanding non-zero.
    const invByCust = new Map<string, { invoiced: number; paid: number }>();
    invoices.filter(i => i.status !== 'Cancelled').forEach(i => {
      const cur = invByCust.get(i.customerId) || { invoiced: 0, paid: 0 };
      cur.invoiced += Number(i.totalAmount) || 0;
      cur.paid += Number(i.paidAmount) || 0;
      invByCust.set(i.customerId, cur);
    });
    const creditByCust = new Map<string, number>();
    returns
      .filter(r => isCommittedReturnStatus(r.status) && r.creditPosted)
      .forEach(r => {
        creditByCust.set(r.customerId, (creditByCust.get(r.customerId) || 0) + (Number(r.totalAmount) || 0));
      });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const allCells = Array.from(matrix.values());
    const deliveredValueByCust = new Map<string, number>();
    allCells.forEach(c => {
      deliveredValueByCust.set(c.customerId, (deliveredValueByCust.get(c.customerId) || 0) + (Number(c.invoiced) || 0));
    });

    let resultList = allCells.map(c => {
      const deliveredValue = Number(c.invoiced) || 0;
      const inv = invByCust.get(c.customerId);
      const custDeliveredValue = deliveredValueByCust.get(c.customerId) || 0;

      let invoiced = 0;
      let paid = 0;
      let outstanding = 0;
      if (inv && custDeliveredValue > 0) {
        const share = deliveredValue / custDeliveredValue;
        invoiced = round2(inv.invoiced * share);
        paid = round2(Math.min(inv.invoiced * share, inv.paid * share));
        const creditShare = round2((creditByCust.get(c.customerId) || 0) * share);
        outstanding = Math.max(0, round2(invoiced - paid - creditShare));
      }

      return {
        ...c,
        invoiced,
        paid,
        outstanding,
        netSold: Math.max(0, c.delivered - c.returned),
      };
    });

    if (filter?.customerId) {
      resultList = resultList.filter(r => r.customerId === filter.customerId);
    }
    if (filter?.itemId) {
      resultList = resultList.filter(r => r.itemId === filter.itemId);
    }

    return resultList;
  }

  /**
   * 5. CUSTOMER RANKINGS
   * Dynamic metric ranking
   */
  async getCustomerRankings(
    companyId: string,
    metric: CustomerRankingMetric,
    filter?: SalesAnalyticsFilterDto,
    allowedDivisionIds?: DivisionAccess,
  ) {
    const analytics = await this.getCustomerSalesAnalytics(companyId, filter, allowedDivisionIds);

    const sorted = [...analytics].sort((a, b) => {
      switch (metric) {
        case CustomerRankingMetric.SALES_AMOUNT:
          return b.invoicedAmount - a.invoicedAmount;
        case CustomerRankingMetric.DELIVERED_QTY:
          return b.deliveredQuantity - a.deliveredQuantity;
        case CustomerRankingMetric.INVOICED_AMOUNT:
          return b.invoicedAmount - a.invoicedAmount;
        case CustomerRankingMetric.PAID_AMOUNT:
          return b.paidAmount - a.paidAmount;
        case CustomerRankingMetric.OUTSTANDING_AMOUNT:
          return b.outstandingAmount - a.outstandingAmount;
        case CustomerRankingMetric.ORDER_COUNT:
        default:
          return b.totalSalesOrders - a.totalSalesOrders;
      }
    });

    return sorted.map((c, idx) => {
      let metricValue = 0;
      switch (metric) {
        case CustomerRankingMetric.SALES_AMOUNT:
        case CustomerRankingMetric.INVOICED_AMOUNT:
          metricValue = c.invoicedAmount;
          break;
        case CustomerRankingMetric.DELIVERED_QTY:
          metricValue = c.deliveredQuantity;
          break;
        case CustomerRankingMetric.PAID_AMOUNT:
          metricValue = c.paidAmount;
          break;
        case CustomerRankingMetric.OUTSTANDING_AMOUNT:
          metricValue = c.outstandingAmount;
          break;
        case CustomerRankingMetric.ORDER_COUNT:
          metricValue = c.totalSalesOrders;
          break;
      }

      return {
        rank: idx + 1,
        customerId: c.customerId,
        customerCode: c.customerCode,
        customerName: c.customerName,
        metric,
        metricValue,
        orders: c.totalSalesOrders,
        delivered: c.deliveredQuantity,
        invoiced: c.invoicedAmount,
        paid: c.paidAmount,
        outstanding: c.outstandingAmount,
      };
    });
  }

  /**
   * 6. SALES ORDER FULFILLMENT ANALYSIS
   */
  async getOrderFulfillmentAnalysis(
    companyId: string,
    filter?: SalesAnalyticsFilterDto,
    allowedDivisionIds?: DivisionAccess,
  ) {
    const orders = await this.orderRepo.find({
      where: narrowWhereByDivision({ companyId }, 'divisionId', allowedDivisionIds),
      relations: ['customer', 'items', 'items.item', 'items.item.baseUom', 'items.item.salesUom'],
      order: { orderDate: 'DESC' },
    });

    // Production orders linked
    const prodOrders = await this.productionOrderRepo.find({
      where: { companyId },
    });
    const prodBySoItem = new Map<string, number>();
    prodOrders.forEach(po => {
      if (po.salesOrderItemId) {
        prodBySoItem.set(po.salesOrderItemId, (prodBySoItem.get(po.salesOrderItemId) || 0) + (Number(po.completedQuantity) || 0));
      }
    });

    // Balances
    const balances = await this.balanceRepo.find({ where: { companyId } });
    const balanceByItem = new Map<string, number>();
    balances.forEach(b => {
      balanceByItem.set(b.itemId, (balanceByItem.get(b.itemId) || 0) + (Number(b.available) || 0));
    });

    return orders.map(order => {
      let orderedQuantity = 0;
      let deliveredQuantity = 0;
      let producedQuantity = 0;
      let fgAvailable = 0;

      const itemBreakdowns = (order.items || []).map(item => {
        const itemOrdered = Number(item.quantity) || 0;
        const itemDelivered = Number(item.shippedQuantity) || 0;
        const itemProduced = prodBySoItem.get(item.id) || 0;
        const rawAvailable = item.itemId ? (balanceByItem.get(item.itemId) || 0) : 0;
        const baseUom = item.item?.baseUom?.code || 'PCS';
        const salesUom = item.item?.salesUom?.code || baseUom || 'GRS';
        const itemAvailable = Math.round(this.convertQty(rawAvailable, baseUom, salesUom) * 100) / 100;
        const itemRemaining = Math.max(0, itemOrdered - itemDelivered);

        orderedQuantity += itemOrdered;
        deliveredQuantity += itemDelivered;
        producedQuantity += itemProduced;
        fgAvailable += itemAvailable;

        return {
          itemId: item.itemId,
          itemCode: item.item?.itemCode || 'N/A',
          itemName: item.item?.name || item.description || 'N/A',
          orderedQuantity: itemOrdered,
          producedQuantity: itemProduced,
          finishedGoodsAvailable: itemAvailable,
          deliveredQuantity: itemDelivered,
          remainingDeliveryQuantity: itemRemaining,
          fulfillmentPercentage: itemOrdered > 0 ? Math.round((itemDelivered / itemOrdered) * 100) : 0,
        };
      });

      const remainingDeliveryQuantity = Math.max(0, orderedQuantity - deliveredQuantity);
      const fulfillmentPercentage = orderedQuantity > 0 ? Math.round((deliveredQuantity / orderedQuantity) * 100) : 0;

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerName: order.customer?.companyName || 'N/A',
        orderDate: order.orderDate,
        status: order.status,
        orderedQuantity,
        producedQuantity,
        finishedGoodsAvailable: fgAvailable,
        deliveredQuantity,
        remainingDeliveryQuantity,
        fulfillmentPercentage,
        items: itemBreakdowns,
      };
    });
  }

  /**
   * 7. FINISHED GOODS AVAILABILITY & SAFETY STOCK PLANNING
   * Required Stock = Open Sales Orders + Safety Stock
   * Projected Balance = Available FG Stock - Required Stock
   * Status: ABOVE_REQUIREMENT, AT_REQUIREMENT, BELOW_REQUIREMENT, SHORTAGE
   */
  async getFinishedGoodsAvailability(
    companyId: string,
    filter?: SalesAnalyticsFilterDto,
    allowedDivisionIds?: DivisionAccess,
  ) {
    const rawItems = await this.itemRepo.find({
      where: { companyId, itemType: ItemType.FINISHED_GOOD },
      relations: ['baseUom', 'salesUom'],
    });

    const nonSellableTypes = [
      ItemType.RAW_MATERIAL,
      ItemType.PACKAGING_MATERIAL,
      ItemType.SPARE_PART,
      ItemType.CONSUMABLE,
      ItemType.SERVICE,
      ItemType.ASSET,
      ItemType.OTHER,
      ItemType.WORK_IN_PROGRESS,
      ItemType.SEMI_FINISHED,
    ];

    const items = rawItems.filter(item => {
      if (item.itemType === ItemType.FINISHED_GOOD) return true;
      if (item.isSellable && !nonSellableTypes.includes(item.itemType as any)) return true;
      return false;
    });

    if (items.length === 0) return [];

    const itemIds = items.map(i => i.id);

    const [balances, orderItems, orders] = await Promise.all([
      this.balanceRepo.createQueryBuilder('ib')
        .where('ib.companyId = :companyId', { companyId })
        .andWhere('ib.itemId IN (:...itemIds)', { itemIds })
        .getMany(),
      this.orderItemRepo.createQueryBuilder('soi')
        .where('soi.itemId IN (:...itemIds)', { itemIds })
        .getMany(),
      this.orderRepo.find({
        where: narrowWhereByDivision({ companyId }, 'divisionId', allowedDivisionIds),
        select: ['id', 'status', 'divisionId'],
      }),
    ]);

    // Active orders
    const activeOrderIds = new Set(
      orders.filter(o => !['Delivered', 'Cancelled', 'Closed'].includes(o.status)).map(o => o.id),
    );

    const openQtyByItem = new Map<string, number>();
    orderItems.forEach(oi => {
      if (!oi.itemId) return;
      if (activeOrderIds.has(oi.salesOrderId)) {
        const remaining = Math.max(0, (Number(oi.quantity) || 0) - (Number(oi.shippedQuantity) || 0));
        openQtyByItem.set(oi.itemId, (openQtyByItem.get(oi.itemId) || 0) + remaining);
      }
    });

    const stockByItem = new Map<string, { onHand: number; reserved: number; available: number }>();
    balances.forEach(b => {
      const cur = stockByItem.get(b.itemId) || { onHand: 0, reserved: 0, available: 0 };
      cur.onHand += Number(b.onHand) || 0;
      cur.reserved += Number(b.reserved) || 0;
      cur.available += Number(b.available) || 0;
      stockByItem.set(b.itemId, cur);
    });

    return items.map(item => {
      const stock = stockByItem.get(item.id) || { onHand: 0, reserved: 0, available: 0 };
      const baseUomCode = item.baseUom?.code || 'PCS';
      const salesUomCode = item.salesUom?.code || baseUomCode || 'GRS';

      const onHand = Math.round(this.convertQty(stock.onHand, baseUomCode, salesUomCode) * 100) / 100;
      const reserved = Math.round(this.convertQty(stock.reserved, baseUomCode, salesUomCode) * 100) / 100;
      const available = Math.round(this.convertQty(stock.available, baseUomCode, salesUomCode) * 100) / 100;

      const openSalesOrderQuantity = openQtyByItem.get(item.id) || 0;
      const safetyStock = Number(item.safetyStockLevel) || 0;
      const requiredStock = openSalesOrderQuantity + safetyStock;
      const projectedBalance = available - requiredStock;

      let status = 'ABOVE_REQUIREMENT';
      if (available <= 0 || onHand < openSalesOrderQuantity) {
        status = 'SHORTAGE';
      } else if (projectedBalance < 0) {
        status = 'BELOW_REQUIREMENT';
      } else if (projectedBalance === 0) {
        status = 'AT_REQUIREMENT';
      }

      return {
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.name,
        uom: salesUomCode,
        salesUom: salesUomCode,
        baseUom: baseUomCode,
        baseQuantity: stock.available,
        currentFgStock: onHand,
        physicalStock: onHand,
        onHand,
        reservedStock: reserved,
        reserved,
        availableStock: available,
        available,
        openSalesOrderQuantity,
        demand: openSalesOrderQuantity,
        safetyStock,
        requiredStock,
        projectedBalance,
        status,
        inventoryHealth: status,
      };
    });
  }

  /**
   * 8. CUSTOMER OUTSTANDING REPORT
   */
  async getCustomerOutstandingReport(
    companyId: string,
    filter?: { outstandingOnly?: boolean },
    allowedDivisionIds?: DivisionAccess,
  ) {
    // PROMPT #27 — an outstanding balance is money owed on an invoice, and the
    // invoice belongs to a division. Both the invoice and return sets are
    // therefore scoped through their source order; otherwise this report would
    // disclose another division's receivables in full.
    const invoiceQb = this.invoiceRepo.createQueryBuilder('si')
      .leftJoin('si.salesOrder', 'outOrder')
      .where('si.companyId = :companyId', { companyId });
    applyDivisionScopeFilter(invoiceQb as any, 'outOrder.divisionId', allowedDivisionIds);
    const returnQb = this.returnRepo.createQueryBuilder('sr')
      .leftJoin('sr.salesOrder', 'outReturnOrder')
      .where('sr.companyId = :companyId', { companyId });
    applyDivisionScopeFilter(returnQb as any, 'outReturnOrder.divisionId', allowedDivisionIds);

    const [customers, invoices, returns, masterCustomers] = await Promise.all([
      this.salesCustomerRepo.find({ where: { companyId } }),
      invoiceQb.getMany(),
      returnQb.getMany(),
      this.customerMasterRepo.find({ where: { companyId } }),
    ]);

    // Master customer lookup for real payment terms / status (name, then code)
    const masterByName = new Map<string, Customer>();
    const masterByCode = new Map<string, Customer>();
    masterCustomers.forEach(mc => {
      customerNameMatchKeys(mc.name).forEach(k => { if (!masterByName.has(k)) masterByName.set(k, mc); });
      customerNameMatchKeys(mc.legalName).forEach(k => { if (!masterByName.has(k)) masterByName.set(k, mc); });
      const code = normalizeCustomerName(mc.customerCode);
      if (code) masterByCode.set(code, mc);
    });

    // Posted credit notes reduce outstanding
    const creditByCust = new Map<string, number>();
    returns
      .filter(r => isCommittedReturnStatus(r.status) && r.creditPosted)
      .forEach(r => {
        creditByCust.set(r.customerId, (creditByCust.get(r.customerId) || 0) + (Number(r.totalAmount) || 0));
      });

    const report = customers.map(c => {
      const cInvoices = invoices.filter(i => i.customerId === c.id && i.status !== 'Cancelled');
      const invoiceCount = cInvoices.length;
      const invoiceAmount = cInvoices.reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
      const paidAmount = cInvoices.reduce((sum, i) => sum + (Number(i.paidAmount) || 0), 0);
      const creditAmount = creditByCust.get(c.id) || 0;
      const outstanding = Math.max(0, invoiceAmount - paidAmount - creditAmount);

      const invDates = cInvoices.map(i => i.invoiceDate).filter(Boolean).sort();
      const oldestOutstandingDate = invDates.length > 0 ? invDates[0] : null;
      const latestInvoiceDate = invDates.length > 0 ? invDates[invDates.length - 1] : null;

      const keys = customerNameMatchKeys(c.companyName);
      const master = keys.map(k => masterByName.get(k)).find(Boolean)
        || masterByCode.get(normalizeCustomerName(c.customerCode));

      return {
        customerId: c.id,
        customerCode: c.customerCode,
        customerName: c.companyName,
        invoiceCount,
        invoiceAmount,
        paidAmount,
        creditAmount,
        outstanding,
        oldestOutstandingDate,
        latestInvoiceDate,
        paymentTerms: master?.paymentTerms || null,
        customerStatus: master?.status || null,
      };
    });

    if (filter?.outstandingOnly) {
      return report.filter(r => r.outstanding > 0);
    }

    return report;
  }
}
