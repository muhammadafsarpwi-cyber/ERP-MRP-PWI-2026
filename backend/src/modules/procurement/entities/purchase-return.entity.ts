import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { Supplier } from './supplier.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { PurchaseReturnLine } from './purchase-return-line.entity';

@Entity('purchase_returns')
export class PurchaseReturn extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'return_code', type: 'varchar', length: 50 })
  returnCode: string;

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

  @Column({ name: 'return_date', type: 'timestamp with time zone', nullable: true })
  returnDate: Date | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy: string | null;

  @Column({ name: 'posted_at', type: 'timestamp with time zone', nullable: true })
  postedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => PurchaseReturnLine, (line) => line.purchaseReturn)
  lines: PurchaseReturnLine[];
}
