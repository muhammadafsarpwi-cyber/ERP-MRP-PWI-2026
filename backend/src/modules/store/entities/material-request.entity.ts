import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { MaterialRequestLine } from './material-request-line.entity';

@Entity('material_requests')
export class MaterialRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId!: string | null;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId!: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'request_number', type: 'varchar', length: 50 })
  requestNumber!: string;

  @Column({ name: 'request_date', type: 'date' })
  requestDate!: string;

  @Column({ name: 'required_date', type: 'date', nullable: true })
  requiredDate!: string | null;

  @Column({ name: 'store_id', type: 'uuid' })
  storeId!: string;

  @Column({ name: 'requesting_employee_id', type: 'uuid', nullable: true })
  requestingEmployeeId!: string | null;

  @Column({ name: 'production_order_id', type: 'uuid', nullable: true })
  productionOrderId!: string | null;

  @Column({ name: 'job_card_id', type: 'uuid', nullable: true })
  jobCardId!: string | null;

  @Column({ type: 'text', nullable: true })
  purpose!: string | null;

  @Column({ name: 'reference_document', type: 'varchar', length: 200, nullable: true })
  referenceDocument!: string | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'NORMAL' })
  priority!: string;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status!: string;

  @Column({ name: 'submitted_by', type: 'uuid', nullable: true })
  submittedBy!: string | null;

  @Column({ name: 'submitted_at', type: 'timestamp with time zone', nullable: true })
  submittedAt!: Date | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: 'timestamp with time zone', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'rejected_by', type: 'uuid', nullable: true })
  rejectedBy!: string | null;

  @Column({ name: 'rejected_at', type: 'timestamp with time zone', nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy!: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamp with time zone', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'gm_approved_by', type: 'uuid', nullable: true })
  gmApprovedBy!: string | null;

  @Column({ name: 'gm_approved_at', type: 'timestamp with time zone', nullable: true })
  gmApprovedAt!: Date | null;

  @Column({ name: 'procurement_acknowledged_by', type: 'uuid', nullable: true })
  procurementAcknowledgedBy!: string | null;

  @Column({ name: 'procurement_acknowledged_at', type: 'timestamp with time zone', nullable: true })
  procurementAcknowledgedAt!: Date | null;

  @Column({ name: 'pr_id', type: 'uuid', nullable: true })
  prId!: string | null;

  @Column({ name: 'pr_number', type: 'varchar', length: 50, nullable: true })
  prNumber!: string | null;

  @Column({ name: 'converted_at', type: 'timestamp with time zone', nullable: true })
  convertedAt!: Date | null;

  @Column({ name: 'converted_by', type: 'uuid', nullable: true })
  convertedBy!: string | null;

  @Column({ name: 'po_id', type: 'uuid', nullable: true })
  poId!: string | null;

  @Column({ name: 'po_number', type: 'varchar', length: 50, nullable: true })
  poNumber!: string | null;

  @Column({ name: 'supplier_id', type: 'uuid', nullable: true })
  supplierId!: string | null;

  @Column({ name: 'expected_delivery_date', type: 'date', nullable: true })
  expectedDeliveryDate!: string | null;

  @Column({ name: 'actual_delivery_date', type: 'date', nullable: true })
  actualDeliveryDate!: string | null;

  @Column({ name: 'supplier_confirmed_date', type: 'date', nullable: true })
  supplierConfirmedDate!: string | null;

  @Column({ name: 'eta_pending', type: 'boolean', default: true })
  etaPending!: boolean;

  @OneToMany(() => MaterialRequestLine, (line) => line.request, { cascade: true })
  lines!: MaterialRequestLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;
}
