import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { PurchaseRequisition, PurchaseRequisitionLine, PurchaseOrder, PurchaseOrderLine, Supplier } from '../entities';
import { Item, ItemType, Uom } from '../../item/entities';
import { InventoryBalance } from '../../inventory/entities/inventory-balance.entity';
import { StockLedger } from '../../inventory/entities/stock-ledger.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';

export interface DeficitItemReport {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  categoryId?: string | null;
  categoryName?: string | null;
  uomId?: string | null;
  uomCode?: string | null;
  warehouseId?: string | null;
  currentAvailableStock: number;
  rolling3MonthVolume: number;
  monthlyAvgConsumption: number;
  threeMonthForecastQty: number;
  safetyStockBuffer: number;
  suggestedPrPurchaseQty: number;
  estimatedUnitPrice: number;
  estimatedTotalPrice: number;
  preferredSupplierId?: string | null;
}

export interface EvaluationResult {
  runReference: string;
  totalEvaluatedItems: number;
  deficitItemsCount: number;
  createdRequisitionsCount: number;
  updatedRequisitionsCount: number;
  requisitions: PurchaseRequisition[];
  deficits: DeficitItemReport[];
}

@Injectable()
export class AutomatedPrEngineService {
  private readonly logger = new Logger(AutomatedPrEngineService.name);

