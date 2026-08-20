import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { PurchaseReturn } from './purchase-return.entity';
import { PurchaseOrderLine } from './purchase-order-line.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';

@Entity('purchase_return_lines')
export class PurchaseReturnLine extends BaseEntity {
  @Column({ name: 'return_id', type: 'uuid' })
  returnId: string;

  @ManyToOne(() => PurchaseReturn, (pr) => pr.lines)
  @JoinColumn({ name: 'return_id' })
  purchaseReturn: PurchaseReturn;

  @Column({ name: 'po_line_id', type: 'uuid', nullable: true })
  poLineId: string | null;

  @ManyToOne(() => PurchaseOrderLine, { nullable: true })
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

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 6 })
  unitPrice: number;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
