import { Injectable, NotFoundException, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item, ItemType } from '../../item/entities/item.entity';
import { InventoryBalance } from '../../inventory/entities/inventory-balance.entity';
import { InventoryPolicy } from '../../inventory/entities/inventory-policy.entity';
import { SalesOrderItem } from '../entities/sales-order-item.entity';
import { ProductionOrder, ProductionOrderStatus } from '../../production/entities/production-order.entity';
import { FinishedGoodsFilterDto } from '../dto/finished-goods-inventory.dto';
import {
  applyDivisionScopeFilter,
  isUnrestricted,
  toDivisionList,
  DivisionAccess,
} from '../../../common/division-scope.util';

export interface PackingHoldInfo {
  status: 'CLEAR' | 'POLYBAG_AWAITED' | 'BOX_AWAITED' | 'QUALITY_HOLD' | 'OTHER';
  reason?: string | null;
  holdQuantity?: number;
  polybagDetails?: string | null;
  customerName?: string | null;
  notes?: string | null;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface ComponentWipDetail {
  code: string;
  name: string;
  unplatedHeadingQty: number;
  platedReadyQty: number;
}

export interface SpokeComponentPipeline {
  innerSpoke: ComponentWipDetail;
  outerSpoke: ComponentWipDetail;
  nippleCode?: string;
  nippleName?: string;
  nippleAvailableStock?: number;
  readyPairsPcs: number;
  readyPairsGrs: number;
  packingHold?: PackingHoldInfo;
}

export const SPOKE_MAPPING: Record<string, { innerSpl: string; outerSpl: string; innerSpk: string; outerSpk: string; nipple: string }> = {
  'SPI-FG-SPK-001': { innerSpl: 'WIP-SPL-001', outerSpl: 'WIP-SPL-002', innerSpk: 'WIP-SPK-001', outerSpk: 'WIP-SPK-002', nipple: 'FG-NP-001' },
  'SPI-FG-SPK-002': { innerSpl: 'WIP-SPL-001', outerSpl: 'WIP-SPL-002', innerSpk: 'WIP-SPK-001', outerSpk: 'WIP-SPK-002', nipple: 'FG-NP-002' },
  'SPI-FG-SPK-003': { innerSpl: 'WIP-SPL-003', outerSpl: 'WIP-SPL-004', innerSpk: 'WIP-SPK-003', outerSpk: 'WIP-SPK-004', nipple: 'FG-NP-002' },
  'SPI-FG-SPK-004': { innerSpl: 'WIP-SPL-005', outerSpl: 'WIP-SPL-006', innerSpk: 'WIP-SPK-005', outerSpk: 'WIP-SPK-006', nipple: 'FG-NP-004' },
  'SPI-FG-SPK-005': { innerSpl: 'WIP-SPL-007', outerSpl: 'WIP-SPL-008', innerSpk: 'WIP-SPK-007', outerSpk: 'WIP-SPK-008', nipple: 'FG-NP-004' },
  'SPI-FG-SPK-006': { innerSpl: 'WIP-SPL-013', outerSpl: 'WIP-SPL-014', innerSpk: 'WIP-SPK-013', outerSpk: 'WIP-SPK-014', nipple: 'FG-NP-005' },
  'SPI-FG-SPK-007': { innerSpl: 'WIP-SPL-015', outerSpl: 'WIP-SPL-016', innerSpk: 'WIP-SPK-015', outerSpk: 'WIP-SPK-016', nipple: 'FG-NP-005' },
  'SPI-FG-SPK-008': { innerSpl: 'WIP-SPL-009', outerSpl: 'WIP-SPL-010', innerSpk: 'WIP-SPK-009', outerSpk: 'WIP-SPK-010', nipple: 'FG-NP-003' },
  'SPI-FG-SPK-009': { innerSpl: 'WIP-SPL-011', outerSpl: 'WIP-SPL-012', innerSpk: 'WIP-SPK-011', outerSpk: 'WIP-SPK-012', nipple: 'FG-NP-003' },
  'SPI-FG-SPK-010': { innerSpl: 'WIP-SPL-017', outerSpl: 'WIP-SPL-018', innerSpk: 'WIP-SPK-017', outerSpk: 'WIP-SPK-018', nipple: 'FG-NP-001' },
  'SPI-FG-SPK-011': { innerSpl: 'WIP-SPL-013', outerSpl: 'WIP-SPL-014', innerSpk: 'WIP-SPK-013', outerSpk: 'WIP-SPK-014', nipple: 'FG-NP-005' },
  'SPI-FG-SPK-012': { innerSpl: 'WIP-SPL-005', outerSpl: 'WIP-SPL-006', innerSpk: 'WIP-SPK-005', outerSpk: 'WIP-SPK-006', nipple: 'FG-NP-004' },
};

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
  socPackedQty?: number;
  directCommittedStock?: number;
  derivedSpokeDemand?: number;
  derivedDemandSources?: Array<{ spokeCode: string; qty: number }>;
  matchedNippleCode?: string;
  matchedNippleName?: string;
  componentPipeline?: SpokeComponentPipeline;
  packingHold?: PackingHoldInfo;
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
   * Helper to convert quantity between UOM codes for an item.
   * Standard conversion: 1 GRS = 144 PCS.
   */
  private convertQty(qty: number, fromCode?: string, toCode?: string): number {
    const n = Number(qty || 0);
    if (!n || !fromCode || !toCode) return n;
    const from = fromCode.toUpperCase().trim();
    const to = toCode.toUpperCase().trim();
    if (from === to) return n;
    if ((from === 'PCS' || from === 'PC') && to === 'GRS') {
      return Math.round((n / 144) * 10000) / 10000;
    }
    if (from === 'GRS' && (to === 'PCS' || to === 'PC')) {
      return Math.round(n * 144);
    }
    return n;
  }

