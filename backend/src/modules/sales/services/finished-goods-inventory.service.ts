import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item, ItemType } from '../../item/entities/item.entity';
import { InventoryBalance } from '../../inventory/entities/inventory-balance.entity';
import { InventoryPolicy } from '../../inventory/entities/inventory-policy.entity';
import { SalesOrderItem } from '../entities/sales-order-item.entity';
import { ProductionOrder, ProductionOrderStatus } from '../../production/entities/production-order.entity';
import { FinishedGoodsFilterDto } from '../dto/finished-goods-inventory.dto';

export interface FinishedGoodsItemAvailability {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  divisionId: string | null;
  divisionCode: string | null;
  divisionName: string | null;
  sectionId: string | null;
  sectionCode: string | null;
  sectionName: string | null;
  uomId: string;
  uomCode: string;
  uomName: string;
  physicalStock: number;
  committedStock: number;
  availableStock: number;
  safetyStock: number;
  aboveSafetyStock: number;
  openSalesOrderQty: number;
  newOrderQty: number;
  netAvailableAfterOrders: number;
  projectedBalance: number;
  shortageQty: number;
  orderShortageQty: number;
  productionRequirementQty: number;
  excessQty: number;
  onProductionQty: number;
  status: 'AVAILABLE' | 'LOW_STOCK' | 'BELOW_SAFETY_STOCK' | 'SHORT' | 'EXCESS' | 'ON_PRODUCTION';
  statusLabel: string;
  canFulfillImmediate: boolean;
  productionRequired: boolean;
}

export interface UomQuantityBreakdown {
  uomCode: string;
  uomName: string;
  totalPhysicalStock: number;
  totalCommittedStock: number;
  totalAvailableStock: number;
  totalSafetyStock: number;
  totalShortageQty: number;
  totalOrderShortageQty: number;
  totalProductionRequirementQty: number;
  totalOnProductionQty: number;
  itemCount: number;
}

