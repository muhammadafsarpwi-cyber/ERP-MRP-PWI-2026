import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { StockAdjustmentLine } from './stock-adjustment-line.entity';
import { StockAdjustmentHistory } from './stock-adjustment-history.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';

@Entity('stock_adjustments')
export class StockAdjustment extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'warehouse_id', type: 'uuid' })
  warehouseId: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'adjustment_code', type: 'varchar', length: 50 })
  adjustmentCode: string;

  @Column({ name: 'adjustment_type', type: 'varchar', length: 20 })
  adjustmentType: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status: string; // 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'RETURNED' | 'REJECTED' | 'POSTED'

  // Submission
  @Column({ name: 'submitted_by', type: 'uuid', nullable: true })
  submittedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'submitted_by' })
  submittedByUser: ErpUser | null;

  @Column({ name: 'submitted_at', type: 'timestamp with time zone', nullable: true })
  submittedAt: Date | null;

  // Approval
  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedByUser: ErpUser | null;

  @Column({ name: 'approved_at', type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'approval_remarks', type: 'text', nullable: true })
  approvalRemarks: string | null;

  // Return
  @Column({ name: 'returned_by', type: 'uuid', nullable: true })
  returnedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'returned_by' })
  returnedByUser: ErpUser | null;

  @Column({ name: 'returned_at', type: 'timestamp with time zone', nullable: true })
  returnedAt: Date | null;

  @Column({ name: 'return_reason', type: 'text', nullable: true })
  returnReason: string | null;

  @Column({ name: 'return_remarks', type: 'text', nullable: true })
  returnRemarks: string | null;

  // Rejection
  @Column({ name: 'rejected_by', type: 'uuid', nullable: true })
  rejectedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'rejected_by' })
  rejectedByUser: ErpUser | null;

  @Column({ name: 'rejected_at', type: 'timestamp with time zone', nullable: true })
  rejectedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'rejection_remarks', type: 'text', nullable: true })
  rejectionRemarks: string | null;

  // Posting
  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'posted_by' })
  postedByUser: ErpUser | null;

  @Column({ name: 'posted_at', type: 'timestamp with time zone', nullable: true })
  postedAt: Date | null;

  // Creator reference
  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdByUser: ErpUser | null;

  @OneToMany(() => StockAdjustmentLine, (line) => line.adjustment)
  lines: StockAdjustmentLine[];

  @OneToMany(() => StockAdjustmentHistory, (h) => h.adjustment)
  history: StockAdjustmentHistory[];
}
