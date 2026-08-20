import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { GoodsReceipt } from './goods-receipt.entity';
import { PurchaseOrderLine } from './purchase-order-line.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { WarehouseLocation } from '../../organization/entities/warehouse-location.entity';
import { Batch } from '../../inventory/entities/batch.entity';

@Entity('goods_receipt_lines')
export class GoodsReceiptLine extends BaseEntity {
  @Column({ name: 'receipt_id', type: 'uuid' })
  receiptId: string;

  @ManyToOne(() => GoodsReceipt, (receipt) => receipt.lines)
  @JoinColumn({ name: 'receipt_id' })
  receipt: GoodsReceipt;

  @Column({ name: 'po_line_id', type: 'uuid' })
  poLineId: string;

  @ManyToOne(() => PurchaseOrderLine)
  @JoinColumn({ name: 'po_line_id' })
  poLine: PurchaseOrderLine;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @ManyToOne(() => Item)
  @JoinColumn({ name: 'item_id' })
  item: Item;

  @Column({ name: 'uom_id', type: 'uuid' })
  uomId: string;

  @ManyToOne(() => Uom)
  @JoinColumn({ name: 'uom_id' })
  uom: Uom;

  @Column({ name: 'quantity_ordered', type: 'decimal', precision: 15, scale: 4 })
  quantityOrdered: number;

  @Column({ name: 'quantity_received', type: 'decimal', precision: 15, scale: 4 })
  quantityReceived: number;

  @Column({ name: 'quantity_accepted', type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantityAccepted: number;

  @Column({ name: 'quantity_rejected', type: 'decimal', precision: 15, scale: 4, default: 0 })
  quantityRejected: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 6 })
  unitPrice: number;

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

  @Column({ name: 'condition_notes', type: 'text', nullable: true })
  conditionNotes: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
