import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { RequestForQuotation } from './request-for-quotation.entity';
import { Supplier } from './supplier.entity';

export type RfqSupplierStatus = 'PENDING' | 'QUOTED' | 'DECLINED';

@Entity('rfq_suppliers')
export class RfqSupplier extends BaseEntity {
  @Column({ name: 'rfq_id', type: 'uuid' })
  rfqId: string;

  @ManyToOne(() => RequestForQuotation, (rfq) => rfq.rfqSuppliers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rfq_id' })
  rfq: RequestForQuotation;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: RfqSupplierStatus;

  @Column({ name: 'sent_at', type: 'timestamp with time zone', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'quoted_at', type: 'timestamp with time zone', nullable: true })
  quotedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
