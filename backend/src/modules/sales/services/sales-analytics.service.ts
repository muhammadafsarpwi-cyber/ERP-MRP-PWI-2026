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
   * Helper to resolve date range from filter
   */
  private resolveDateRange(filter?: SalesAnalyticsFilterDto): { startDate?: string; endDate?: string } {
    if (!filter) return {};
    const now = new Date();
    if (filter.period) {
      switch (filter.period) {
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
  async getSalesDashboard(companyId: string, filter?: SalesAnalyticsFilterDto) {
    const { startDate, endDate } = this.resolveDateRange(filter);

    // 1. Sales Orders query
    const orderQb = this.orderRepo.createQueryBuilder('so')
      .where('so.companyId = :companyId', { companyId });
    if (startDate) orderQb.andWhere('so.orderDate >= :startDate', { startDate });
    if (endDate) orderQb.andWhere('so.orderDate <= :endDate', { endDate });
    const orders = await orderQb.getMany();

    const totalSalesOrders = orders.length;
    const openOrders = orders.filter(o => !['Delivered', 'Cancelled', 'Closed'].includes(o.status)).length;
    const ordersInProduction = orders.filter(o => ['Processing', 'IN_PRODUCTION'].includes(o.status)).length;
    const deliveredOrders = orders.filter(o => ['Delivered', 'Partially Delivered', 'PARTIALLY_DELIVERED'].includes(o.status)).length;
    const pendingDelivery = orders.filter(o => ['Confirmed', 'Processing', 'Ready', 'PARTIALLY_DELIVERED'].includes(o.status)).length;

    // 2. Invoices query
    const invQb = this.invoiceRepo.createQueryBuilder('si')
      .where('si.companyId = :companyId', { companyId });
    if (startDate) invQb.andWhere('si.invoiceDate >= :startDate', { startDate });
    if (endDate) invQb.andWhere('si.invoiceDate <= :endDate', { endDate });
    const invoices = await invQb.getMany();

    const activeInvoices = invoices.filter(i => i.status !== 'Cancelled');
    const invoicedAmount = activeInvoices.reduce((sum, i) => sum + (Number(i.totalAmount) || 0), 0);
    const paidAmount = activeInvoices.reduce((sum, i) => sum + (Number(i.paidAmount) || 0), 0);
    const outstandingAmount = Math.max(0, invoicedAmount - paidAmount);

    // 3. Finished Goods stock (FG-only: sellable non-FG items must never inflate FG KPIs)
    const fgItems = await this.itemRepo.find({
      where: { companyId, itemType: ItemType.FINISHED_GOOD },
      select: ['id', 'itemCode', 'name', 'safetyStockLevel', 'itemType'],
    });
    const fgItemIds = fgItems.map(i => i.id);

    let finishedGoodsReady = 0;
    let balances: InventoryBalance[] = [];
    if (fgItemIds.length > 0) {
      balances = await this.balanceRepo.createQueryBuilder('ib')
        .where('ib.companyId = :companyId', { companyId })
        .andWhere('ib.itemId IN (:...fgItemIds)', { fgItemIds })
        .getMany();

      finishedGoodsReady = balances.reduce((sum, b) => sum + (Number(b.available) || 0), 0);
    }

    // 4. Quotations
    const qtnQb = this.quotationRepo.createQueryBuilder('sq')
      .where('sq.companyId = :companyId', { companyId });
    if (startDate) qtnQb.andWhere('sq.quotationDate >= :startDate', { startDate });
    if (endDate) qtnQb.andWhere('sq.quotationDate <= :endDate', { endDate });
    const quotations = await qtnQb.getMany();
    const totalQuotationsCount = quotations.length;
    const totalQuotationsAmount = quotations.reduce((sum, q) => sum + (Number(q.totalAmount) || 0), 0);

    // 5. Deliveries
    const delQb = this.deliveryRepo.createQueryBuilder('sd')
      .where('sd.companyId = :companyId', { companyId });
    if (startDate) delQb.andWhere('sd.deliveryDate >= :startDate', { startDate });
    if (endDate) delQb.andWhere('sd.deliveryDate <= :endDate', { endDate });
    const deliveries = await delQb.getMany();
    const totalDeliveriesCount = deliveries.length;
    const totalDeliveriesAmount = deliveries.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0);

    // 6. Production Orders
    const prodQb = this.productionOrderRepo.createQueryBuilder('po')
      .where('po.companyId = :companyId', { companyId });
    const productionOrders = await prodQb.getMany();
    const totalProdOrdersCount = productionOrders.length;
    const totalProdPlannedQty = productionOrders.reduce((sum, p) => sum + (Number(p.plannedQuantity) || 0), 0);

    // 7. Returns & Credit Notes
    const retQb = this.returnRepo.createQueryBuilder('sr')
      .where('sr.companyId = :companyId', { companyId });
    if (startDate) retQb.andWhere('sr.returnDate >= :startDate', { startDate });
    if (endDate) retQb.andWhere('sr.returnDate <= :endDate', { endDate });
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
      { stage: 'FINISHED_GOODS', title: 'FG Available', count: fgItems.length, value: finishedGoodsReady, unit: 'Stock', color: '#13c2c2' },
      { stage: 'DELIVERY', title: 'Deliveries / Dispatches', count: totalDeliveriesCount, value: totalDeliveriesAmount, unit: 'PKR', color: '#faad14' },
      { stage: 'INVOICE', title: 'Gross Invoices', count: activeInvoices.length, value: invoicedAmount, unit: 'PKR', color: '#2f54eb' },
      { stage: 'SALES_RETURN', title: 'Sales Returns', count: returnCount, value: returnAmount, unit: 'PKR', color: '#f5222d' },
      { stage: 'CREDIT_NOTE', title: 'Credit Notes', count: creditNotesCount, value: creditNoteAmount, unit: 'PKR', color: '#722ed1' },
      { stage: 'PAYMENT', title: 'Customer Payments', count: activeInvoices.filter(i => Number(i.paidAmount) > 0).length, value: paidAmount, unit: 'PKR', color: '#52c41a' },
    ];

    // 9. Customer Section: Top customers & recent records
    const customerAgg = await this.getCustomerSalesAnalytics(companyId, filter);
    const topCustomersBySalesAmount = [...customerAgg].sort((a, b) => b.invoicedAmount - a.invoicedAmount).slice(0, 5);
    const topCustomersByDeliveredQty = [...customerAgg].sort((a, b) => b.deliveredQuantity - a.deliveredQuantity).slice(0, 5);
    const topCustomersByOutstanding = [...customerAgg].sort((a, b) => b.outstandingAmount - a.outstandingAmount).slice(0, 5);

    const recentOrders = await this.orderRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
      take: 5,
    });
    const recentInvoices = await this.invoiceRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    // 10. Item Section: Top selling FG & alerts
    const itemAgg = await this.getItemSalesAnalysis(companyId, filter);
    const topSellingFinishedGoods = [...itemAgg].sort((a, b) => b.salesAmount - a.salesAmount).slice(0, 5);
    const highestOrderedFinishedGoods = [...itemAgg].sort((a, b) => b.orderedQuantity - a.orderedQuantity).slice(0, 5);
    const highestDeliveredFinishedGoods = [...itemAgg].sort((a, b) => b.deliveredQuantity - a.deliveredQuantity).slice(0, 5);

    const fgPlanning = await this.getFinishedGoodsAvailability(companyId, filter);
    const finishedGoodsWithOpenOrders = fgPlanning.filter(p => p.openSalesOrderQuantity > 0).slice(0, 5);
    const finishedGoodsBelowSafetyStock = fgPlanning.filter(p => ['BELOW_REQUIREMENT', 'SHORTAGE'].includes(p.status)).slice(0, 5);

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
      },
    };
  }

  /**
   * 2. CUSTOMER-WISE SALES ANALYTICS
   */
  async getCustomerSalesAnalytics(companyId: string, filter?: SalesAnalyticsFilterDto) {
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
    masterCustomers.forEach(c => {
      masterMapByName.set(c.name.trim().toLowerCase(), c);
      masterMapByCode.set(c.customerCode.trim().toLowerCase(), c);
    });

    // Fetch orders, quotations, deliveries, delivery lines, invoices, returns, return lines
    const [orders, orderItems, quotations, deliveries, deliveryLines, invoices, returns, returnLines, prodOrders, ledgerEntries] = await Promise.all([
      this.orderRepo.find({ where: { companyId } }),
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

    const results = salesCustomers.map(sc => {
      // Find matching master customer
      const master = masterMapByName.get(sc.companyName.trim().toLowerCase()) ||
                     masterMapByCode.get(sc.customerCode.trim().toLowerCase());

      const cOrders = orders.filter(o => o.customerId === sc.id);
      const cQuotations = quotations.filter(q => q.customerId === sc.id);
      const cDeliveries = deliveries.filter(d => d.customerId === sc.id);
      const cInvoices = invoices.filter(i => i.customerId === sc.id && i.status !== 'Cancelled');
      const cReturns = returns.filter(r => r.customerId === sc.id && isCommittedReturnStatus(r.status));

      // Quantities
      let orderedQuantity = 0;
      let producedQuantity = 0;
      cOrders.forEach(o => {
        const items = orderItemsByOrderId.get(o.id) || [];
        items.forEach(it => {
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

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      return results.filter(r => r.customerName.toLowerCase().includes(q) || r.customerCode.toLowerCase().includes(q));
    }

    return results;
  }

  /**
   * 3. ITEM-WISE SALES ANALYSIS
   * Sellable Finished Goods Only
   */
  async getItemSalesAnalysis(companyId: string, filter?: SalesAnalyticsFilterDto) {
    // Sellable FG Items only (exclude Raw Materials, Chemicals, Packaging, Spare Parts, Machinery, Consumables)
    const rawItems = await this.itemRepo.find({
      where: { companyId, itemType: ItemType.FINISHED_GOOD },
      relations: ['baseUom'],
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
      this.orderRepo.find({ where: { companyId }, select: ['id', 'customerId', 'orderDate'] }),
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

      const orderedQuantity = curOrderItems.reduce((sum, oi) => sum + (Number(oi.quantity) || 0), 0);
      const deliveredQuantity = curDelLines.reduce((sum, dl) => sum + (Number(dl.quantity) || 0), 0);
      const returnedQuantity = curReturnLines.reduce((sum, rl) => sum + (Number(rl.quantity) || 0), 0);
      const producedQuantity = curProdOrders.reduce((sum, po) => sum + (Number(po.completedQuantity) || 0), 0);
      const finishedGoodsAvailable = curBalances.reduce((sum, b) => sum + (Number(b.available) || 0), 0);

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
        uom: item.baseUom?.code || item.baseUom?.name || 'PCS',
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
  async getCustomerItemMatrix(companyId: string, filter?: SalesAnalyticsFilterDto) {
    const [salesCustomers, items, orders, orderItems, deliveryLines, invoices, deliveries, returns, returnLines, prodOrders] = await Promise.all([
      this.salesCustomerRepo.find({ where: { companyId } }),
      this.itemRepo.find({ where: { companyId }, relations: ['baseUom'] }),
      this.orderRepo.find({ where: { companyId } }),
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
          uom: item.baseUom?.code || 'PCS',
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
          uom: item.baseUom?.code || 'PCS',
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
          uom: item.baseUom?.code || 'PCS',
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
  async getCustomerRankings(companyId: string, metric: CustomerRankingMetric, filter?: SalesAnalyticsFilterDto) {
    const analytics = await this.getCustomerSalesAnalytics(companyId, filter);

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
  async getOrderFulfillmentAnalysis(companyId: string, filter?: SalesAnalyticsFilterDto) {
    const orders = await this.orderRepo.find({
      where: { companyId },
      relations: ['customer', 'items', 'items.item'],
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
        const itemAvailable = item.itemId ? (balanceByItem.get(item.itemId) || 0) : 0;
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
  async getFinishedGoodsAvailability(companyId: string, filter?: SalesAnalyticsFilterDto) {
    const rawItems = await this.itemRepo.find({
      where: { companyId, itemType: ItemType.FINISHED_GOOD },
      relations: ['baseUom'],
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
        where: { companyId },
        select: ['id', 'status'],
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
      const openSalesOrderQuantity = openQtyByItem.get(item.id) || 0;
      const safetyStock = Number(item.safetyStockLevel) || 0;
      const requiredStock = openSalesOrderQuantity + safetyStock;
      const projectedBalance = stock.available - requiredStock;

      let status = 'ABOVE_REQUIREMENT';
      if (stock.available <= 0 || stock.onHand < openSalesOrderQuantity) {
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
        uom: item.baseUom?.code || item.baseUom?.name || 'PCS',
        currentFgStock: stock.onHand,
        physicalStock: stock.onHand,
        onHand: stock.onHand,
        reservedStock: stock.reserved,
        reserved: stock.reserved,
        availableStock: stock.available,
        available: stock.available,
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
  async getCustomerOutstandingReport(companyId: string, filter?: { outstandingOnly?: boolean }) {
    const [customers, invoices, returns, masterCustomers] = await Promise.all([
      this.salesCustomerRepo.find({ where: { companyId } }),
      this.invoiceRepo.find({ where: { companyId } }),
      this.returnRepo.find({ where: { companyId } }),
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
