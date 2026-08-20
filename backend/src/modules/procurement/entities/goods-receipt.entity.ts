import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { Supplier } from './supplier.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { GoodsReceiptLine } from './goods-receipt-line.entity';

@Entity('goods_receipts')
export class GoodsReceipt extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'receipt_code', type: 'varchar', length: 50 })
  receiptCode: string;

  @Column({ name: 'po_id', type: 'uuid' })
  poId: string;

  @ManyToOne(() => PurchaseOrder)
  @JoinColumn({ name: 'po_id' })
  po: PurchaseOrder;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'receipt_date', type: 'timestamp with time zone', nullable: true })
  receiptDate: Date | null;

  @Column({ name: 'delivery_note_number', type: 'varchar', length: 100, nullable: true })
  deliveryNoteNumber: string | null;

  @Column({ name: 'grn_number', type: 'varchar', length: 100, nullable: true })
  grnNumber: string | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @Column({ name: 'inspected_by', type: 'uuid', nullable: true })
  inspectedBy: string | null;

  @Column({ name: 'inspected_at', type: 'timestamp with time zone', nullable: true })
  inspectedAt: Date | null;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy: string | null;

  @Column({ name: 'posted_at', type: 'timestamp with time zone', nullable: true })
  postedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => GoodsReceiptLine, (line) => line.receipt)
  lines: GoodsReceiptLine[];
}
