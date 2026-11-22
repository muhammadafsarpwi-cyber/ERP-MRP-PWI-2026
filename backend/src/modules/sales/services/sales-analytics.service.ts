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
import { isCommittedOrderStatus } from './sales-order-status.util';
import { isCommittedReturnStatus } from './sales-return-status.util';
import {
  applyDivisionScopeFilter,
  narrowWhereByDivision,
  DivisionAccess,
} from '../../../common/division-scope.util';
import {
  getCurrentFiscalYearInfo,
  getFiscalQuarterInfo,
} from '../../../common/fiscal-year.util';
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
          const q = getFiscalQuarterInfo(now);
          return {
            startDate: q.startDate,
            endDate: q.endDate,
          };
        }
        case SalesAnalyticsPeriod.THIS_YEAR: {
          const fy = getCurrentFiscalYearInfo(now);
          return {
            startDate: fy.startDate,
            endDate: fy.endDate,
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

    // 1. Sales Orders query (committed orders only)
    const orderQb = this.orderRepo.createQueryBuilder('so')
      .where('so.companyId = :companyId', { companyId })
      .andWhere("UPPER(so.status) NOT IN ('DRAFT', 'CANCELLED', 'VOID')");
    if (startDate) orderQb.andWhere('so.orderDate >= :startDate', { startDate });
    if (endDate) orderQb.andWhere('so.orderDate <= :endDate', { endDate });
    // PROMPT #27 — `so.divisionId` is the single authoritative attribution for
    // the whole dashboard, so scoping this one query keeps every order-derived
    // KPI (open / in-production / delivered / pipeline value) inside the
    // caller's divisions. Not `includeUnassigned`: an order with no division
    // is not inside any restricted caller's permitted set.
    applyDivisionScopeFilter(orderQb as any, 'so.divisionId', allowedDivisionIds);
    const orders = await orderQb.getMany();

    // Authoritative real-time fulfillment analysis for order status & delivery progress
    const fulfillmentAnalysis = await this.getOrderFulfillmentAnalysis(companyId, filter, allowedDivisionIds);
    const totalSalesOrders = fulfillmentAnalysis.length > 0 ? fulfillmentAnalysis.length : orders.length;
    const deliveredOrders = fulfillmentAnalysis.filter(o => o.status === 'Delivered' || o.fulfillmentPercentage >= 100).length;
    const openOrders = fulfillmentAnalysis.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled' && o.status !== 'Closed').length;
    const ordersInProduction = fulfillmentAnalysis.filter(o => (o.producedQuantity > 0 && o.fulfillmentPercentage < 100) || o.status === 'Processing').length;
    const pendingDelivery = fulfillmentAnalysis.filter(o => o.remainingDeliveryQuantity > 0 && o.status !== 'Cancelled').length;

    // Sync database status to 'Delivered' for 100% completed orders so DB and UI stay permanently in sync
    for (const f of fulfillmentAnalysis) {
      if (f.fulfillmentPercentage >= 100 && f.status === 'Delivered') {
        await this.orderRepo.update({ id: f.orderId }, { status: 'Delivered' }).catch(() => {});
      }
    }

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

    // 3. Finished Goods Availability & 5-Step Management Analytics Flow (Uniformly in Gross / GRS)
    const fgPlanning = await this.getFinishedGoodsAvailability(companyId, filter);

    // 1. Total Order Demand: absolute total volume of orders received from all customers (in Gross)
    const totalOrderDemand = Math.round(fulfillmentAnalysis.reduce((sum, o) => sum + (Number(o.orderedQuantity) || 0), 0) * 100) / 100;

    // 2. Dispatched / Delivered Volume: total stock successfully shipped out to customers (in Gross)
    const dispatchedVolume = Math.round(fulfillmentAnalysis.reduce((sum, o) => sum + (Number(o.deliveredQuantity) || 0), 0) * 100) / 100;

    // 3. Net Pending Orders: remaining customer volume needing fulfillment (Total Demand - Dispatched)
    const netPendingOrders = Math.max(0, Math.round((totalOrderDemand - dispatchedVolume) * 100) / 100);

    // 4. Available FG Stock: total usable inventory currently resting in warehouse (Sum of floor stock and packed cartons in Gross)
    const planningTotalAvailable = Math.round(fgPlanning.reduce((sum, p) => sum + (Number(p.totalAvailableStock) || 0), 0) * 100) / 100;
    const fulfillmentFgAvailable = Math.round(fulfillmentAnalysis.reduce((sum, o) => sum + (Number(o.finishedGoodsAvailable) || 0), 0) * 100) / 100;
    const availableFgStock = planningTotalAvailable > 0 ? planningTotalAvailable : fulfillmentFgAvailable;
    const finishedGoodsReady = availableFgStock;

    // 5. Net Deficit for Production: actual remaining gap production/packing must manufacture (Net Pending Orders - Available FG Stock)
    const netDeficitForProduction = Math.max(0, Math.round((netPendingOrders - availableFgStock) * 100) / 100);

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

    // 6. Production Entries (shopfloor packing production from public.production_entries)
    const peCountRes = this.orderRepo.manager?.query
      ? await this.orderRepo.manager.query(
          `SELECT count(*) as count, COALESCE(SUM(actual_quantity), 0) as total_qty
           FROM public.production_entries`
        )
      : [];
    const totalProdEntriesCount = Number(peCountRes[0]?.count) || 0;
    const totalProdQtyGRS = Math.round(((Number(peCountRes[0]?.total_qty) || 0) / 144) * 100) / 100;

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
      { stage: 'PRODUCTION', title: 'Packing & Production', count: totalProdEntriesCount, value: totalProdQtyGRS, unit: 'GRS', color: '#fa8c16' },
      { stage: 'FINISHED_GOODS', title: 'FG Available Stock', count: finishedGoodsReady, value: finishedGoodsReady, unit: 'GRS', color: '#13c2c2' },
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

    const finishedGoodsWithOpenOrders = fgPlanning.filter(p => p.openSalesOrderQuantity > 0).slice(0, 5);
    const finishedGoodsBelowSafetyStock = fgPlanning.filter(p => ['BELOW_REQUIREMENT', 'SHORTAGE'].includes(p.status)).slice(0, 5);

    // 11. Nipple Analytics: Map Spoke Set orders to required Nipple components and compare with FG Stock & Purchase Orders
    const nippleItems = itemAgg.filter(i => 
      (i.itemCode && i.itemCode.startsWith('FG-NP-')) || 
      (i.itemName && i.itemName.toLowerCase().includes('nipple') && !i.itemName.includes('_'))
    );

    const spokeSetsWithNipples = itemAgg.filter(i => i.itemName && i.itemName.includes('_'));

    // Fetch linked Purchase Orders for Nipple items
    const nipplePoRows: any[] = this.orderRepo.manager?.query
      ? await this.orderRepo.manager
          .query(
            `SELECT po.id as po_id, po.po_code, po.order_date, po.expected_delivery_date, po.eta_date, po.etd_date,
                    po.status, po.purchase_origin, po.import_stage, po.lc_tt_number, po.vessel_name, po.container_number,
                    s.name as supplier_name, i.item_code, i.name as item_name,
                    COALESCE(pol.quantity, 0) as ordered_qty,
                    COALESCE(pol.received_quantity, 0) as received_qty,
                    COALESCE(u.code, 'GRS') as uom_code
             FROM public.purchase_order_lines pol
             JOIN public.purchase_orders po ON po.id = pol.po_id
             LEFT JOIN public.suppliers s ON s.id = po.supplier_id
             LEFT JOIN public.items i ON i.id = pol.item_id
             LEFT JOIN public.uoms u ON u.id = pol.uom_id
             WHERE (i.item_code LIKE 'FG-NP-%' OR LOWER(i.name) LIKE '%nipple%')
               AND UPPER(COALESCE(po.status, 'DRAFT')) NOT IN ('FULLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED', 'VOID')
               AND (COALESCE(pol.quantity, 0) - COALESCE(pol.received_quantity, 0)) > 0
             ORDER BY COALESCE(po.eta_date, po.expected_delivery_date, po.order_date) ASC, po.po_code ASC`,
          )
          .catch(() => [])
      : [];

    const poByItemCode = new Map<string, any[]>();
    for (const row of nipplePoRows) {
      const code = String(row.item_code || '').trim().toUpperCase();
      if (!code) continue;
      const statusUpper = String(row.status || 'DRAFT').toUpperCase();
      if (['FULLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED', 'VOID'].includes(statusUpper)) continue;
      const ordQty = this.convertQty(Number(row.ordered_qty) || 0, row.uom_code || 'GRS', 'GRS');
      const recQty = this.convertQty(Number(row.received_qty) || 0, row.uom_code || 'GRS', 'GRS');
      const pendingQty = Math.max(0, Math.round((ordQty - recQty) * 100) / 100);
      if (pendingQty <= 0) continue;
      const list = poByItemCode.get(code) || [];
      list.push({
        poId: row.po_id,
        poCode: row.po_code,
        fileNumber: row.lc_tt_number || row.po_code,
        lcTtNumber: row.lc_tt_number || null,
        vesselName: row.vessel_name || null,
        containerNumber: row.container_number || null,
        orderDate: row.order_date,
        expectedDeliveryDate: row.expected_delivery_date,
        etaDate: row.eta_date || row.expected_delivery_date,
        etdDate: row.etd_date || null,
        status: row.status || 'DRAFT',
        purchaseOrigin: row.purchase_origin || 'IMPORT',
        importStage: row.import_stage || null,
        supplierName: row.supplier_name || 'Overseas Supplier',
        orderedQuantity: Math.round(ordQty * 100) / 100,
        receivedQuantity: Math.round(recQty * 100) / 100,
        pendingQuantity: pendingQty,
        uom: 'GRS',
      });
      poByItemCode.set(code, list);
    }

    const nippleConfigRows: any[] = this.orderRepo.manager?.query
      ? await this.orderRepo.manager
          .query(
            `SELECT id, manual_monthly_usage_grs, import_lead_time_months, safety_buffer_months
             FROM public.items
             WHERE company_id = $1
               AND (item_code LIKE 'FG-NP-%' OR LOWER(name) LIKE '%nipple%')`,
            [companyId],
          )
          .catch(() => [])
      : [];

    const nippleConfigById = new Map<
      string,
      {
        manualMonthlyUsageGrs: number | null;
        importLeadTimeMonths: number;
        safetyBufferMonths: number;
      }
    >();
    for (const row of nippleConfigRows) {
      nippleConfigById.set(String(row.id), {
        manualMonthlyUsageGrs:
          row.manual_monthly_usage_grs !== null && row.manual_monthly_usage_grs !== undefined
            ? Number(row.manual_monthly_usage_grs)
            : null,
        importLeadTimeMonths:
          row.import_lead_time_months !== null && row.import_lead_time_months !== undefined
            ? Number(row.import_lead_time_months)
            : 4,
        safetyBufferMonths:
          row.safety_buffer_months !== null && row.safety_buffer_months !== undefined
            ? Number(row.safety_buffer_months)
            : 1,
      });
    }

    const nippleAnalytics = nippleItems.map(nItem => {
      const nName = (nItem.itemName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const linkedSpokeSets: Array<{
        spokeName: string;
        itemCode: string;
        orderedQuantity: number;
        dispatchedQuantity: number;
        pendingOrderQuantity: number;
        packedQuantity: number;
        withoutNippleQuantity: number;
        balanceToPackQuantity: number;
        pendingQuantity: number;
        uom: string;
      }> = [];

      let totalDemand = 0;
      let totalDispatchedInSpokes = 0;
      let totalPendingOrderInSpokes = 0;
      let totalPackedInSpokes = 0;
      let totalWithoutNippleInSpokes = 0;
      let totalBalanceToPackInSpokes = 0;

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
          // 1. Exclude already-dispatched quantities: Pending Order = Total Order - Dispatched
          const totalOrderedGrs = Math.max(0, Math.round((Number(sItem.orderedQuantity) || 0) * 100) / 100);
          const dispatchedGrs = Math.max(0, Math.round((Number(sItem.deliveredQuantity) || 0) * 100) / 100);
          const pendingOrderGrs = Math.max(0, Math.round((totalOrderedGrs - dispatchedGrs) * 100) / 100);

          // 2. Exclude WITHOUT_NIPPLE cartons from Packed FGR; only verified With-Nipple cartons consume nipples
          const packedWithNipplesGrs = Math.max(
            0,
            Math.round((Number((sItem as any).withNippleFgrAvailable ?? sItem.finishedGoodsAvailable) || 0) * 100) / 100,
          );
          const withoutNippleCartonsGrs = Math.max(
            0,
            Math.round((Number((sItem as any).withoutNippleFgrGrs) || 0) * 100) / 100,
          );

          // 3. Balance Remaining to Pack = max(0, Pending Order - Packed With Nipples)
          const balanceToPackGrs = Math.max(0, Math.round((pendingOrderGrs - packedWithNipplesGrs) * 100) / 100);

          linkedSpokeSets.push({
            spokeName: parts[0].trim(),
            itemCode: sItem.itemCode,
            orderedQuantity: totalOrderedGrs,
            dispatchedQuantity: dispatchedGrs,
            pendingOrderQuantity: pendingOrderGrs,
            packedQuantity: packedWithNipplesGrs,
            withoutNippleQuantity: withoutNippleCartonsGrs,
            balanceToPackQuantity: balanceToPackGrs,
            pendingQuantity: balanceToPackGrs,
            uom: sItem.uom || 'GRS',
          });
          totalDemand += totalOrderedGrs;
          totalDispatchedInSpokes += dispatchedGrs;
          totalPendingOrderInSpokes += pendingOrderGrs;
          totalPackedInSpokes += packedWithNipplesGrs;
          totalWithoutNippleInSpokes += withoutNippleCartonsGrs;
          totalBalanceToPackInSpokes += balanceToPackGrs;
        }
      });

      const totalOrderDemand = Math.round(totalDemand * 100) / 100;
      const totalDispatched = Math.round(totalDispatchedInSpokes * 100) / 100;
      const netPendingOrder = Math.round(totalPendingOrderInSpokes * 100) / 100;
      const packedInCartonsFgr = Math.max(0, Math.round(totalPackedInSpokes * 100) / 100);
      const withoutNippleCartonsFgr = Math.max(0, Math.round(totalWithoutNippleInSpokes * 100) / 100);
      const remainingToPack = Math.max(0, Math.round(totalBalanceToPackInSpokes * 100) / 100);

      // 4. Current Unpacked Nipple Stock (WH-002) & Packable Balance (compare against remainingToPack without double-adding packedWithNipplesFgr)
      const currentFgStock = Math.max(0, Math.round((Number(nItem.finishedGoodsAvailable) || 0) * 100) / 100);
      const packableFromStockGrs = Math.round(Math.min(currentFgStock, remainingToPack) * 100) / 100;
      const totalAvailableStock = Math.round((packedInCartonsFgr + currentFgStock) * 100) / 100;

      // Net Nipple Shortage / Surplus: remainingToPack - currentUnpackedNippleStock
      const finalBalanceShortage = Math.round((remainingToPack - currentFgStock) * 100) / 100;
      const netDeficitRequired = Math.max(0, finalBalanceShortage);
      const stockSurplus = Math.max(0, Math.round((currentFgStock - remainingToPack) * 100) / 100);

      // Step 3 (Advanced 3-Month Sales Forecasting & Safety Stock Buffer)
      const rolling3MonthVolume = Math.round(Math.max(totalOrderDemand, Number(nItem.orderedQuantity) || 0, Number(nItem.deliveredQuantity) || 0) * 100) / 100;
      const monthlyAvgConsumption = Math.round((rolling3MonthVolume / 3) * 100) / 100;
      const trendMinMonthly = Math.round(monthlyAvgConsumption * 0.85);
      const trendMaxMonthly = Math.round(monthlyAvgConsumption * 1.15);
      const threeMonthForecast = Math.round(Math.max(rolling3MonthVolume * 1.1, remainingToPack + monthlyAvgConsumption));
      const safetyStockBuffer = Math.round(Math.max(monthlyAvgConsumption * 0.75, threeMonthForecast * 0.25, rolling3MonthVolume > 0 ? 500 : 0));
      const recommendedOrderQty = Math.round(netDeficitRequired + safetyStockBuffer);

      // Step 4 (Purchase Orders & Import Coverage)
      const linkedPurchaseOrders = poByItemCode.get(String(nItem.itemCode || '').trim().toUpperCase()) || [];
      const totalPoOrdered = Math.round(linkedPurchaseOrders.reduce((s, p) => s + (Number(p.orderedQuantity) || 0), 0) * 100) / 100;
      const totalPoReceived = Math.round(linkedPurchaseOrders.reduce((s, p) => s + (Number(p.receivedQuantity) || 0), 0) * 100) / 100;
      const openPoPendingQty = Math.round(linkedPurchaseOrders.reduce((s, p) => s + (Number(p.pendingQuantity) || 0), 0) * 100) / 100;
      const remainingImportRequirement = Math.max(0, Math.round((netDeficitRequired - openPoPendingQty) * 100) / 100);
      const remainingTargetImportReq = Math.max(0, Math.round((recommendedOrderQty - openPoPendingQty) * 100) / 100);

      // Step 5 (Hybrid 4-Month Advance Import Lead-Time Planning: Auto + Manual Monthly Usage Override)
      const cfg = nippleConfigById.get(String(nItem.itemId)) || {
        manualMonthlyUsageGrs: null,
        importLeadTimeMonths: 4,
        safetyBufferMonths: 1,
      };
      const manualMonthlyUsageGrs = cfg.manualMonthlyUsageGrs;
      const importLeadTimeMonths = Number(cfg.importLeadTimeMonths > 0 ? cfg.importLeadTimeMonths : 4);
      const safetyBufferMonths = Number(cfg.safetyBufferMonths >= 0 ? cfg.safetyBufferMonths : 1);
      const effectiveMonthlyUsage =
        manualMonthlyUsageGrs !== null && manualMonthlyUsageGrs > 0
          ? Math.round(manualMonthlyUsageGrs * 100) / 100
          : monthlyAvgConsumption;
      const usageSource: 'MANUAL' | 'AUTO' =
        manualMonthlyUsageGrs !== null && manualMonthlyUsageGrs > 0 ? 'MANUAL' : 'AUTO';

      const totalPipelineSupply = Math.round((currentFgStock + openPoPendingQty) * 100) / 100;
      const netAvailableAfterPendingOrders = Math.round((totalPipelineSupply - remainingToPack) * 100) / 100;
      const coverageMonths =
        effectiveMonthlyUsage > 0
          ? Number((netAvailableAfterPendingOrders / effectiveMonthlyUsage).toFixed(1))
          : 999;
      let projectedStockoutDate: string | null = null;
      if (effectiveMonthlyUsage > 0 && coverageMonths < 999) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(coverageMonths * 30)));
        projectedStockoutDate = d.toISOString().slice(0, 10);
      }
      const targetCoverageMonths = Math.round((importLeadTimeMonths + safetyBufferMonths) * 100) / 100;
      const targetStockNeeded = Math.round(effectiveMonthlyUsage * targetCoverageMonths);
      const orderTodayQty = Math.max(0, Math.round(targetStockNeeded - netAvailableAfterPendingOrders));
      const reorderAlertStatus: 'ORDER_TODAY' | 'COVERED' =
        coverageMonths < importLeadTimeMonths || orderTodayQty > 0 ? 'ORDER_TODAY' : 'COVERED';

      return {
        itemId: nItem.itemId,
        itemCode: nItem.itemCode,
        itemName: nItem.itemName,
        uom: 'GRS',
        linkedSpokeSets,
        linkedPurchaseOrders,
        totalPoOrdered,
        totalPoReceived,
        openPoPendingQty,
        remainingImportRequirement,
        remainingTargetImportReq,
        manualMonthlyUsageGrs,
        importLeadTimeMonths,
        safetyBufferMonths,
        effectiveMonthlyUsage,
        usageSource,
        totalPipelineSupply,
        netAvailableAfterPendingOrders,
        coverageMonths,
        projectedStockoutDate,
        targetCoverageMonths,
        targetStockNeeded,
        orderTodayQty,
        reorderAlertStatus,
        totalDemand: totalOrderDemand,
        totalOrderDemand,
        totalDispatched,
        netPendingOrder,
        totalPackedInSpokes: packedInCartonsFgr,
        packedInCartonsFgr,
        packedWithNipplesFgr: packedInCartonsFgr,
        withoutNippleCartonsFgr,
        remainingToPack,
        netPendingDemand: remainingToPack,
        fgStock: currentFgStock,
        currentFgStock,
        currentUnpackedNippleStock: currentFgStock,
        packableFromStockGrs,
        totalAvailableStock,
        baseQuantity: nItem.baseQuantity || 0,
        baseUom: nItem.baseUom || 'PCS',
        balance: finalBalanceShortage,
        finalBalanceShortage,
        netShortageOrSurplus: finalBalanceShortage,
        netDeficitRequired,
        stockSurplus,
        rolling3MonthVolume,
        monthlyAvgConsumption,
        trendMinMonthly,
        trendMaxMonthly,
        threeMonthForecast,
        safetyStockBuffer,
        recommendedOrderQty,
        status: finalBalanceShortage > 0 ? 'SHORTAGE' : finalBalanceShortage === 0 && remainingToPack > 0 ? 'EXACT' : 'SUFFICIENT',
      };
    }).sort((a, b) => String(a.itemCode || '').localeCompare(String(b.itemCode || '')));

    return {
      kpis: {
        totalSalesOrders,
        openOrders,
        ordersInProduction,
        finishedGoodsReady,
        pendingDelivery,
        deliveredOrders,
        totalOrderDemand,
        dispatchedVolume,
        netPendingOrders,
        availableFgStock,
        netDeficitForProduction,
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

    // Filter committed orders only (exclude DRAFT, CANCELLED, VOID)
    const committedOrders = orders.filter(o => isCommittedOrderStatus(o.status));

    // Also inject any customer from orders that may not be in salesCustomers
    committedOrders.forEach(o => {
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

      const cOrders = committedOrders.filter(o => 
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

    const [orderItems, deliveryLines, returnLines, allReturns, prodOrders, balances, orders, withoutNippleRows] = await Promise.all([
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
      this.orderRepo.find({ where: narrowWhereByDivision({ companyId }, 'divisionId', allowedDivisionIds), select: ['id', 'customerId', 'orderDate', 'divisionId', 'status'] }),
      this.orderRepo.manager?.query
        ? this.orderRepo.manager
            .query(
              `SELECT pe.item_id,
                      COALESCE(SUM(pe.actual_quantity), 0) AS without_nipple_pcs
               FROM public.production_entries pe
               WHERE pe.company_id = $1
                 AND pe.deleted_at IS NULL
                 AND pe.is_active = true
                 AND NOT (
                   pe.remarks ILIKE '%Status: COMPLETED%'
                   OR pe.remarks ILIKE '%Nipple Stock Deducted:%'
                   OR pe.remarks ILIKE '%Nipple Added:%'
                 )
                 AND (
                   pe.packing_mode = 'WITHOUT_NIPPLE'
                   OR pe.remarks ILIKE '%WITHOUT_NIPPLE%'
                   OR pe.remarks ILIKE '%Without Nipple%'
                 )
               GROUP BY pe.item_id`,
              [companyId],
            )
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const withoutNippleBaseByItem = new Map<string, number>();
    for (const r of (withoutNippleRows || []) as any[]) {
      if (r.item_id) {
        withoutNippleBaseByItem.set(String(r.item_id), Math.max(0, Number(r.without_nipple_pcs) || 0));
      }
    }

    // Only committed returns (approved or later) may reduce returned quantities/values;
    // DRAFT/SUBMITTED return lines are proposals and are excluded.
    const committedReturnIds = new Set(
      allReturns.filter(r => isCommittedReturnStatus(r.status)).map(r => r.id),
    );

    // Only committed orders (exclude DRAFT, CANCELLED, VOID) are counted in demand & analytics
    const committedOrders = orders.filter(o => isCommittedOrderStatus(o.status));
    const committedOrderIdSet = new Set(committedOrders.map(o => o.id));

    const orderCustMap = new Map<string, string>();
    const orderDateMap = new Map<string, string>();
    committedOrders.forEach(o => {
      orderCustMap.set(o.id, o.customerId);
      if (o.orderDate) orderDateMap.set(o.id, o.orderDate);
    });

    return items.map(item => {
      const curOrderItems = orderItems.filter(oi => oi.itemId === item.id && committedOrderIdSet.has(oi.salesOrderId));
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
      const shippedFromOrderItems = curOrderItems.reduce((sum, oi) => sum + (Number((oi as any).shippedQuantity) || 0), 0);
      const deliveredFromLines = curDelLines.reduce((sum, dl) => sum + (Number(dl.quantity) || 0), 0);
      const deliveredQuantity = Math.max(deliveredFromLines, shippedFromOrderItems);
      const returnedQuantity = curReturnLines.reduce((sum, rl) => sum + (Number(rl.quantity) || 0), 0);
      const producedQuantityBase = curProdOrders.reduce((sum, po) => sum + (Number(po.completedQuantity) || 0), 0);
      const producedQuantity = Math.round(this.convertQty(producedQuantityBase, baseUomCode, salesUomCode) * 100) / 100;
      
      const isSpokeSetItem = Boolean(
        (item.name && item.name.includes('_')) ||
          (item.itemCode && item.itemCode.toUpperCase().startsWith('SPI-FG-SPK-')),
      );
      const rawOnHandBase = Math.max(0, curBalances.reduce((sum, b) => sum + (Number(b.onHand) || 0), 0));
      const positiveOnHandBase = Math.max(0, curBalances.reduce((sum, b) => sum + Math.max(0, Number(b.onHand) || 0), 0));
      const withoutNippleBase = Math.max(0, withoutNippleBaseByItem.get(item.id) || 0);
      const verifiedWithNippleBase = Math.max(0, rawOnHandBase - withoutNippleBase);
      const withNippleFgrAvailable = Math.max(
        0,
        Math.round(this.convertQty(verifiedWithNippleBase, baseUomCode, salesUomCode) * 100) / 100,
      );
      const withoutNippleFgrGrs = Math.max(
        0,
        Math.round(this.convertQty(withoutNippleBase, baseUomCode, salesUomCode) * 100) / 100,
      );

      // For loose Nipple / non-spoke items, sum positive warehouse on_hand balances (e.g. WH-002) clamped >= 0
      const rawAvailableBase = isSpokeSetItem
        ? verifiedWithNippleBase
        : positiveOnHandBase;
      const finishedGoodsAvailable = isSpokeSetItem
        ? withNippleFgrAvailable
        : Math.max(0, Math.round(this.convertQty(positiveOnHandBase, baseUomCode, salesUomCode) * 100) / 100);

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

      // Automated Stock Inventory, Shortage & 3-Month Sales Forecasting
      const packedInCartonsFgr = Math.round(Math.max(0, producedQuantity - deliveredQuantity) * 100) / 100;
      const currentFgStock = finishedGoodsAvailable;
      const totalAvailableStock = Math.round((packedInCartonsFgr + currentFgStock) * 100) / 100;
      const netPendingDemand = Math.round(Math.max(0, orderedQuantity - deliveredQuantity) * 100) / 100;
      const finalBalanceShortage = Math.round((netPendingDemand - totalAvailableStock) * 100) / 100;
      const netDeficitRequired = Math.max(0, finalBalanceShortage);

      const rolling3MonthVolume = Math.round(Math.max(orderedQuantity, deliveredQuantity, producedQuantity) * 100) / 100;
      const monthlyAvgConsumption = Math.round((rolling3MonthVolume / 3) * 100) / 100;
      const trendMinMonthly = Math.round(monthlyAvgConsumption * 0.85);
      const trendMaxMonthly = Math.round(monthlyAvgConsumption * 1.15);
      const threeMonthForecast = Math.round(Math.max(rolling3MonthVolume * 1.1, netPendingDemand + monthlyAvgConsumption));
      const configuredSafety = Number(item.safetyStockLevel) || 0;
      const safetyStockBuffer = Math.round(Math.max(configuredSafety, monthlyAvgConsumption * 0.75, threeMonthForecast * 0.25, rolling3MonthVolume > 0 ? 500 : 0));
      const recommendedOrderQty = Math.round(netDeficitRequired + safetyStockBuffer);

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
        withNippleFgrAvailable,
        withoutNippleFgrGrs,
        packedInCartonsFgr,
        currentFgStock,
        totalAvailableStock,
        netPendingDemand,
        finalBalanceShortage,
        netDeficitRequired,
        rolling3MonthVolume,
        monthlyAvgConsumption,
        trendMinMonthly,
        trendMaxMonthly,
        threeMonthForecast,
        safetyStockBuffer,
        recommendedOrderQty,
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
    const committedOrders = orders.filter(o => isCommittedOrderStatus(o.status));
    const orderMap = new Map(committedOrders.map(o => [o.id, o]));
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
    const rawOrders = await this.orderRepo.find({
      where: narrowWhereByDivision({ companyId }, 'divisionId', allowedDivisionIds),
      relations: ['customer', 'items', 'items.item', 'items.item.baseUom', 'items.item.salesUom'],
      order: { orderDate: 'DESC' },
    });
    const orders = rawOrders.filter(o => isCommittedOrderStatus(o.status));

    // Shipped quantities from confirmed deliveries (line-level and header-level SOC)
    const shippedRows = this.orderRepo.manager?.query
      ? await this.orderRepo.manager.query(
          `SELECT sd.delivery_number, so.order_number as header_soc,
                  sdl.item_id, sdl.description, sdl.quantity
           FROM erp_sales.sales_delivery_lines sdl
           JOIN erp_sales.sales_deliveries sd ON sd.id = sdl.delivery_id
           LEFT JOIN erp_sales.sales_orders so ON so.id = sd.sales_order_id
           WHERE sd.status IN ('CONFIRMED', 'DELIVERED', 'SHIPPED')`
        )
      : [];
    const shippedBySocItem = new Map<string, number>();
    const shippedBySoc = new Map<string, number>();
    for (const r of shippedRows) {
      const socMatch = r.description?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
      const soc = socMatch ? socMatch[1].trim() : r.header_soc;
      if (!soc) continue;
      const qty = Number(r.quantity) || 0;
      shippedBySoc.set(soc, (shippedBySoc.get(soc) || 0) + qty);
      if (r.item_id) {
        const key = `${soc}__${r.item_id}`;
        shippedBySocItem.set(key, (shippedBySocItem.get(key) || 0) + qty);
      }
    }

    // Production entries linked by SOC in remarks (deduplicating duplicate batch records)
    const peRows = this.orderRepo.manager?.query
      ? await this.orderRepo.manager.query(
          `SELECT entry_number, remarks, actual_quantity, item_id
           FROM public.production_entries
           WHERE remarks ILIKE '%SOC%'
           ORDER BY entry_number DESC`
        )
      : [];
    const prodBySocItem = new Map<string, number>();
    const prodBySoc = new Map<string, number>();
    const seenBatches = new Set<string>();

    for (const r of peRows) {
      const socMatch = r.remarks?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
      if (!socMatch) continue;
      const soc = socMatch[1].trim();

      const batchMatch = r.remarks?.match(/Batch[:\s]+(PKG-[A-Za-z0-9-]+)/i);
      const batchKey = batchMatch ? `${soc}__${batchMatch[1].trim()}` : `${soc}__${r.entry_number}`;
      if (seenBatches.has(batchKey)) continue;
      seenBatches.add(batchKey);

      // In production entries, actual_quantity is in PCS. 1 Gross = 144 PCS.
      const qtyGrs = Math.round(((Number(r.actual_quantity) || 0) / 144) * 100) / 100;
      prodBySoc.set(soc, (prodBySoc.get(soc) || 0) + qtyGrs);
      if (r.item_id) {
        const key = `${soc}__${r.item_id}`;
        prodBySocItem.set(key, (prodBySocItem.get(key) || 0) + qtyGrs);
      }
    }

    // Production orders linked (fallback)
    const prodOrders = await this.productionOrderRepo.find({
      where: { companyId },
    });
    const prodBySoItem = new Map<string, number>();
    prodOrders.forEach(po => {
      if (po.salesOrderItemId) {
        prodBySoItem.set(po.salesOrderItemId, (prodBySoItem.get(po.salesOrderItemId) || 0) + (Number(po.completedQuantity) || 0));
      }
    });

    return orders.map(order => {
      const isOrderDelivered = String(order.status).trim().toLowerCase() === 'delivered' || String(order.status).trim().toLowerCase() === 'closed';
      let orderedQuantity = 0;
      let deliveredQuantity = 0;
      let producedQuantity = 0;
      let fgAvailable = 0;

      const itemBreakdowns = (order.items || []).map(item => {
        const itemOrdered = Number(item.quantity) || 0;
        const isItemDelivered = isOrderDelivered || String(item.status).trim().toLowerCase() === 'delivered';

        let itemDelivered = shippedBySocItem.get(`${order.orderNumber}__${item.itemId}`) ?? Number(item.shippedQuantity || 0);
        const rawItemProduced = prodBySocItem.get(`${order.orderNumber}__${item.itemId}`) ?? (prodBySoItem.get(item.id) || 0);
        
        // Fulfillment production allocated to this order: at least what was shipped, capped at ordered requirement
        let itemProduced = Math.min(itemOrdered, Math.max(itemDelivered, rawItemProduced));
        let itemRemaining = Math.max(0, itemOrdered - itemDelivered);
        // FG available ready for this order: produced minus already delivered, capped by remaining needed
        let itemAvailable = Math.max(0, Math.min(itemRemaining, itemProduced - itemDelivered));

        // THE ULTIMATE RULE:
        // If Order Status = Delivered, then DELIVERED quantity must equal ORDERED quantity,
        // and REMAINING must automatically reduce to 0.
        if (isItemDelivered) {
          itemDelivered = itemOrdered;
          itemProduced = Math.max(itemOrdered, rawItemProduced);
          itemRemaining = 0;
          itemAvailable = 0;
        }

        orderedQuantity += itemOrdered;
        deliveredQuantity += itemDelivered;
        producedQuantity += itemProduced;
        fgAvailable += itemAvailable;

        return {
          itemId: item.itemId,
          itemCode: item.item?.itemCode || 'N/A',
          itemName: item.item?.name || item.description || 'N/A',
          orderedQuantity: Math.round(itemOrdered * 100) / 100,
          producedQuantity: Math.round(itemProduced * 100) / 100,
          finishedGoodsAvailable: Math.round(itemAvailable * 100) / 100,
          deliveredQuantity: Math.round(itemDelivered * 100) / 100,
          remainingDeliveryQuantity: Math.round(itemRemaining * 100) / 100,
          fulfillmentPercentage: itemOrdered > 0 ? (isItemDelivered ? 100 : Math.min(100, Math.round((itemDelivered / itemOrdered) * 100))) : 0,
        };
      });

      // Order-level fallbacks if item lines didn't capture all
      if (!isOrderDelivered) {
        if (shippedBySoc.has(order.orderNumber)) {
          const rawShip = shippedBySoc.get(order.orderNumber) || 0;
          if (rawShip > deliveredQuantity) {
            deliveredQuantity = Math.min(orderedQuantity, rawShip);
          }
        }
        if (prodBySoc.has(order.orderNumber)) {
          const rawProd = prodBySoc.get(order.orderNumber) || 0;
          if (rawProd > producedQuantity) {
            producedQuantity = Math.min(orderedQuantity, Math.max(deliveredQuantity, rawProd));
            fgAvailable = Math.max(0, Math.min(orderedQuantity - deliveredQuantity, producedQuantity - deliveredQuantity));
          }
        }
      } else {
        deliveredQuantity = orderedQuantity;
        producedQuantity = Math.max(orderedQuantity, producedQuantity);
        fgAvailable = 0;
      }

      const remainingDeliveryQuantity = isOrderDelivered ? 0 : Math.max(0, orderedQuantity - deliveredQuantity);
      const fulfillmentPercentage = isOrderDelivered ? 100 : (orderedQuantity > 0 ? Math.min(100, Math.round((deliveredQuantity / orderedQuantity) * 100)) : 0);
      const effectiveStatus = isOrderDelivered ? 'Delivered' : (fulfillmentPercentage >= 100 ? 'Delivered' : fulfillmentPercentage > 0 ? 'Processing' : order.status);

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerId: order.customerId,
        customerName: order.customer?.companyName || 'N/A',
        orderDate: order.orderDate,
        status: effectiveStatus,
        orderedQuantity: Math.round(orderedQuantity * 100) / 100,
        producedQuantity: Math.round(producedQuantity * 100) / 100,
        finishedGoodsAvailable: Math.round(fgAvailable * 100) / 100,
        deliveredQuantity: Math.round(deliveredQuantity * 100) / 100,
        remainingDeliveryQuantity: Math.round(remainingDeliveryQuantity * 100) / 100,
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
    const totalOrdByItem = new Map<string, number>();
    orderItems.forEach(oi => {
      if (!oi.itemId) return;
      totalOrdByItem.set(oi.itemId, (totalOrdByItem.get(oi.itemId) || 0) + (Number(oi.quantity) || 0));
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

      const totalOrderDemand = totalOrdByItem.get(item.id) || 0;
      const openSalesOrderQuantity = openQtyByItem.get(item.id) || 0;
      const safetyStock = Number(item.safetyStockLevel) || 0;
      const requiredStock = openSalesOrderQuantity + safetyStock;
      const projectedBalance = available - requiredStock;

      // Step 1 & Step 2: Total Available Stock & Final Balance / Shortage
      const packedInCartonsFgr = reserved;
      const currentFgStock = available;
      const totalAvailableStock = Math.round((packedInCartonsFgr + currentFgStock) * 100) / 100;
      const finalBalanceShortage = Math.round((openSalesOrderQuantity - totalAvailableStock) * 100) / 100;
      const netDeficitRequired = Math.max(0, finalBalanceShortage);

      // Step 3: 3-Month Sales Forecast & Automated Safety Stock Buffer
      const rolling3MonthVolume = Math.round(Math.max(totalOrderDemand, openSalesOrderQuantity) * 100) / 100;
      const monthlyAvgConsumption = Math.round((rolling3MonthVolume / 3) * 100) / 100;
      const trendMinMonthly = Math.round(monthlyAvgConsumption * 0.85);
      const trendMaxMonthly = Math.round(monthlyAvgConsumption * 1.15);
      const threeMonthForecast = Math.round(Math.max(rolling3MonthVolume * 1.1, openSalesOrderQuantity + monthlyAvgConsumption));
      const safetyStockBuffer = Math.round(Math.max(safetyStock, monthlyAvgConsumption * 0.75, threeMonthForecast * 0.25, rolling3MonthVolume > 0 ? 500 : 0));
      const recommendedOrderQty = Math.round(netDeficitRequired + safetyStockBuffer);

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
        packedInCartonsFgr,
        totalAvailableStock,
        totalOrderDemand,
        openSalesOrderQuantity,
        netPendingDemand: openSalesOrderQuantity,
        demand: openSalesOrderQuantity,
        safetyStock,
        safetyStockBuffer,
        requiredStock,
        projectedBalance,
        finalBalanceShortage,
        netDeficitRequired,
        rolling3MonthVolume,
        monthlyAvgConsumption,
        trendMinMonthly,
        trendMaxMonthly,
        threeMonthForecast,
        recommendedOrderQty,
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

  /**
   * 8. TIME-PHASED NIPPLE IMPORT SHIPMENT PROJECTION & AUTO-REORDER MATRIX
   */
  async getNippleShipmentPlan(
    companyId: string,
    options?: {
      safetyMonths?: number;
      horizonDate?: string;
      includeFgrStock?: boolean;
      asOfDate?: string;
    },
    allowedDivisionIds?: DivisionAccess,
  ) {
    const safetyMonths = Number(options?.safetyMonths || 4);
    const includeFgrStock = Boolean(options?.includeFgrStock);
    const todayIso = options?.asOfDate
      ? String(options.asOfDate).slice(0, 10)
      : new Date().toISOString().slice(0, 10);

    const defaultHorizon = new Date(`${todayIso}T00:00:00Z`);
    defaultHorizon.setUTCMonth(defaultHorizon.getUTCMonth() + Math.round(safetyMonths));
    const horizonDate = options?.horizonDate
      ? String(options.horizonDate).slice(0, 10)
      : defaultHorizon.toISOString().slice(0, 10);

    const dashboard = await this.getSalesDashboard(
      companyId,
      { period: SalesAnalyticsPeriod.ALL },
      allowedDivisionIds,
    );
    const nippleAnalytics: any[] = dashboard?.nippleAnalytics || dashboard?.itemSection?.nippleAnalytics || [];

    const toIsoDate = (val: any): string => {
      if (!val) return todayIso;
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      return String(val).slice(0, 10);
    };

    const daysBetween = (startIso: string, endIso: string): number => {
      const d1 = new Date(`${toIsoDate(startIso)}T00:00:00Z`).getTime();
      const d2 = new Date(`${toIsoDate(endIso)}T00:00:00Z`).getTime();
      if (isNaN(d1) || isNaN(d2)) return 0;
      return Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
    };

    // Build chronological open shipment milestones across all Nipple items
    const shipmentMap = new Map<
      string,
      {
        poId: string;
        poNumber: string;
        fileNumber: string;
        lcTtNumber: string | null;
        vendorName: string;
        etaDate: string;
        etdDate: string | null;
        orderDate: string | null;
        importStage: string;
        status: string;
        purchaseOrigin: string;
        vesselName: string | null;
        containerNumber: string | null;
        totalShipmentQtyGrs: number;
        itemQuantities: Record<string, number>;
      }
    >();

    for (const nItem of nippleAnalytics) {
      const code = String(nItem.itemCode || '').trim().toUpperCase();
      const pos: any[] = Array.isArray(nItem.linkedPurchaseOrders) ? nItem.linkedPurchaseOrders : [];
      for (const po of pos) {
        const pendingGrs = Number(po.pendingQuantity || 0);
        if (pendingGrs <= 0) continue;
        const poKey = String(po.poId || po.poCode);
        const etaIso = toIsoDate(po.etaDate || po.expectedDeliveryDate || po.orderDate || todayIso);
        let entry = shipmentMap.get(poKey);
        if (!entry) {
          entry = {
            poId: po.poId,
            poNumber: po.poCode,
            fileNumber: po.lcTtNumber || po.fileNumber || po.poCode,
            lcTtNumber: po.lcTtNumber || null,
            vendorName: po.supplierName || 'Overseas Supplier',
            etaDate: etaIso,
            etdDate: po.etdDate ? toIsoDate(po.etdDate) : null,
            orderDate: po.orderDate ? toIsoDate(po.orderDate) : null,
            importStage: po.importStage || 'ORDER_PLACED',
            status: po.status || 'DRAFT',
            purchaseOrigin: po.purchaseOrigin || 'IMPORT',
            vesselName: po.vesselName || null,
            containerNumber: po.containerNumber || null,
            totalShipmentQtyGrs: 0,
            itemQuantities: {},
          };
          shipmentMap.set(poKey, entry);
        }
        entry.itemQuantities[code] = Math.round(((entry.itemQuantities[code] || 0) + pendingGrs) * 100) / 100;
        entry.totalShipmentQtyGrs = Math.round((entry.totalShipmentQtyGrs + pendingGrs) * 100) / 100;
      }
    }

    const shipmentMilestones = Array.from(shipmentMap.values()).sort((a, b) => {
      const cmp = a.etaDate.localeCompare(b.etaDate);
      return cmp !== 0 ? cmp : a.poNumber.localeCompare(b.poNumber);
    });

    const rows = nippleAnalytics.map((nItem, idx) => {
      const code = String(nItem.itemCode || '').trim().toUpperCase();
      const last3MonthSales = Math.round(Number(nItem.rolling3MonthVolume ?? nItem.totalDemand ?? 0) * 100) / 100;
      const monthlyAverage =
        Math.round((Number(nItem.effectiveMonthlyUsage || 0) || last3MonthSales / 3) * 100) / 100;
      const dailyConsumptionRate = Math.round((monthlyAverage / 30) * 10000) / 10000;
      const forecastSafetyStock = Math.round(monthlyAverage * safetyMonths);

      const unpackedFgStock = Math.round(Number(nItem.currentFgStock ?? nItem.fgStock ?? 0) * 100) / 100;
      const packedInCartonsFgr = Math.round(Number(nItem.packedInCartonsFgr ?? nItem.totalPackedInSpokes ?? 0) * 100) / 100;
      const totalAvailableStock = Math.round((unpackedFgStock + packedInCartonsFgr) * 100) / 100;
      const stockInHand = includeFgrStock ? totalAvailableStock : unpackedFgStock;

      let runningStock = stockInHand;
      let prevDate = todayIso;
      let hasStockoutAlert = false;

      const milestoneProjections = shipmentMilestones.map((ms, msIdx) => {
        const shipmentQtyGrs = Number(ms.itemQuantities[code] || 0);
        const daysElapsed =
          msIdx === 0
            ? daysBetween(todayIso, ms.etaDate)
            : daysBetween(prevDate, ms.etaDate);
        const materialConsumedTillEta = Math.round(daysElapsed * dailyConsumptionRate);
        const stockBeforeShipment = Math.round(runningStock - materialConsumedTillEta);
        const isStockoutBeforeArrival = stockBeforeShipment < 0;
        if (isStockoutBeforeArrival) hasStockoutAlert = true;

        const stockAfterShipment = Math.round(stockBeforeShipment + shipmentQtyGrs);

        const nextEta =
          msIdx + 1 < shipmentMilestones.length
            ? shipmentMilestones[msIdx + 1].etaDate
            : horizonDate;
        const daysTillNextEta = daysBetween(ms.etaDate, nextEta);
        const materialConsumedTillNextEta = Math.round(daysTillNextEta * dailyConsumptionRate);

        runningStock = stockAfterShipment;
        prevDate = ms.etaDate;

        return {
          poId: ms.poId,
          poNumber: ms.poNumber,
          fileNumber: ms.fileNumber,
          vendorName: ms.vendorName,
          etaDate: ms.etaDate,
          importStage: ms.importStage,
          daysElapsed,
          materialConsumedTillEta,
          stockBeforeShipment,
          isStockoutBeforeArrival,
          shipmentQtyGrs,
          daysTillNextEta,
          materialConsumedTillNextEta,
          stockAfterShipment,
        };
      });

      const endingProjectedStock = Math.round(runningStock);
      const safeInMonths =
        monthlyAverage > 0 ? Number((endingProjectedStock / monthlyAverage).toFixed(2)) : 999;
      const recommendedOrderQty = Math.max(0, Math.round(forecastSafetyStock - endingProjectedStock));

      return {
        sNo: idx + 1,
        itemId: nItem.itemId,
        itemCode: nItem.itemCode,
        itemName: nItem.itemName,
        uom: 'GRS',
        last3MonthSales,
        monthlyAverage,
        dailyConsumptionRate,
        safetyMonths,
        forecastSafetyStock,
        unpackedFgStock,
        currentUnpackedNippleStock: unpackedFgStock,
        packedInCartonsFgr,
        packedWithNipplesFgr: packedInCartonsFgr,
        withoutNippleCartonsFgr: Number(nItem.withoutNippleCartonsFgr || 0),
        totalAvailableStock,
        stockInHand,
        totalOrderDemand: Number(nItem.totalOrderDemand ?? nItem.totalDemand ?? 0),
        totalDispatched: Number(nItem.totalDispatched || 0),
        netPendingOrder: Number(nItem.netPendingOrder || 0),
        remainingToPack: Number(nItem.remainingToPack ?? nItem.netPendingDemand ?? 0),
        packableFromStockGrs: Number(nItem.packableFromStockGrs || 0),
        netShortageOrSurplus: Number(nItem.netShortageOrSurplus ?? nItem.finalBalanceShortage ?? 0),
        netPendingDemand: Number(nItem.netPendingDemand || 0),
        openPoPendingQty: Number(nItem.openPoPendingQty || 0),
        milestoneProjections,
        endingProjectedStock,
        safeInMonths,
        recommendedOrderQty,
        hasStockoutAlert,
        manualMonthlyUsageGrs: nItem.manualMonthlyUsageGrs ?? null,
        importLeadTimeMonths: Number(nItem.importLeadTimeMonths ?? 4),
        safetyBufferMonths: Number(nItem.safetyBufferMonths ?? 1),
        effectiveMonthlyUsage: Number(nItem.effectiveMonthlyUsage ?? monthlyAverage),
        usageSource: nItem.usageSource || 'AUTO',
        totalPipelineSupply: Number(nItem.totalPipelineSupply ?? 0),
        netAvailableAfterPendingOrders: Number(nItem.netAvailableAfterPendingOrders ?? 0),
        coverageMonths: Number(nItem.coverageMonths ?? 999),
        projectedStockoutDate: nItem.projectedStockoutDate ?? null,
        targetCoverageMonths: Number(nItem.targetCoverageMonths ?? 5),
        targetStockNeeded: Number(nItem.targetStockNeeded ?? 0),
        orderTodayQty: Number(nItem.orderTodayQty ?? 0),
        reorderAlertStatus: nItem.reorderAlertStatus || 'COVERED',
        linkedSpokeSets: nItem.linkedSpokeSets || [],
        linkedPurchaseOrders: nItem.linkedPurchaseOrders || [],
      };
    });

    return {
      asOfDate: todayIso,
      horizonDate,
      safetyMonths,
      includeFgrStock,
      shipmentMilestones,
      rows,
    };
  }

  /**
   * 9. UPDATE PER-NIPPLE LEAD-TIME & MONTHLY USAGE PLANNING CONFIG
   */
  async updateNipplePlanningConfig(
    companyId: string,
    itemId: string,
    dto: {
      manualMonthlyUsageGrs?: number | null;
      importLeadTimeMonths?: number;
      safetyBufferMonths?: number;
    },
  ) {
    const manualUsage =
      dto.manualMonthlyUsageGrs === null || dto.manualMonthlyUsageGrs === undefined || dto.manualMonthlyUsageGrs === ('' as any)
        ? null
        : Math.max(0, Number(dto.manualMonthlyUsageGrs));
    const leadTime =
      dto.importLeadTimeMonths !== undefined && dto.importLeadTimeMonths !== null
        ? Math.max(0.5, Math.min(24, Number(dto.importLeadTimeMonths) || 4))
        : undefined;
    const safetyBuffer =
      dto.safetyBufferMonths !== undefined && dto.safetyBufferMonths !== null
        ? Math.max(0, Math.min(12, Number(dto.safetyBufferMonths)))
        : undefined;

    await this.orderRepo.manager.query(
      `UPDATE public.items
       SET manual_monthly_usage_grs = $1,
           import_lead_time_months = COALESCE($2, import_lead_time_months),
           safety_buffer_months = COALESCE($3, safety_buffer_months),
           updated_at = NOW()
       WHERE id = $4 AND company_id = $5`,
      [manualUsage, leadTime ?? null, safetyBuffer ?? null, itemId, companyId],
    );

    const [updated] = await this.orderRepo.manager.query(
      `SELECT id as "itemId", item_code as "itemCode", name as "itemName",
              manual_monthly_usage_grs as "manualMonthlyUsageGrs",
              import_lead_time_months as "importLeadTimeMonths",
              safety_buffer_months as "safetyBufferMonths"
       FROM public.items
       WHERE id = $1 AND company_id = $2`,
      [itemId, companyId],
    );

    return updated || {
      itemId,
      manualMonthlyUsageGrs: manualUsage,
      importLeadTimeMonths: leadTime ?? 4,
      safetyBufferMonths: safetyBuffer ?? 1,
    };
  }

  /**
   * 10. PROACTIVE NIPPLE IMPORT REORDER ALERTS (4-Month Lead-Time Coverage)
   */
  async getNippleImportAlerts(companyId: string, allowedDivisionIds?: DivisionAccess) {
    const dashboard = await this.getSalesDashboard(
      companyId,
      { period: SalesAnalyticsPeriod.ALL },
      allowedDivisionIds,
    );
    const nippleAnalytics: any[] = dashboard?.nippleAnalytics || dashboard?.itemSection?.nippleAnalytics || [];
    return nippleAnalytics
      .filter((n) => Number(n.orderTodayQty || 0) > 0 || Number(n.coverageMonths ?? 999) < Number(n.importLeadTimeMonths ?? 4))
      .map((n) => ({
        itemId: n.itemId,
        itemCode: n.itemCode,
        itemName: n.itemName,
        coverageMonths: Number(n.coverageMonths ?? 0),
        projectedStockoutDate: n.projectedStockoutDate ?? null,
        orderTodayQty: Number(n.orderTodayQty || 0),
        openPoQty: Number(n.openPoPendingQty || 0),
        currentUnpackedNippleStock: Number(n.currentUnpackedNippleStock ?? n.currentFgStock ?? 0),
        remainingToPack: Number(n.remainingToPack || 0),
        effectiveMonthlyUsage: Number(n.effectiveMonthlyUsage || 0),
        importLeadTimeMonths: Number(n.importLeadTimeMonths ?? 4),
        safetyBufferMonths: Number(n.safetyBufferMonths ?? 1),
        usageSource: n.usageSource || 'AUTO',
        reorderAlertStatus: n.reorderAlertStatus || 'ORDER_TODAY',
      }));
  }
}