  constructor(
    @InjectRepository(PurchaseRequisition)
    private readonly prRepo: Repository<PurchaseRequisition>,
    @InjectRepository(PurchaseRequisitionLine)
    private readonly prLineRepo: Repository<PurchaseRequisitionLine>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PurchaseOrderLine)
    private readonly poLineRepo: Repository<PurchaseOrderLine>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(InventoryBalance)
    private readonly balanceRepo: Repository<InventoryBalance>,
    @InjectRepository(StockLedger)
    private readonly ledgerRepo: Repository<StockLedger>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Generates the next sequential requisition code (e.g. PR-AUTO-2026-0001)
   */
  private async generateAutoRequisitionCode(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const existing = await this.prRepo.find({
      where: { companyId },
      select: ['requisitionCode'],
    });

    let maxNum = 0;
    for (const r of existing) {
      if (!r.requisitionCode) continue;
      const m = r.requisitionCode.match(/PR-AUTO-(\d{4})-(\d+)/i) || r.requisitionCode.match(/PR-(\d{4})-(\d+)/i);
      if (m) {
        const num = parseInt(m[2], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    let nextNum = maxNum + 1;
    let code = `PR-AUTO-${year}-${String(nextNum).padStart(4, '0')}`;
    const codeSet = new Set(existing.map((x) => (x.requisitionCode || '').toUpperCase()));
    while (codeSet.has(code.toUpperCase())) {
      nextNum++;
      code = `PR-AUTO-${year}-${String(nextNum).padStart(4, '0')}`;
    }
    return code;
  }

  /**
   * Generates next PO Code (e.g. PO-2026-0001)
   */
  private async generatePoCode(companyId: string): Promise<string> {
    const year = new Date().getFullYear();
    const existing = await this.poRepo.find({
      where: { companyId },
      select: ['poCode'],
    });

    let maxNum = 0;
    for (const r of existing) {
      if (!r.poCode) continue;
      const m = r.poCode.match(/PO-(\d{4})-(\d+)/i) || r.poCode.match(/PO-(\d+)/i);
      if (m) {
        const num = parseInt(m[m.length - 1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    let nextNum = maxNum + 1;
    let code = `PO-${year}-${String(nextNum).padStart(4, '0')}`;
    const codeSet = new Set(existing.map((x) => (x.poCode || '').toUpperCase()));
    while (codeSet.has(code.toUpperCase())) {
      nextNum++;
      code = `PO-${year}-${String(nextNum).padStart(4, '0')}`;
    }
    return code;
  }

  /**
   * Evaluates inventory health against 3-Month Sales Forecast and Safety Stock Buffers.
   * Auto-drafts or updates multi-row Purchase Requisitions grouped by Material Family / Vendor.
   */
  async evaluateAndGenerateRequisitions(options: {
    companyId?: string;
    triggeredByItemId?: string;
    userId?: string;
  } = {}): Promise<EvaluationResult> {
    const runReference = `EVAL-${Date.now()}`;
    const companyId = options.companyId || (await this.getDefaultCompanyId());
    if (!companyId) {
      throw new BadRequestException('Company ID is required for automated replenishment evaluation.');
    }

    this.logger.log(`[${runReference}] Starting Automated PR Reorder Evaluation for company ${companyId}...`);

    // 1. Identify Target Raw Material & Consumable Items
    const rawMaterialQuery = this.itemRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .where('item.companyId = :companyId', { companyId })
      .andWhere('item.status = :status', { status: 'ACTIVE' })
      .andWhere(
        "(item.itemType IN (:...rmTypes) OR item.materialRoleUsage IS NOT NULL OR item.itemCode LIKE 'RM-%')",
        {
          rmTypes: [
            ItemType.RAW_MATERIAL,
            ItemType.PACKAGING_MATERIAL,
            ItemType.CONSUMABLE,
          ],
        },
      );

    if (options.triggeredByItemId) {
      rawMaterialQuery.andWhere('item.id = :tId', { tId: options.triggeredByItemId });
    }

    const targetItems = await rawMaterialQuery.getMany();
    this.logger.log(`[${runReference}] Found ${targetItems.length} active raw material / consumable items to evaluate.`);

    // 2. Query Available Balances
    const itemIds = targetItems.map((i) => i.id);
    const balances = itemIds.length > 0
      ? await this.balanceRepo
          .createQueryBuilder('ib')
          .select('ib.item_id', 'itemId')
          .addSelect('COALESCE(SUM(ib.available), 0)', 'totalAvailable')
          .addSelect('COALESCE(SUM(ib.on_hand), 0)', 'totalOnHand')
          .addSelect('MIN(ib.warehouse_id)', 'defaultWarehouseId')
          .where('ib.companyId = :companyId', { companyId })
          .andWhere('ib.item_id IN (:...itemIds)', { itemIds })
          .groupBy('ib.item_id')
          .getRawMany()
      : [];

    const balanceMap = new Map<string, { available: number; onHand: number; warehouseId: string | null }>();
    for (const b of balances) {
      balanceMap.set(b.itemId, {
        available: Number(b.totalAvailable || 0),
        onHand: Number(b.totalOnHand || 0),
        warehouseId: b.defaultWarehouseId || null,
      });
    }

    // 3. Query 90-Day Rolling Consumption from stock_ledger
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const consumptionRows = itemIds.length > 0
      ? await this.ledgerRepo
          .createQueryBuilder('sl')
          .select('sl.item_id', 'itemId')
          .addSelect('COALESCE(SUM(ABS(sl.quantity)), 0)', 'totalConsumed')
          .where('sl.companyId = :companyId', { companyId })
          .andWhere('sl.item_id IN (:...itemIds)', { itemIds })
          .andWhere('sl.transactionDate >= :ninetyDaysAgo', { ninetyDaysAgo })
          .andWhere(
            "sl.transactionType IN ('PRODUCTION_CONSUMPTION', 'PRODUCTION_ISSUE', 'ISSUE', 'TRANSFER_OUT', 'SALES_DELIVERY')",
          )
          .groupBy('sl.item_id')
          .getRawMany()
      : [];

    const consumptionMap = new Map<string, number>();
    for (const c of consumptionRows) {
      consumptionMap.set(c.itemId, Number(c.totalConsumed || 0));
    }

    // 4. Query Latest Purchase Rates from purchase_order_lines
    const latestRates = itemIds.length > 0
      ? await this.dataSource.query<{ item_id: string; unit_price: number; supplier_id: string | null }[]>(
          `SELECT DISTINCT ON (pol.item_id) pol.item_id, pol.unit_price, po.supplier_id
           FROM purchase_order_lines pol
           JOIN purchase_orders po ON po.id = pol.po_id
           WHERE pol.item_id = ANY($1::uuid[])
           ORDER BY pol.item_id, po.order_date DESC NULLS LAST, pol.created_at DESC`,
          [itemIds],
        )
      : [];

    const rateMap = new Map<string, { price: number; supplierId: string | null }>();
    for (const r of latestRates) {
      rateMap.set(r.item_id, {
        price: Number(r.unit_price) || 0,
        supplierId: r.supplier_id || null,
      });
    }

    // 5. Query Primary Finished Goods Demand to link downstream demand
    const fgDemandRaw = await this.dataSource.query<{ total_open_demand: number }[]>(
      `SELECT COALESCE(SUM(quantity - COALESCE(delivered_quantity, 0)), 0) as total_open_demand
       FROM erp_sales.sales_order_items oi
       JOIN erp_sales.sales_orders so ON so.id = oi.sales_order_id
       WHERE so.status NOT IN ('CANCELLED', 'CLOSED')`,
    ).catch(() => [{ total_open_demand: 0 }]);
    const totalFgOpenDemand = Number(fgDemandRaw[0]?.total_open_demand || 0);

    // 6. Evaluate Each Item and Identify Deficits
    const deficitItems: DeficitItemReport[] = [];

    for (const item of targetItems) {
      const stock = balanceMap.get(item.id) || { available: 0, onHand: 0, warehouseId: null };
      const currentAvailableStock = stock.available;

      // 3-Month Rolling Consumption calculation
      const rolling3MonthVolume = Math.round((consumptionMap.get(item.id) || 0) * 100) / 100;
      const monthlyAvgConsumption = Math.round((rolling3MonthVolume / 3) * 100) / 100;

      // 3-Month Sales Forecast Quantity
      // Formula: max(rolling 3-month volume * 1.1, monthly avg * 3, configured reorder level, 100)
      const baseForecast = Math.max(
        rolling3MonthVolume * 1.1,
        monthlyAvgConsumption * 3,
        Number(item.reorderLevel) || 0,
        rolling3MonthVolume > 0 ? 100 : 50,
      );
      const threeMonthForecastQty = Math.round(baseForecast);

      // Safety Stock Buffer Definition:
      // Minimum stock required to sustain factory production, calculated dynamically from rolling trends
      const configuredSafety = Number(item.safetyStockLevel) || 0;
      const configuredMin = Number(item.minimumStockLevel) || 0;
      const safetyStockBuffer = Math.round(
        Math.max(
          configuredSafety,
          configuredMin,
          monthlyAvgConsumption * 0.75,
          threeMonthForecastQty * 0.25,
          rolling3MonthVolume > 0 ? 100 : 50,
        ),
      );

      // Evaluation Condition: Current Available Warehouse Stock < Calculated Safety Stock Buffer
      if (currentAvailableStock < safetyStockBuffer) {
        // Suggested PR Purchase Qty = (3-Month Sales Forecast Qty + Safety Stock Buffer) - Current Available Stock
        const suggestedPrPurchaseQty = Math.max(
          1,
          Math.round((threeMonthForecastQty + safetyStockBuffer) - currentAvailableStock),
        );

        const rateInfo = rateMap.get(item.id);
        const estimatedUnitPrice = rateInfo?.price || Number(item.costPrice) || 100;
        const estimatedTotalPrice = Math.round(suggestedPrPurchaseQty * estimatedUnitPrice * 100) / 100;

        deficitItems.push({
          itemId: item.id,
          itemCode: item.itemCode,
          itemName: item.name,
          itemType: item.itemType,
          categoryId: item.categoryId || item.category?.id || null,
          categoryName: item.category?.name || 'Raw Materials',
          uomId: item.purchaseUomId || item.baseUomId || null,
          warehouseId: stock.warehouseId,
          currentAvailableStock,
          rolling3MonthVolume,
          monthlyAvgConsumption,
          threeMonthForecastQty,
          safetyStockBuffer,
          suggestedPrPurchaseQty,
          estimatedUnitPrice,
          estimatedTotalPrice,
          preferredSupplierId: rateInfo?.supplierId || null,
        });
      }
    }

    this.logger.log(
      `[${runReference}] Evaluation completed: ${deficitItems.length} raw material items dropped below safety stock line.`,
    );

    // 7. Grouping Rules: Consolidate multiple item deficits from the same raw material family or vendor profile
    const groups = new Map<string, { familyName: string; supplierId: string | null; items: DeficitItemReport[] }>();

    for (const deficit of deficitItems) {
      // Grouping key: by category / family (or supplier if preferred)
      const groupKey = deficit.categoryId || deficit.categoryName || 'GENERAL_RAW_MATERIALS';
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          familyName: deficit.categoryName || 'Raw Material Consumables',
          supplierId: deficit.preferredSupplierId || null,
          items: [],
        });
      }
      groups.get(groupKey)!.items.push(deficit);
    }

    // 8. Auto-Drafting Purchase Requisitions inside Procurement Module
    const createdPrs: PurchaseRequisition[] = [];
    let createdCount = 0;
    let updatedCount = 0;

    for (const [groupKey, group] of groups.entries()) {
      // Check if an existing system-generated pending PR already exists for this family
      let pr = await this.prRepo.findOne({
        where: {
          companyId,
          projectCode: 'AUTO_FORECAST',
          status: 'DRAFT',
          department: group.familyName,
        },
        relations: ['lines'],
      });

      const todayStr = new Date().toISOString().split('T')[0];
      const deliveryDateStr = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      if (!pr) {
        const code = await this.generateAutoRequisitionCode(companyId);
        pr = this.prRepo.create({
          companyId,
          requisitionCode: code,
          title: `Auto PR - ${group.familyName} Replenishment (3-Mo Forecast)`,
          description: `Automated Purchase Requisition triggered by 3-Month Sales Forecasting & Safety Stock Buffer Engine [${runReference}]. Consolidating ${group.items.length} raw material deficits.`,
          requestType: 'STANDARD',
          projectCode: 'AUTO_FORECAST',
          department: group.familyName,
          status: 'DRAFT',
          requestedDeliveryDate: deliveryDateStr,
          notes: JSON.stringify({
            generatedAt: new Date().toISOString(),
            runReference,
            totalItems: group.items.length,
            model: '3-Month Sales Forecast + Safety Stock Buffer',
            summary: group.items.map((i) => ({
              item: i.itemCode,
              avail: i.currentAvailableStock,
              safety: i.safetyStockBuffer,
              forecast: i.threeMonthForecastQty,
              suggested: i.suggestedPrPurchaseQty,
            })),
          }),
          createdBy: options.userId || null,
          updatedBy: options.userId || null,
        });
        pr = await this.prRepo.save(pr);
        createdCount++;
        this.logger.log(`Created new System-Generated PR ${pr.requisitionCode} for ${group.familyName}`);
      } else {
        // Update existing draft PR notes & header
        pr.title = `Auto PR - ${group.familyName} Replenishment (3-Mo Forecast)`;
        pr.description = `Automated Purchase Requisition refreshed on ${todayStr} [${runReference}]. Consolidating ${group.items.length} raw material deficits.`;
        pr.updatedBy = options.userId || null;
        await this.prRepo.save(pr);
        updatedCount++;
        this.logger.log(`Synchronizing existing System-Generated PR ${pr.requisitionCode} for ${group.familyName}`);
      }

      // Re-populate lines for this PR
      await this.prLineRepo.delete({ requisitionId: pr.id });

      const linesToInsert: PurchaseRequisitionLine[] = [];
      for (let idx = 0; idx < group.items.length; idx++) {
        const itm = group.items[idx];
        const line = this.prLineRepo.create({
          requisitionId: pr.id,
          lineNumber: idx + 1,
          itemId: itm.itemId,
          uomId: itm.uomId || '00000000-0000-0000-0000-000000000001',
          quantity: itm.suggestedPrPurchaseQty,
          estimatedUnitPrice: itm.estimatedUnitPrice,
          estimatedTotalPrice: itm.estimatedTotalPrice,
          requiredDate: deliveryDateStr,
          warehouseId: itm.warehouseId || null,
          supplierId: itm.preferredSupplierId || group.supplierId || null,
          justification: `Auto-Replenishment: Avail (${itm.currentAvailableStock}) < Safety Buffer (${itm.safetyStockBuffer}). 3-Mo Forecast: ${itm.threeMonthForecastQty}.`,
          notes: `Suggested PR Qty: (${itm.threeMonthForecastQty} + ${itm.safetyStockBuffer}) - ${itm.currentAvailableStock} = ${itm.suggestedPrPurchaseQty}`,
          status: 'OPEN',
          createdBy: options.userId || null,
          updatedBy: options.userId || null,
        });
        linesToInsert.push(line);
      }

      if (linesToInsert.length > 0) {
        await this.prLineRepo.save(linesToInsert);
      }

      const refreshedPr = await this.prRepo.findOne({
        where: { id: pr.id },
        relations: ['lines', 'lines.item', 'lines.uom', 'lines.warehouse', 'lines.supplier'],
      });
      if (refreshedPr) createdPrs.push(refreshedPr);
    }

    return {
      runReference,
      totalEvaluatedItems: targetItems.length,
      deficitItemsCount: deficitItems.length,
      createdRequisitionsCount: createdCount,
      updatedRequisitionsCount: updatedCount,
      requisitions: createdPrs,
      deficits: deficitItems,
    };
  }

  /**
   * Retrieves all System-Generated Pending PRs (DRAFT status with projectCode = 'AUTO_FORECAST')
   */
  async getPendingSystemRequisitions(companyId?: string): Promise<{
    data: PurchaseRequisition[];
    total: number;
    metrics: {
      totalPendingPrs: number;
      totalItemsInDeficit: number;
      totalEstimatedValue: number;
    };
  }> {
    const cId = companyId || (await this.getDefaultCompanyId());
    const prs = await this.prRepo.find({
      where: {
        companyId: cId,
        projectCode: 'AUTO_FORECAST',
        status: 'DRAFT',
      },
      relations: ['lines', 'lines.item', 'lines.uom', 'lines.warehouse', 'lines.supplier'],
      order: { createdAt: 'DESC' },
    });

    let totalItems = 0;
    let totalValue = 0;
    for (const pr of prs) {
      for (const line of pr.lines || []) {
        totalItems++;
        totalValue += Number(line.estimatedTotalPrice || 0);
      }
    }

    return {
      data: prs,
      total: prs.length,
      metrics: {
        totalPendingPrs: prs.length,
        totalItemsInDeficit: totalItems,
        totalEstimatedValue: Math.round(totalValue * 100) / 100,
      },
    };
  }

  /**
   * One-Click Approval & Direct PO Generation:
   * Approves the system-generated PR and automatically pushes it to the active Purchase Order (PO) ledger.
   * Supports adjusting quantities, overriding rates, and picking a supplier.
   */
  async approveAndPushToPo(
    requisitionId: string,
    overrides?: {
      supplierId?: string;
      notes?: string;
      lines?: Array<{ lineId: string; quantity?: number; estimatedUnitPrice?: number; supplierId?: string }>;
    },
    userId?: string,
  ): Promise<{ requisition: PurchaseRequisition; purchaseOrder: PurchaseOrder }> {
    const requisition = await this.prRepo.findOne({
      where: { id: requisitionId },
      relations: ['lines', 'lines.item', 'lines.uom', 'lines.warehouse', 'lines.supplier'],
    });

    if (!requisition) {
      throw new NotFoundException(`Purchase requisition with ID '${requisitionId}' not found.`);
    }

    if (requisition.status !== 'DRAFT' && requisition.status !== 'SUBMITTED') {
      throw new BadRequestException(`Requisition ${requisition.requisitionCode} is already ${requisition.status}.`);
    }

    // 1. Apply line overrides if provided
    if (overrides?.lines && overrides.lines.length > 0) {
      const lineMap = new Map(requisition.lines.map((l) => [l.id, l]));
      for (const ov of overrides.lines) {
        const line = lineMap.get(ov.lineId);
        if (line) {
          if (ov.quantity !== undefined && ov.quantity > 0) {
            line.quantity = ov.quantity;
          }
          if (ov.estimatedUnitPrice !== undefined && ov.estimatedUnitPrice >= 0) {
            line.estimatedUnitPrice = ov.estimatedUnitPrice;
          }
          line.estimatedTotalPrice = Math.round(line.quantity * (line.estimatedUnitPrice || 0) * 100) / 100;
          if (ov.supplierId) {
            line.supplierId = ov.supplierId;
          }
          await this.prLineRepo.save(line);
        }
      }
    }

    // 2. Resolve Supplier for PO
    let supplierId: string | null = overrides?.supplierId || requisition.lines[0]?.supplierId || null;
    if (!supplierId) {
      const firstSupplier = await this.supplierRepo.findOne({
        where: { companyId: requisition.companyId, status: 'ACTIVE' },
      });
      supplierId = firstSupplier?.id || null;
    }

    if (!supplierId) {
      throw new BadRequestException('A valid supplier must be selected to generate a Purchase Order.');
    }

    // 3. Mark PR as APPROVED & FULLY_CONVERTED
    requisition.status = 'FULLY_CONVERTED';
    requisition.approvedBy = userId || null;
    requisition.approvedAt = new Date();
    requisition.updatedBy = userId || null;
    await this.prRepo.save(requisition);

    // 4. Generate PO Code and create active Purchase Order
    const poCode = await this.generatePoCode(requisition.companyId);
    const todayStr = new Date().toISOString().split('T')[0];

    const po = this.poRepo.create({
      companyId: requisition.companyId,
      poCode,
      supplierId,
      requisitionId: requisition.id,
      warehouseId: requisition.lines[0]?.warehouseId || null,
      orderDate: todayStr,
      expectedDeliveryDate: requisition.requestedDeliveryDate || todayStr,
      paymentTerms: 'NET 30',
      status: 'APPROVED', // Pushed directly into active Purchase Order ledger
      notes: `Generated from Approved System PR ${requisition.requisitionCode} (3-Month Forecast Engine). ${overrides?.notes || ''}`.trim(),
      createdBy: userId || null,
      updatedBy: userId || null,
    });
    const savedPo = await this.poRepo.save(po);

    // 5. Create PO Lines matching the Requisition Lines
    let subtotal = 0;
    let lineIdx = 1;
    for (const prLine of requisition.lines) {
      const unitPrice = Number(prLine.estimatedUnitPrice || 0);
      const qty = Number(prLine.quantity || 1);
      const totalPrice = Math.round(qty * unitPrice * 100) / 100;
      subtotal += totalPrice;

      const poLine = this.poLineRepo.create({
        poId: savedPo.id,
        lineNumber: lineIdx++,
        itemId: prLine.itemId,
        uomId: prLine.uomId,
        quantity: qty,
        unitPrice,
        discountPercent: 0,
        totalPrice,
        receivedQuantity: 0,
        invoicedQuantity: 0,
        warehouseId: prLine.warehouseId || null,
        requiredDate: requisition.requestedDeliveryDate || todayStr,
        notes: prLine.justification || prLine.notes || null,
        createdBy: userId || null,
        updatedBy: userId || null,
      });
      await this.poLineRepo.save(poLine);
    }

    this.logger.log(
      `Approved System PR ${requisition.requisitionCode} and generated Active PO ${savedPo.poCode} (Total: ${subtotal} PKR)`,
    );

    const fullPo = await this.poRepo.findOne({
      where: { id: savedPo.id },
      relations: ['lines', 'lines.item', 'lines.uom', 'supplier', 'warehouse'],
    });

    return {
      requisition,
      purchaseOrder: fullPo || savedPo,
    };
  }

  private async getDefaultCompanyId(): Promise<string> {
    const row = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM companies WHERE status = 'ACTIVE' LIMIT 1`,
    );
    return row[0]?.id || '7725aa04-a270-4314-9e82-90949cbe7791';
  }
}
