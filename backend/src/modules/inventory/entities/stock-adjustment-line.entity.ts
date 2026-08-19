import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { StockAdjustment } from './stock-adjustment.entity';
import { Item } from '../../item/entities/item.entity';
import { WarehouseLocation } from '../../organization/entities/warehouse-location.entity';
import { Batch } from './batch.entity';
import { Uom } from '../../item/entities/uom.entity';

@Entity('stock_adjustment_lines')
export class StockAdjustmentLine extends BaseEntity {
  @Column({ name: 'adjustment_id', type: 'uuid' })
  adjustmentId: string;

  @ManyToOne(() => StockAdjustment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'adjustment_id' })
  adjustment: StockAdjustment;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId: string | null;

  @ManyToOne(() => WarehouseLocation, { nullable: true })
  @JoinColumn({ name: 'location_id' })
  location: WarehouseLocation;

  @Column({ name: 'batch_id', type: 'uuid', nullable: true })
  batchId: string | null;

  @ManyToOne(() => Batch, { nullable: true })
  @JoinColumn({ name: 'batch_id' })
  batch: Batch;

  @Column({ name: 'uom_id', type: 'uuid' })
  uomId: string;

  @ManyToOne(() => Uom)
  @JoinColumn({ name: 'uom_id' })
  uom: Uom;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantity: number;

  @Column({ name: 'unit_cost', type: 'decimal', precision: 15, scale: 6, nullable: true })
  unitCost: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