export interface FinishedGoodsInventoryResponse {
  summary: {
    totalItems: number;
    itemsWithSufficientStock: number;
    itemsBelowSafetyStock: number;
    itemsShort: number;
    itemsWithExcessStock: number;
    itemsOnProduction: number;
    totalOpenSalesOrdersCount: number;
    totalProductionRequirementItems: number;
    uomBreakdowns: Record<string, UomQuantityBreakdown>;
  };
  data: FinishedGoodsItemAvailability[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class FinishedGoodsInventoryService {
  private readonly logger = new Logger(FinishedGoodsInventoryService.name);

  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(InventoryBalance)
    private readonly balanceRepo: Repository<InventoryBalance>,
    @InjectRepository(InventoryPolicy)
    private readonly policyRepo: Repository<InventoryPolicy>,
    @InjectRepository(SalesOrderItem)
    private readonly soItemRepo: Repository<SalesOrderItem>,
    @InjectRepository(ProductionOrder)
    private readonly poRepo: Repository<ProductionOrder>,
  ) {}

  /**
   * Retrieves comprehensive, company-scoped finished goods inventory intelligence.
   * Calculates physical stock, reservations from open sales orders, safety stock levels,
   * active production quantities, and accurate shortage projections item-wise & division-wise.
   */
  async getFinishedGoodsInventory(
    dto: FinishedGoodsFilterDto,
    companyId: string,
  ): Promise<FinishedGoodsInventoryResponse> {
    const page = dto.page || 1;
    const limit = dto.limit || 50;

    // 1. Query Finished Goods items with organizational relations
    const qb = this.itemRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.division', 'division')
      .leftJoinAndSelect('item.section', 'section')
      .leftJoinAndSelect('item.baseUom', 'uom')
      .where('item.companyId = :companyId', { companyId })
      .andWhere('(item.itemType = :fgType OR item.itemType = :fgTypeLower)', {
        fgType: ItemType.FINISHED_GOOD,
        fgTypeLower: 'finished_good',
      });

    if (dto.divisionId) {
      qb.andWhere('item.divisionId = :divisionId', { divisionId: dto.divisionId });
    }

    if (dto.sectionId) {
      qb.andWhere('item.sectionId = :sectionId', { sectionId: dto.sectionId });
    }

    if (dto.uomId) {
      qb.andWhere('item.baseUomId = :uomId', { uomId: dto.uomId });
    }

    if (dto.search && dto.search.trim()) {
      const term = `%${dto.search.trim()}%`;
      qb.andWhere('(item.itemCode ILIKE :term OR item.name ILIKE :term)', { term });
    }

    qb.orderBy('item.name', 'ASC');

    // Fetch all matching items for this query (to calculate correct UOM breakdowns across the filtered subset)
    const allFilteredItems = await qb.getMany();
    if (allFilteredItems.length === 0) {
      return {
        summary: {
          totalItems: 0,
          itemsWithSufficientStock: 0,
          itemsBelowSafetyStock: 0,
          itemsShort: 0,
          itemsWithExcessStock: 0,
          itemsOnProduction: 0,
          totalOpenSalesOrdersCount: 0,
          totalProductionRequirementItems: 0,
          uomBreakdowns: {},
        },
        data: [],
        total: 0,
        page,
        limit,
      };
    }

    const itemIds = allFilteredItems.map((i) => i.id);

    // 2. Aggregate Physical Stock from inventory_balances in ONE query
    const rawBalances = await this.balanceRepo
      .createQueryBuilder('b')
      .select('b.itemId', 'itemId')
      .addSelect('SUM(b.onHand)', 'totalOnHand')
      .where('b.companyId = :companyId', { companyId })
      .andWhere('b.itemId IN (:...itemIds)', { itemIds })
      .andWhere('b.status = :activeStatus', { activeStatus: 'ACTIVE' })
      .groupBy('b.itemId')
      .getRawMany();

    const physicalMap = new Map<string, number>();
    rawBalances.forEach((r) => {
      physicalMap.set(r.itemId, Number(r.totalOnHand || 0));
    });

    // 3. Aggregate Open Sales Order Commitments in ONE query
    // Open orders: Draft, Confirmed, Processing
    const rawCommitments = await this.soItemRepo
      .createQueryBuilder('soi')
      .innerJoin('soi.order', 'so')
      .select('soi.itemId', 'itemId')
      .addSelect('SUM(GREATEST(0, soi.quantity - COALESCE(soi.shippedQuantity, 0)))', 'openQty')
      .where('so.companyId = :companyId', { companyId })
      .andWhere('soi.itemId IN (:...itemIds)', { itemIds })
      .andWhere('so.status IN (:...openStatuses)', {
        openStatuses: ['Draft', 'Confirmed', 'Processing', 'DRAFT', 'CONFIRMED', 'PROCESSING'],
      })
      .groupBy('soi.itemId')
      .getRawMany();

    const commitmentMap = new Map<string, number>();
    rawCommitments.forEach((r) => {
      commitmentMap.set(r.itemId, Number(r.openQty || 0));
    });

    // 4. Aggregate Active Production Orders in ONE query
    const rawProduction = await this.poRepo
      .createQueryBuilder('po')
      .select('po.productId', 'productId')
      .addSelect('SUM(GREATEST(0, po.plannedQuantity - COALESCE(po.completedQuantity, 0)))', 'onProdQty')
      .where('po.companyId = :companyId', { companyId })
      .andWhere('po.productId IN (:...itemIds)', { itemIds })
      .andWhere('po.status IN (:...activePoStatuses)', {
        activePoStatuses: [
          ProductionOrderStatus.DRAFT,
          ProductionOrderStatus.RELEASED,
          ProductionOrderStatus.IN_PROGRESS,
        ],
      })
      .groupBy('po.productId')
      .getRawMany();

    const productionMap = new Map<string, number>();
    rawProduction.forEach((r) => {
      productionMap.set(r.productId, Number(r.onProdQty || 0));
    });

    // 5. Aggregate Inventory Policies (Safety Stock fallback)
    const rawPolicies = await this.policyRepo
      .createQueryBuilder('p')
      .select('p.itemId', 'itemId')
      .addSelect('MAX(p.safetyStock)', 'policySafety')
      .where('p.companyId = :companyId', { companyId })
      .andWhere('p.itemId IN (:...itemIds)', { itemIds })
      .groupBy('p.itemId')
      .getRawMany();

    const policySafetyMap = new Map<string, number>();
    rawPolicies.forEach((r) => {
      policySafetyMap.set(r.itemId, Number(r.policySafety || 0));
    });

    // 6. Compute item availability metrics
    const computedItems: FinishedGoodsItemAvailability[] = allFilteredItems.map((item) => {
      const physicalStock = physicalMap.get(item.id) || 0;
      const committedStock = commitmentMap.get(item.id) || 0;
      const onProductionQty = productionMap.get(item.id) || 0;

      // Determine safety stock: item.safetyStockLevel has priority, then inventory policy
      const safetyStock =
        item.safetyStockLevel !== null && item.safetyStockLevel !== undefined
          ? Number(item.safetyStockLevel)
          : policySafetyMap.get(item.id) || 0;

      const availableStock = Math.max(0, physicalStock - committedStock);
      const aboveSafetyStock = Math.max(0, availableStock - safetyStock);
      const projectedBalance = physicalStock - committedStock;
      const shortageQty = committedStock > physicalStock ? committedStock - physicalStock : 0;
      const orderShortageQty = shortageQty;
      const netAvailableAfterOrders = Math.max(0, projectedBalance);
      const excessQty = safetyStock > 0 && availableStock > safetyStock * 3 ? availableStock - safetyStock * 3 : 0;

      // Production requirement: to fulfill existing order shortage AND restore safety buffer
      let productionRequirementQty = 0;
      if (shortageQty > 0) {
        productionRequirementQty = shortageQty + safetyStock;
      } else if (availableStock < safetyStock) {
        productionRequirementQty = safetyStock - availableStock;
      }

      // Determine status according to business requirements
      let status: FinishedGoodsItemAvailability['status'] = 'AVAILABLE';
      let statusLabel = 'Available';

      if (shortageQty > 0 || (availableStock === 0 && committedStock > 0)) {
        status = 'SHORT';
        statusLabel = `Short by ${shortageQty > 0 ? shortageQty : committedStock} ${item.baseUom?.code || 'Units'}`;
      } else if (availableStock < safetyStock) {
        status = 'BELOW_SAFETY_STOCK';
        statusLabel = 'Below Safety Stock';
      } else if (availableStock === 0 && onProductionQty > 0) {
        status = 'ON_PRODUCTION';
        statusLabel = 'In Production';
      } else if (safetyStock > 0 && availableStock < safetyStock * 1.25) {
        status = 'LOW_STOCK';
        statusLabel = 'Low Stock';
      } else if (safetyStock > 0 && availableStock > safetyStock * 3) {
        status = 'EXCESS';
        statusLabel = 'Excess Stock';
      } else {
        status = 'AVAILABLE';
        statusLabel = 'Healthy Stock';
      }

      const uomCode = item.baseUom?.code || 'PCS';
      const uomName = item.baseUom?.name || uomCode;

      return {
        itemId: item.id,
        itemCode: item.itemCode,
        itemName: item.name,
        itemType: item.itemType,
        divisionId: item.divisionId,
        divisionCode: item.division?.divisionCode || null,
        divisionName: item.division?.name || null,
        sectionId: item.sectionId,
        sectionCode: item.section?.sectionCode || null,
        sectionName: item.section?.name || null,
        uomId: item.baseUomId,
        uomCode,
        uomName,
        physicalStock,
        committedStock,
        availableStock,
        safetyStock,
        aboveSafetyStock,
        openSalesOrderQty: committedStock,
        newOrderQty: 0,
        netAvailableAfterOrders,
        projectedBalance,
        shortageQty,
        orderShortageQty,
        productionRequirementQty,
        excessQty,
        onProductionQty,
        status,
        statusLabel,
        canFulfillImmediate: availableStock > 0 && shortageQty === 0,
        productionRequired: shortageQty > 0 || availableStock < safetyStock,
      };
    });

    // 7. Apply Post-computation Filters (status or onlyShortages)
    let filteredList = computedItems;
    if (dto.onlyShortages) {
      filteredList = filteredList.filter((it) => it.shortageQty > 0 || it.status === 'SHORT');
    }
    if (dto.status && dto.status !== 'ALL') {
      filteredList = filteredList.filter((it) => it.status === dto.status);
    }

    // 8. Calculate KPI Summary & UOM-Aware Breakdowns
    let itemsWithSufficientStock = 0;
    let itemsBelowSafetyStock = 0;
    let itemsShort = 0;
    let itemsWithExcessStock = 0;
    let itemsOnProduction = 0;
    let totalOpenOrdersCount = 0;
    let totalProductionRequirementItems = 0;

    const uomBreakdowns: Record<string, UomQuantityBreakdown> = {};

    computedItems.forEach((it) => {
      if (it.status === 'AVAILABLE' || it.status === 'EXCESS') itemsWithSufficientStock++;
      if (it.status === 'BELOW_SAFETY_STOCK') itemsBelowSafetyStock++;
      if (it.status === 'SHORT') itemsShort++;
      if (it.status === 'EXCESS') itemsWithExcessStock++;
      if (it.onProductionQty > 0) itemsOnProduction++;
      if (it.openSalesOrderQty > 0) totalOpenOrdersCount++;
      if (it.productionRequired || it.productionRequirementQty > 0) totalProductionRequirementItems++;

      // Populate UOM breakdown
      const uKey = it.uomCode;
      if (!uomBreakdowns[uKey]) {
        uomBreakdowns[uKey] = {
          uomCode: it.uomCode,
          uomName: it.uomName,
          totalPhysicalStock: 0,
          totalCommittedStock: 0,
          totalAvailableStock: 0,
          totalSafetyStock: 0,
          totalShortageQty: 0,
          totalOrderShortageQty: 0,
          totalProductionRequirementQty: 0,
          totalOnProductionQty: 0,
          itemCount: 0,
        };
      }
      uomBreakdowns[uKey].totalPhysicalStock += it.physicalStock;
      uomBreakdowns[uKey].totalCommittedStock += it.committedStock;
      uomBreakdowns[uKey].totalAvailableStock += it.availableStock;
      uomBreakdowns[uKey].totalSafetyStock += it.safetyStock;
      uomBreakdowns[uKey].totalShortageQty += it.shortageQty;
      uomBreakdowns[uKey].totalOrderShortageQty += it.orderShortageQty;
      uomBreakdowns[uKey].totalProductionRequirementQty += it.productionRequirementQty;
      uomBreakdowns[uKey].totalOnProductionQty += it.onProductionQty;
      uomBreakdowns[uKey].itemCount += 1;
    });

    // 9. Pagination
    const totalCount = filteredList.length;
    const startIndex = (page - 1) * limit;
    const paginatedItems = filteredList.slice(startIndex, startIndex + limit);

    return {
      summary: {
        totalItems: computedItems.length,
        itemsWithSufficientStock,
        itemsBelowSafetyStock,
        itemsShort,
        itemsWithExcessStock,
        itemsOnProduction,
        totalOpenSalesOrdersCount: totalOpenOrdersCount,
        totalProductionRequirementItems,
        uomBreakdowns,
      },
      data: paginatedItems,
      total: totalCount,
      page,
      limit,
    };
  }

  /**
   * Real-time live inventory availability lookup for a single item when creating
   * or updating a Sales Order line item.
   * Evaluates orderQuantity against physical stock, safety stock, and existing commitments.
   */
  async getItemAvailability(
    itemId: string,
    orderQuantity: number = 0,
    companyId: string,
  ): Promise<FinishedGoodsItemAvailability> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, companyId },
      relations: ['division', 'section', 'baseUom'],
    });

    if (!item) {
      throw new NotFoundException(`Finished Goods item with ID '${itemId}' not found in current company`);
    }

    // Physical stock
    const rawBalance = await this.balanceRepo
      .createQueryBuilder('b')
      .select('SUM(b.onHand)', 'totalOnHand')
      .where('b.companyId = :companyId', { companyId })
      .andWhere('b.itemId = :itemId', { itemId })
      .andWhere('b.status = :activeStatus', { activeStatus: 'ACTIVE' })
      .getRawOne();
    const physicalStock = Number(rawBalance?.totalOnHand || 0);

    // Existing commitments from other open sales orders
    const rawCommitment = await this.soItemRepo
      .createQueryBuilder('soi')
      .innerJoin('soi.order', 'so')
      .select('SUM(GREATEST(0, soi.quantity - COALESCE(soi.shippedQuantity, 0)))', 'openQty')
      .where('so.companyId = :companyId', { companyId })
      .andWhere('soi.itemId = :itemId', { itemId })
      .andWhere('so.status IN (:...openStatuses)', {
        openStatuses: ['Draft', 'Confirmed', 'Processing', 'DRAFT', 'CONFIRMED', 'PROCESSING'],
      })
      .getRawOne();
    const committedStock = Number(rawCommitment?.openQty || 0);

    // Active production
    const rawProduction = await this.poRepo
      .createQueryBuilder('po')
      .select('SUM(GREATEST(0, po.plannedQuantity - COALESCE(po.completedQuantity, 0)))', 'onProdQty')
      .where('po.companyId = :companyId', { companyId })
      .andWhere('po.productId = :itemId', { itemId })
      .andWhere('po.status IN (:...activePoStatuses)', {
        activePoStatuses: [
          ProductionOrderStatus.DRAFT,
          ProductionOrderStatus.RELEASED,
          ProductionOrderStatus.IN_PROGRESS,
        ],
      })
      .getRawOne();
    const onProductionQty = Number(rawProduction?.onProdQty || 0);

    // Safety stock
    let safetyStock = item.safetyStockLevel !== null && item.safetyStockLevel !== undefined
      ? Number(item.safetyStockLevel)
      : 0;
    if (safetyStock === 0) {
      const rawPolicy = await this.policyRepo
        .createQueryBuilder('p')
        .select('MAX(p.safetyStock)', 'policySafety')
        .where('p.companyId = :companyId', { companyId })
        .andWhere('p.itemId = :itemId', { itemId })
        .getRawOne();
      safetyStock = Number(rawPolicy?.policySafety || 0);
    }

    const availableStock = Math.max(0, physicalStock - committedStock);
    const aboveSafetyStock = Math.max(0, availableStock - safetyStock);
    const newOrderQty = Math.max(0, Number(orderQuantity || 0));

    // Projected balance considering existing commitments + new order quantity
    const projectedBalance = physicalStock - committedStock - newOrderQty;
    const totalDemand = committedStock + newOrderQty;
    const shortageQty = totalDemand > physicalStock ? totalDemand - physicalStock : 0;
    const orderShortageQty = shortageQty;
    const netAvailableAfterOrders = Math.max(0, projectedBalance);
    const excessQty = safetyStock > 0 && projectedBalance > safetyStock * 3 ? projectedBalance - safetyStock * 3 : 0;

    // Production requirement calculation (fulfilling shortage + restoring safety buffer)
    let productionRequirementQty = 0;
    if (shortageQty > 0) {
      productionRequirementQty = shortageQty + safetyStock;
    } else if (projectedBalance < safetyStock && safetyStock > 0) {
      productionRequirementQty = safetyStock - projectedBalance;
    }

    const uomCode = item.baseUom?.code || 'PCS';
    const uomName = item.baseUom?.name || uomCode;

    let status: FinishedGoodsItemAvailability['status'] = 'AVAILABLE';
    let statusLabel = 'Available';

    if (shortageQty > 0) {
      status = 'SHORT';
      statusLabel = `Short by ${shortageQty} ${uomCode}`;
    } else if (projectedBalance < safetyStock && safetyStock > 0) {
      status = 'BELOW_SAFETY_STOCK';
      statusLabel = `Below Safety (${projectedBalance} / ${safetyStock} ${uomCode})`;
    } else if (availableStock === 0 && onProductionQty > 0) {
      status = 'ON_PRODUCTION';
      statusLabel = 'In Production';
    } else if (safetyStock > 0 && projectedBalance < safetyStock * 1.25) {
      status = 'LOW_STOCK';
      statusLabel = 'Low Stock';
    } else if (safetyStock > 0 && projectedBalance > safetyStock * 3) {
      status = 'EXCESS';
      statusLabel = 'Excess Stock';
    } else {
      status = 'AVAILABLE';
      statusLabel = 'Sufficient Stock';
    }

    return {
      itemId: item.id,
      itemCode: item.itemCode,
      itemName: item.name,
      itemType: item.itemType,
      divisionId: item.divisionId,
      divisionCode: item.division?.divisionCode || null,
      divisionName: item.division?.name || null,
      sectionId: item.sectionId,
      sectionCode: item.section?.sectionCode || null,
      sectionName: item.section?.name || null,
      uomId: item.baseUomId,
      uomCode,
      uomName,
      physicalStock,
      committedStock,
      availableStock,
      safetyStock,
      aboveSafetyStock,
      openSalesOrderQty: committedStock,
      newOrderQty,
      netAvailableAfterOrders,
      projectedBalance,
      shortageQty,
      orderShortageQty,
      productionRequirementQty,
      excessQty,
      onProductionQty,
      status,
      statusLabel,
      canFulfillImmediate: availableStock >= newOrderQty && shortageQty === 0,
      productionRequired: shortageQty > 0 || (safetyStock > 0 && projectedBalance < safetyStock),
    };
  }
}
