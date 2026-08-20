import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { PurchaseRequisition } from './purchase-requisition.entity';
import { Item } from '../../item/entities/item.entity';
import { Uom } from '../../item/entities/uom.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { Supplier } from './supplier.entity';

@Entity('purchase_requisition_lines')
export class PurchaseRequisitionLine extends BaseEntity {
  @Column({ name: 'requisition_id', type: 'uuid' })
  requisitionId: string;

  @ManyToOne(() => PurchaseRequisition, (req) => req.lines)
  @JoinColumn({ name: 'requisition_id' })
  requisition: PurchaseRequisition;

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

  @Column({ name: 'estimated_unit_price', type: 'decimal', precision: 15, scale: 6, nullable: true })
  estimatedUnitPrice: number | null;

  @Column({ name: 'estimated_total_price', type: 'decimal', precision: 15, scale: 6, nullable: true })
  estimatedTotalPrice: number | null;

  @Column({ name: 'required_date', type: 'date', nullable: true })
  requiredDate: string | null;

  @Column({ name: 'warehouse_id', type: 'uuid', nullable: true })
  warehouseId: string | null;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId: string | null;

  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ type: 'text', nullable: true })
  justification: string | null;

  @Column({ name: 'converted_quantity', type: 'decimal', precision: 15, scale: 4, default: 0 })
  convertedQuantity: number;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