  /**
   * Retrieves comprehensive, company-scoped finished goods inventory intelligence.
   * Calculates physical stock, reservations from open sales orders, safety stock levels,
   * active production quantities, and accurate shortage projections item-wise & division-wise.
   */
  async getFinishedGoodsInventory(
    dto: FinishedGoodsFilterDto,
    companyId: string,
    allowedDivisionIds?: DivisionAccess,
  ): Promise<FinishedGoodsInventoryResponse> {
    const page = dto.page || 1;
    const limit = dto.limit || 50;

    // 1. Query Finished Goods items with organizational relations
    const qb = this.itemRepo
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.division', 'division')
      .leftJoinAndSelect('item.section', 'section')
      .leftJoinAndSelect('item.baseUom', 'uom')
      .leftJoinAndSelect('item.salesUom', 'salesUom')
      .where('item.companyId = :companyId', { companyId })
      .andWhere('(item.itemType = :fgType OR item.itemType = :fgTypeLower)', {
        fgType: ItemType.FINISHED_GOOD,
        fgTypeLower: 'finished_good',
      });

    // PROMPT #27 — server-authoritative division scope.
    //
    // The `dto.divisionId` filter below is client-supplied and can only ever
    // narrow further; `DivisionScopeGuard` has already refused it with 403 when
    // it names a division the caller does not hold. This clause is what makes
    // the response safe when the client omits `divisionId` entirely.
    //
    // `includeUnassigned: true` because this is MASTER data: an Item that is not
    // assigned to a division belongs to no division, so it cannot disclose
    // another division's stock. Excluding it would silently hide shared
    // catalogue rows from every restricted user.
    applyDivisionScopeFilter(
      qb as any,
      'item.divisionId',
      allowedDivisionIds,
      'allowedDivisionIds',
      { includeUnassigned: true },
    );

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

    qb.orderBy('item.itemCode', 'ASC');

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
    // Avoid double/triple counting: when an unbatched master row (batch_id IS NULL) exists
    // for an item, it represents the full physical stock. Batched child rows exist alongside
    // it for batch-level traceability.
    const rawBalances = await this.balanceRepo
      .createQueryBuilder('b')
      .select('b.itemId', 'itemId')
      .addSelect(
        `CASE 
          WHEN COUNT(CASE WHEN b.batch_id IS NULL THEN 1 END) > 0 
          THEN SUM(CASE WHEN b.batch_id IS NULL THEN b.on_hand ELSE 0 END)
          ELSE SUM(b.on_hand)
        END`,
        'totalOnHand',
      )
      .where('b.companyId = :companyId', { companyId })
      .andWhere('b.itemId IN (:...itemIds)', { itemIds })
      .andWhere('b.status = :activeStatus', { activeStatus: 'ACTIVE' })
      .groupBy('b.itemId')
      .getRawMany();

    const physicalMap = new Map<string, number>();
    rawBalances.forEach((r) => {
      physicalMap.set(r.itemId, Number(r.totalOnHand || 0));
    });

    // 3. Aggregate Open Sales Order Commitments (accounting for multi-SOC confirmed Delivery Notes)
    const dnShippedRows: Array<{
      item_id: string;
      quantity: string | number;
      description: string | null;
      header_soc: string | null;
    }> = await this.soItemRepo.manager.query(
      `SELECT sdl.item_id, sdl.quantity, sdl.description, so.order_number AS header_soc
       FROM erp_sales.sales_delivery_lines sdl
       JOIN erp_sales.sales_deliveries sd ON sd.id = sdl.delivery_id
       LEFT JOIN erp_sales.sales_orders so ON so.id = sd.sales_order_id
       WHERE sd.deleted_at IS NULL
         AND UPPER(sd.status) IN ('CONFIRMED', 'DELIVERED', 'SHIPPED')
         AND sdl.item_id = ANY($1)`,
      [itemIds],
    );
    const dnDeliveredMap = new Map<string, number>();
    for (const r of dnShippedRows) {
      const socMatch = r.description?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
      const soc = (socMatch ? socMatch[1] : r.header_soc || '').trim();
      if (!soc) continue;
      const key = `${soc}_${r.item_id}`;
      dnDeliveredMap.set(key, (dnDeliveredMap.get(key) || 0) + Number(r.quantity || 0));
    }

    const rawOpenSoItems: Array<{
      item_id: string;
      quantity: string | number;
      shipped_quantity: string | number;
      order_number: string | null;
    }> = await this.soItemRepo.manager.query(
      `SELECT soi.item_id, soi.quantity, COALESCE(soi.shipped_quantity, 0) AS shipped_quantity,
              so.order_number
       FROM erp_sales.sales_order_items soi
       JOIN erp_sales.sales_orders so ON so.id = soi.sales_order_id
       WHERE so.company_id = $1
         AND so.deleted_at IS NULL
         AND soi.item_id = ANY($2)
         AND UPPER(so.status) NOT IN ('DELIVERED', 'CLOSED', 'CANCELLED')
         AND UPPER(COALESCE(soi.status, '')) != 'DELIVERED'`,
      [companyId, itemIds],
    );

    const commitmentMap = new Map<string, number>();
    for (const r of rawOpenSoItems) {
      const soc = (r.order_number || '').trim();
      const orderQty = Number(r.quantity || 0);
      const shippedAttr = Number(r.shipped_quantity || 0);
      const shippedDn = soc ? dnDeliveredMap.get(`${soc}_${r.item_id}`) || 0 : 0;
      const openQty = Math.max(0, orderQty - Math.max(shippedAttr, shippedDn));
      if (openQty > 0) {
        commitmentMap.set(r.item_id, (commitmentMap.get(r.item_id) || 0) + openQty);
      }
    }

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

    // 5.5 Derived Kit Demand: Spoke Assembly Kits require matching Nipples
    const nippleItems = allFilteredItems.filter((i) => i.itemCode?.startsWith('FG-NP'));
    const spokeItems = allFilteredItems.filter((i) => i.itemCode?.startsWith('SPI-FG-SPK'));

    const spokeToNippleMap = new Map<string, typeof allFilteredItems[0]>();
    for (const spk of spokeItems) {
      if (spk.name?.includes('_')) {
        const parts = spk.name.split('_').filter(Boolean);
        const nipPart = parts[parts.length - 1].trim().toLowerCase().replace(/\s+/g, '');
        const matchedNip = nippleItems.find((np) => {
          const npClean = np.name.toLowerCase().replace(/\s+/g, '');
          return (
            npClean.includes(nipPart) ||
            nipPart.includes(npClean.replace('nipple', '')) ||
            (nipPart.includes('225x17') && np.itemCode === 'FG-NP-001') ||
            (nipPart.includes('cd-250x17') && np.itemCode === 'FG-NP-002') ||
            (nipPart.includes('125-300x17') && np.itemCode === 'FG-NP-003') ||
            (nipPart.includes('rm-250*17') && np.itemCode === 'FG-NP-004') ||
            (nipPart.includes('125-s9') && np.itemCode === 'FG-NP-005')
          );
        });
        if (matchedNip) {
          spokeToNippleMap.set(spk.id, matchedNip);
        }
      }
    }

    const nippleDerivedDemandMap = new Map<string, { total: number; sources: Array<{ spokeCode: string; qty: number }> }>();
    for (const spk of spokeItems) {
      const nip = spokeToNippleMap.get(spk.id);
      if (nip) {
        const spkCommitment = commitmentMap.get(spk.id) || 0;
        if (spkCommitment > 0) {
          const current = nippleDerivedDemandMap.get(nip.id) || { total: 0, sources: [] };
          current.total += spkCommitment;
          current.sources.push({ spokeCode: spk.itemCode, qty: spkCommitment });
          nippleDerivedDemandMap.set(nip.id, current);
        }
      }
    }

    // 5.6 Fetch Component WIP & Packing Holds for Spokes
    const wipRows: Array<{ item_code: string; name: string; on_hand: string | number }> =
      await this.balanceRepo.manager.query(
        `SELECT i.item_code, i.name,
           SUM(CASE WHEN b.batch_id IS NULL THEN b.on_hand ELSE 0 END) as on_hand
         FROM inventory_balances b
         JOIN items i ON i.id = b.item_id
         WHERE b.company_id = $1 AND i.item_code LIKE 'WIP-SP%' AND b.status = 'ACTIVE'
         GROUP BY i.item_code, i.name`,
        [companyId],
      );

    const wipBalanceMap = new Map<string, { code: string; name: string; qty: number }>();
    for (const r of wipRows) {
      wipBalanceMap.set(r.item_code, {
        code: r.item_code,
        name: r.name,
        qty: Math.max(0, Number(r.on_hand || 0)),
      });
    }

    const holdRows: Array<any> = await this.balanceRepo.manager.query(
      `SELECT * FROM item_packing_stage_holds WHERE company_id = $1`,
      [companyId],
    );
    const holdMap = new Map<string, PackingHoldInfo>();
    for (const h of holdRows) {
      holdMap.set(h.item_id, {
        status: h.hold_status,
        reason: h.hold_reason,
        holdQuantity: Number(h.hold_quantity || 0),
        polybagDetails: h.polybag_details,
        customerName: h.customer_name,
        notes: h.notes,
        updatedBy: h.updated_by,
        updatedAt: h.updated_at ? new Date(h.updated_at).toISOString() : null,
      });
    }

    // 6. Compute item availability metrics
    const computedItems: FinishedGoodsItemAvailability[] = allFilteredItems.map((item) => {
      const basePhysical = physicalMap.get(item.id) || 0;
      const physicalStock = this.convertQty(basePhysical, item.baseUom?.code, item.salesUom?.code || item.baseUom?.code);
      const directCommitted = commitmentMap.get(item.id) || 0;
      const derivedDemand = nippleDerivedDemandMap.get(item.id);
      const derivedQty = derivedDemand ? derivedDemand.total : 0;
      const committedStock = directCommitted + derivedQty;
      const matchedNip = spokeToNippleMap.get(item.id);
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

      // Build Spoke Component Pipeline if this is a Spoke item
      let componentPipeline: SpokeComponentPipeline | undefined;
      const spokeMapConfig = SPOKE_MAPPING[item.itemCode];
      if (spokeMapConfig) {
        const innerSpl = wipBalanceMap.get(spokeMapConfig.innerSpl);
        const outerSpl = wipBalanceMap.get(spokeMapConfig.outerSpl);
        const innerSpk = wipBalanceMap.get(spokeMapConfig.innerSpk);
        const outerSpk = wipBalanceMap.get(spokeMapConfig.outerSpk);

        const innerPlatedQty = innerSpl?.qty || 0;
        const outerPlatedQty = outerSpl?.qty || 0;
        const readyPairs = Math.max(0, Math.min(innerPlatedQty, outerPlatedQty));
        const readyPairsGrs = Number((readyPairs / 72).toFixed(2));

        componentPipeline = {
          innerSpoke: {
            code: spokeMapConfig.innerSpl,
            name: innerSpl?.name || spokeMapConfig.innerSpl,
            unplatedHeadingQty: innerSpk?.qty || 0,
            platedReadyQty: innerPlatedQty,
          },
          outerSpoke: {
            code: spokeMapConfig.outerSpl,
            name: outerSpl?.name || spokeMapConfig.outerSpl,
            unplatedHeadingQty: outerSpk?.qty || 0,
            platedReadyQty: outerPlatedQty,
          },
          nippleCode: spokeMapConfig.nipple,
          nippleName: matchedNip?.name,
          nippleAvailableStock: matchedNip ? physicalMap.get(matchedNip.id) : undefined,
          readyPairsPcs: readyPairs,
          readyPairsGrs,
          packingHold: holdMap.get(item.id),
        };
      }

      const uomCode = item.salesUom?.code || item.baseUom?.code || 'PCS';
      const uomName = item.salesUom?.name || item.baseUom?.name || uomCode;

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
        directCommittedStock: directCommitted,
        derivedSpokeDemand: derivedQty,
        derivedDemandSources: derivedDemand ? derivedDemand.sources : undefined,
        matchedNippleCode: matchedNip ? matchedNip.itemCode : undefined,
        matchedNippleName: matchedNip ? matchedNip.name : undefined,
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
        componentPipeline,
        packingHold: holdMap.get(item.id),
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

    // Alphanumeric code sorting: Spokes 001-012 first in natural order, then Nipples 001-005 in natural order
    filteredList.sort((a, b) => {
      const isSpkA = a.itemCode?.startsWith('SPI-FG-SPK');
      const isSpkB = b.itemCode?.startsWith('SPI-FG-SPK');
      if (isSpkA && !isSpkB) return -1;
      if (!isSpkA && isSpkB) return 1;

      const isNpA = a.itemCode?.startsWith('FG-NP');
      const isNpB = b.itemCode?.startsWith('FG-NP');
      if (isNpA && !isNpB) return -1;
      if (!isNpA && isNpB) return 1;

      return a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true, sensitivity: 'base' });
    });

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
    allowedDivisionIds?: DivisionAccess,
    customerId?: string,
    orderId?: string,
    context?: string,
    socNo?: string,
  ): Promise<FinishedGoodsItemAvailability> {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, companyId },
      relations: ['division', 'section', 'baseUom', 'salesUom'],
    });

    if (!item) {
      throw new NotFoundException(`Finished Goods item with ID '${itemId}' not found in current company`);
    }

    // PROMPT #27 — TEST E. A guessed item UUID from another division must not
    // resolve, and this endpoint returns live stock / reservation figures.
    // A NULL `divisionId` passes because an unassigned Item belongs to no
    // division (the same `includeUnassigned` rule as the list above), so the
    // check is "is this item attributed to a division I may not read?".
    if (item.divisionId && allowedDivisionIds && !isUnrestricted(allowedDivisionIds)) {
      const ids = toDivisionList(allowedDivisionIds);
      if (!ids.includes(item.divisionId)) {
        throw new ForbiddenException('You do not have access to this division.');
      }
    }

    const baseUomCode = item.baseUom?.code || 'PCS';
    const salesUomCode = item.salesUom?.code || baseUomCode;
    const uomCode = salesUomCode;
    const uomName = item.salesUom?.name || item.baseUom?.name || uomCode;

    // Physical stock from inventory_balances (stored in base UOM, e.g. PCS)
    // Avoid double/triple counting batched child rows when master unbatched row exists
    const rawBalance = await this.balanceRepo
      .createQueryBuilder('b')
      .select(
        `CASE 
          WHEN COUNT(CASE WHEN b.batch_id IS NULL THEN 1 END) > 0 
          THEN SUM(CASE WHEN b.batch_id IS NULL THEN b.on_hand ELSE 0 END)
          ELSE SUM(b.on_hand)
        END`,
        'totalOnHand',
      )
      .where('b.companyId = :companyId', { companyId })
      .andWhere('b.itemId = :itemId', { itemId })
      .andWhere('b.status = :activeStatus', { activeStatus: 'ACTIVE' })
      .getRawOne();
    const rawOnHandBase = Number(rawBalance?.totalOnHand || 0);

    // Convert raw physical stock to Sales UOM (e.g. 72000 PCS / 144 = 500 GRS)
    let physicalStock = this.convertQty(rawOnHandBase, baseUomCode, salesUomCode);

    // In delivery context, physical stock is the actual warehouse stock available for dispatch.
    // Do not deduct historical packing entries from other customers (which may have already shipped).
    let socPackedQty = 0;
    if (socNo) {
      try {
        const cleanSoc = String(socNo).trim();
        const socRows = await this.itemRepo.manager.query(
          `SELECT SUM(pei.actual_quantity) as total_pcs
           FROM production_entry_items pei
           JOIN production_entries pe ON pe.id = pei.production_entry_id
           WHERE pei.item_id = $1 AND pe.remarks ILIKE $2 AND pe.is_active = true`,
          [itemId, `%${cleanSoc}%`],
        );
        const socPcs = Number(socRows?.[0]?.total_pcs || 0);
        socPackedQty = this.convertQty(socPcs, baseUomCode, salesUomCode);
      } catch (err: any) {
        this.logger.warn(`Failed to query socPackedQty: ${err.message}`);
      }
    }

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

    // ── Delivery Note Context (Fulfilling an Order / Dispatch) ──
    if (context === 'delivery') {
      const deliveryQty = Math.max(0, Number(orderQuantity || 0));
      const shortage = deliveryQty > physicalStock ? deliveryQty - physicalStock : 0;
      const remainingAfterDelivery = physicalStock - deliveryQty;
      const isReady = shortage === 0;

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
        committedStock: 0,
        availableStock: physicalStock,
        safetyStock,
        aboveSafetyStock: Math.max(0, physicalStock - safetyStock),
        openSalesOrderQty: deliveryQty,
        newOrderQty: deliveryQty,
        netAvailableAfterOrders: Math.max(0, remainingAfterDelivery),
        projectedBalance: remainingAfterDelivery,
        shortageQty: shortage,
        orderShortageQty: shortage,
        productionRequirementQty: 0,
        excessQty: 0,
        onProductionQty,
        socPackedQty,
        status: isReady ? 'AVAILABLE' : 'SHORT',
        statusLabel: isReady ? `Ready for Delivery (${deliveryQty} ${uomCode})` : `Short by ${shortage} ${uomCode}`,
        canFulfillImmediate: isReady,
        productionRequired: shortage > 0,
      };
    }

    // Existing commitments from other open sales orders (excluding current order being edited)
    const dnShippedSingle: Array<{
      quantity: string | number;
      description: string | null;
      header_soc: string | null;
    }> = await this.soItemRepo.manager.query(
      `SELECT sdl.quantity, sdl.description, so.order_number AS header_soc
       FROM erp_sales.sales_delivery_lines sdl
       JOIN erp_sales.sales_deliveries sd ON sd.id = sdl.delivery_id
       LEFT JOIN erp_sales.sales_orders so ON so.id = sd.sales_order_id
       WHERE sd.deleted_at IS NULL
         AND UPPER(sd.status) IN ('CONFIRMED', 'DELIVERED', 'SHIPPED')
         AND sdl.item_id = $1`,
      [itemId],
    );
    const dnSingleBySoc = new Map<string, number>();
    for (const r of dnShippedSingle) {
      const socMatch = r.description?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
      const soc = (socMatch ? socMatch[1] : r.header_soc || '').trim();
      if (!soc) continue;
      dnSingleBySoc.set(soc, (dnSingleBySoc.get(soc) || 0) + Number(r.quantity || 0));
    }

    const openSoSingle: Array<{
      so_id: string;
      order_number: string | null;
      quantity: string | number;
      shipped_quantity: string | number;
    }> = await this.soItemRepo.manager.query(
      `SELECT so.id AS so_id, so.order_number, soi.quantity, COALESCE(soi.shipped_quantity, 0) AS shipped_quantity
       FROM erp_sales.sales_order_items soi
       JOIN erp_sales.sales_orders so ON so.id = soi.sales_order_id
       WHERE so.company_id = $1
         AND so.deleted_at IS NULL
         AND soi.item_id = $2
         AND UPPER(so.status) NOT IN ('DELIVERED', 'CLOSED', 'CANCELLED')
         AND UPPER(COALESCE(soi.status, '')) != 'DELIVERED'`,
      [companyId, itemId],
    );

    let committedStock = 0;
    for (const r of openSoSingle) {
      if (orderId && r.so_id === orderId) continue;
      const soc = (r.order_number || '').trim();
      const orderQty = Number(r.quantity || 0);
      const shippedAttr = Number(r.shipped_quantity || 0);
      const shippedDn = soc ? dnSingleBySoc.get(soc) || 0 : 0;
      committedStock += Math.max(0, orderQty - Math.max(shippedAttr, shippedDn));
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

  /**
   * Updates or clears a packing stage hold (e.g. Waiting for Customer Polybag).
   */
  async updatePackingHold(
    itemId: string,
    dto: {
      holdStatus?: string;
      holdReason?: string;
      holdQuantity?: number;
      polybagDetails?: string;
      customerName?: string;
      notes?: string;
    },
    companyId: string,
    updatedBy: string,
  ): Promise<PackingHoldInfo> {
    const holdStatus = dto.holdStatus || 'CLEAR';
    const holdReason = dto.holdReason || null;
    const holdQuantity = Number(dto.holdQuantity || 0);
    const polybagDetails = dto.polybagDetails || null;
    const customerName = dto.customerName || null;
    const notes = dto.notes || null;

    await this.balanceRepo.manager.query(
      `INSERT INTO item_packing_stage_holds (company_id, item_id, hold_status, hold_reason, hold_quantity, polybag_details, customer_name, notes, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (company_id, item_id)
       DO UPDATE SET
         hold_status = EXCLUDED.hold_status,
         hold_reason = EXCLUDED.hold_reason,
         hold_quantity = EXCLUDED.hold_quantity,
         polybag_details = EXCLUDED.polybag_details,
         customer_name = EXCLUDED.customer_name,
         notes = EXCLUDED.notes,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()`,
      [companyId, itemId, holdStatus, holdReason, holdQuantity, polybagDetails, customerName, notes, updatedBy],
    );

    return {
      status: holdStatus as any,
      reason: holdReason,
      holdQuantity,
      polybagDetails,
      customerName,
      notes,
      updatedBy,
      updatedAt: new Date().toISOString(),
    };
  }

}
