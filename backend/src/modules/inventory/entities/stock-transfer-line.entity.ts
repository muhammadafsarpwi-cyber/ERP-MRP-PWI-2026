import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { StockTransfer } from './stock-transfer.entity';
import { Item } from '../../item/entities/item.entity';
import { WarehouseLocation } from '../../organization/entities/warehouse-location.entity';
import { Batch } from './batch.entity';
import { Uom } from '../../item/entities/uom.entity';

@Entity('stock_transfer_lines')
export class StockTransferLine extends BaseEntity {
  @Column({ name: 'transfer_id', type: 'uuid' })
  transferId: string;

  @ManyToOne(() => StockTransfer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transfer_id' })
  transfer: StockTransfer;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'from_location_id', type: 'uuid', nullable: true })
  fromLocationId: string | null;

  @ManyToOne(() => WarehouseLocation, { nullable: true })
  @JoinColumn({ name: 'from_location_id' })
  fromLocation: WarehouseLocation;

  @Column({ name: 'to_location_id', type: 'uuid', nullable: true })
  toLocationId: string | null;

  @ManyToOne(() => WarehouseLocation, { nullable: true })
  @JoinColumn({ name: 'to_location_id' })
  toLocation: WarehouseLocation;

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

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
