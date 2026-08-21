import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from '../../item/entities/item.entity';
import { SalesOrderItem, SalesOrder } from '../../sales/entities';

export interface PlanningRow {
  productId: string;
  itemCode: string;
  productName: string;
  uomId: string | null;
  actualOnHand: number;
  reserved: number;
  available: number;
  openDemand: number;
  safetyStockLevel: number;
  reorderLevel: number;
  minimumStockLevel: number;
  productionRequired: number;
  projectedBalance: number;
}

const OPEN_DEMAND_ORDER_STATUSES = ['Confirmed', 'Processing'];

@Injectable()
export class ProductionPlanningService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(SalesOrderItem)
    private readonly salesOrderItemRepo: Repository<SalesOrderItem>,
  ) {}

  async getPlanning(companyId: string, filters?: {
    productId?: string;
    shortageOnly?: boolean;
  }): Promise<{ data: PlanningRow[]; total: number }> {
    const { productId, shortageOnly } = filters || {};

    const itemQb = this.itemRepo.createQueryBuilder('item')
      .where('item.companyId = :companyId', { companyId })
      .andWhere('item.status = :status', { status: 'ACTIVE' })
      .andWhere('item.isManufacturable = true');

    if (productId) itemQb.andWhere('item.id = :productId', { productId });

    const items = await itemQb.getMany();

    const demandRows = await this.salesOrderItemRepo
      .createQueryBuilder('soi')
      .leftJoin(SalesOrder, 'so', 'so.id = soi.salesOrderId')
      .select('soi.itemId', 'itemId')
      .addSelect('COALESCE(SUM(soi.quantity - soi.shippedQuantity), 0)::float8', 'openQty')
      .where('so.companyId = :companyId', { companyId })
      .andWhere('so.status IN (:...statuses)', { statuses: OPEN_DEMAND_ORDER_STATUSES })
      .groupBy('soi.itemId')
      .getRawMany();

    const balanceRows = await this.itemRepo.query(
      `SELECT item_id,
              COALESCE(SUM(on_hand), 0)::float8   AS on_hand,
              COALESCE(SUM(reserved), 0)::float8  AS reserved
       FROM inventory_balances
       WHERE company_id = $1
       GROUP BY item_id`,
      [companyId],
    );

    const demandMap = new Map<string, number>(demandRows.map((r: any) => [r.itemId, Number(r.openQty)]));
    const balanceMap = new Map<string, any>(balanceRows.map((r: any) => [r.item_id, r]));

    const rows: PlanningRow[] = [];
    for (const item of items) {
      const bal = balanceMap.get(item.id);
      const onHand = bal ? Number(bal.on_hand) : 0;
      const reserved = bal ? Number(bal.reserved) : 0;
      const available = onHand - reserved;
      const openDemand = demandMap.get(item.id) ?? 0;
      const safetyStock = Number(item.safetyStockLevel ?? 0);
      const productionRequired = Math.max(0, safetyStock + openDemand - available);
      const projectedBalance = available - openDemand;

      if (shortageOnly && productionRequired <= 0) continue;

      rows.push({
        productId: item.id,
        itemCode: item.itemCode,
        productName: item.name,
        uomId: item.baseUomId ?? null,
        actualOnHand: onHand,
        reserved,
        available,
        openDemand,
        safetyStockLevel: safetyStock,
        reorderLevel: Number(item.reorderLevel ?? 0),
        minimumStockLevel: Number(item.minimumStockLevel ?? 0),
        productionRequired,
        projectedBalance,
      });
    }

    return { data: rows, total: rows.length };
  }
}
