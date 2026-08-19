import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Item } from '../../item/entities/item.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { WarehouseLocation } from '../../organization/entities/warehouse-location.entity';

@Entity('inventory_policies')
export class InventoryPolicy extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'minimum_stock', type: 'decimal', precision: 15, scale: 4, default: 0 })
  minimumStock: number;

  @Column({ name: 'maximum_stock', type: 'decimal', precision: 15, scale: 4, default: 0 })
  maximumStock: number;

  @Column({ name: 'reorder_level', type: 'decimal', precision: 15, scale: 4, default: 0 })
  reorderLevel: number;

  @Column({ name: 'reorder_quantity', type: 'decimal', precision: 15, scale: 4, default: 0 })
  reorderQuantity: number;

  @Column({ name: 'safety_stock', type: 'decimal', precision: 15, scale: 4, default: 0 })
  safetyStock: number;

  @Column({ name: 'lead_time_days', type: 'integer', default: 0 })
  leadTimeDays: number;

  @Column({ name: 'preferred_location_id', type: 'uuid', nullable: true })
  preferredLocationId: string | null;

  @ManyToOne(() => WarehouseLocation, { nullable: true })
  @JoinColumn({ name: 'preferred_location_id' })
  preferredLocation: WarehouseLocation;

  @Column({ name: 'tracking_type', type: 'varchar', length: 10, default: 'NONE' })
  trackingType: string;

  @Column({ name: 'allow_negative_stock', type: 'boolean', default: false })
  allowNegativeStock: boolean;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}
