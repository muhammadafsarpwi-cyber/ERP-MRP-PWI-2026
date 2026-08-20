import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';

@Entity('purchase_order_lines')
export class PurchaseOrderLine extends BaseEntity {
  @Column({ name: 'po_id', type: 'uuid' })
  poId: string;

  @ManyToOne(() => PurchaseOrder, (po) => po.lines)
  @JoinColumn({ name: 'po_id' })
  po: PurchaseOrder;

  @Column({ name: 'line_number', type: 'integer' })
  lineNumber: number;

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

  @Column({ name: 'discount_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountPercent: number;

  @Column({ name: 'total_price', type: 'decimal', precision: 15, scale: 6, nullable: true })
  totalPrice: number | null;

  @Column({ name: 'received_quantity', type: 'decimal', precision: 15, scale: 4, default: 0 })
  receivedQuantity: number;

  @Column({ name: 'invoiced_quantity', type: 'decimal', precision: 15, scale: 4, default: 0 })
  invoicedQuantity: number;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId: string | null;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'required_date', type: 'date', nullable: true })
  requiredDate: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
