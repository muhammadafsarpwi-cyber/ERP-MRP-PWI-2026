import { Entity, Column, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Division } from '../../organization/entities/division.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { BillOfMaterials } from '../../bom/entities/bill-of-materials.entity';
import { ProductionRouting } from '../../production-routing/entities/production-routing.entity';
import { ProductionOrderOperation } from './production-order-operation.entity';

export enum ProductionOrderStatus {
  DRAFT = 'DRAFT',
  RELEASED = 'RELEASED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum ProductionOrderPriority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
  CRITICAL = 'CRITICAL',
}

export enum ProductionDemandSource {
  CUSTOMER_ORDER = 'CUSTOMER_ORDER',
  SAFETY_STOCK = 'SAFETY_STOCK',
  MANUAL = 'MANUAL',
}

@Entity('production_orders')
export class ProductionOrder extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Index({ unique: false })
  @Column({ name: 'order_number', type: 'varchar', length: 50 })
  orderNumber: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'product_id' })
  product: Item;

  @Column({ name: 'bom_id', type: 'uuid', nullable: true })
  bomId: string | null;

  @ManyToOne(() => BillOfMaterials)
  @JoinColumn({ name: 'bom_id' })
  bom: BillOfMaterials | null;

  @Column({ name: 'routing_id', type: 'uuid' })
  routingId: string;

  @ManyToOne(() => ProductionRouting)
  @JoinColumn({ name: 'routing_id' })
  routing: ProductionRouting;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @ManyToOne(() => Division)
  @JoinColumn({ name: 'division_id' })
  division: Division | null;

  @Column({ name: 'planned_quantity', type: 'decimal', precision: 19, scale: 4, default: 0 })
  plannedQuantity: number;

  @Column({ name: 'completed_quantity', type: 'decimal', precision: 19, scale: 4, default: 0 })
  completedQuantity: number;

  @Column({ name: 'scrapped_quantity', type: 'decimal', precision: 19, scale: 4, default: 0 })
  scrappedQuantity: number;

  @Column({ name: 'uom_id', type: 'uuid' })
  uomId: string;

  @ManyToOne(() => Uom)
  @JoinColumn({ name: 'uom_id' })
  uom: Uom;

  @Column({ name: 'raw_material_warehouse_id', type: 'uuid', nullable: true })
  rawMaterialWarehouseId: string | null;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'raw_material_warehouse_id' })
  rawMaterialWarehouse: Warehouse | null;

  @Column({ name: 'wip_warehouse_id', type: 'uuid', nullable: true })
  wipWarehouseId: string | null;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'wip_warehouse_id' })
  wipWarehouse: Warehouse | null;

  @Column({ name: 'finished_goods_warehouse_id', type: 'uuid', nullable: true })
  finishedGoodsWarehouseId: string | null;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'finished_goods_warehouse_id' })
  finishedGoodsWarehouse: Warehouse | null;

  @Column({ type: 'varchar', length: 20, default: ProductionOrderPriority.NORMAL })
  priority: ProductionOrderPriority;

  @Column({ type: 'varchar', length: 30, default: ProductionOrderStatus.DRAFT })
  status: ProductionOrderStatus;

  @Column({ name: 'demand_source', type: 'varchar', length: 30, default: ProductionDemandSource.MANUAL })
  demandSource: ProductionDemandSource;

  @Column({ name: 'sales_order_item_id', type: 'uuid', nullable: true })
  salesOrderItemId: string | null;

  @Column({ name: 'planned_start_date', type: 'timestamp with time zone', nullable: true })
  plannedStartDate: Date | null;

  @Column({ name: 'planned_end_date', type: 'timestamp with time zone', nullable: true })
  plannedEndDate: Date | null;

  @Column({ name: 'actual_start_date', type: 'timestamp with time zone', nullable: true })
  actualStartDate: Date | null;

  @Column({ name: 'actual_end_date', type: 'timestamp with time zone', nullable: true })
  actualEndDate: Date | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @OneToMany(() => ProductionOrderOperation, (op) => op.productionOrder)
  operations: ProductionOrderOperation[];
}
