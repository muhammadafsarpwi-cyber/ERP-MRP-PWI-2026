import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Supplier } from './supplier.entity';
import { PurchaseRequisition } from './purchase-requisition.entity';
import { RfqLine } from './rfq-line.entity';

@Entity('request_for_quotations')
export class RequestForQuotation extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'rfq_code', type: 'varchar', length: 50 })
  rfqCode: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'supplier_id', type: 'uuid' })
  supplierId: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  @Column({ name: 'requisition_id', type: 'uuid', nullable: true })
  requisitionId: string | null;

  @ManyToOne(() => PurchaseRequisition, { nullable: true })
  @JoinColumn({ name: 'requisition_id' })
  requisition: PurchaseRequisition;

  @Column({ name: 'issue_date', type: 'date', nullable: true })
  issueDate: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @Column({ name: 'evaluated_by', type: 'uuid', nullable: true })
  evaluatedBy: string | null;

  @Column({ name: 'evaluated_at', type: 'timestamp with time zone', nullable: true })
  evaluatedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => RfqLine, (line) => line.rfq)
  lines: RfqLine[];
}
