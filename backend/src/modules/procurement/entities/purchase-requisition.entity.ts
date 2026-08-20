import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { PurchaseRequisitionLine } from './purchase-requisition-line.entity';

@Entity('purchase_requisitions')
export class PurchaseRequisition extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'requisition_code', type: 'varchar', length: 50 })
  requisitionCode: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'request_type', type: 'varchar', length: 20, default: 'STANDARD' })
  requestType: string;

  @Column({ name: 'requested_delivery_date', type: 'date', nullable: true })
  requestedDeliveryDate: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  department: string | null;

  @Column({ name: 'project_code', type: 'varchar', length: 100, nullable: true })
  projectCode: string | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => PurchaseRequisitionLine, (line) => line.requisition)
  lines: PurchaseRequisitionLine[];
}
