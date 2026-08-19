import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Warehouse } from './warehouse.entity';

export enum WarehouseLocationStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

@Entity('warehouse_locations')
export class WarehouseLocation extends BaseEntity {
  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  @ManyToOne(() => Warehouse, (warehouse) => warehouse.locations)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'location_code', type: 'varchar', length: 50 })
  locationCode: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'parent_location_id', type: 'uuid', nullable: true })
  parentLocationId: string;

  @ManyToOne(() => WarehouseLocation, (location) => location.children, { nullable: true })
  @JoinColumn({ name: 'parent_location_id' })
  parentLocation: WarehouseLocation;

  @OneToMany(() => WarehouseLocation, (location) => location.parentLocation)
  children: WarehouseLocation[];

  @Column({ type: 'varchar', length: 20, default: WarehouseLocationStatus.ACTIVE })
  status: WarehouseLocationStatus;
}
