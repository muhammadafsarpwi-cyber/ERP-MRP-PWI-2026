import { Entity, PrimaryGeneratedColumn, CreateDateColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { HrAdvance } from './hr-advance.entity';

/**
 * Immutable transition + money ledger for employee advances (HR-09). Every
 * state change is recorded (CREATED -> PENDING, decisions, disbursements,
 * recoveries). `amount` carries the money delta for DISBURSEMENT/RECOVERY
 * events (null otherwise) and requested/approved/disbursed/recovered_amount
 * are event-time snapshots so the ledger stays self-contained. Intentionally a
 * bare ledger: no updated_at/is_active — rows are immutable once written.
 */
@Entity('hr_advance_history')
export class HrAdvanceHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'advance_id', type: 'uuid' })
  advanceId: string;

  @ManyToOne(() => HrAdvance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'advance_id' })
  advance: HrAdvance;

  @Column({ name: 'event_type', type: 'varchar', length: 30 })
  eventType: string;

  @Column({ name: 'from_status', type: 'varchar', length: 20, nullable: true })
  fromStatus: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 20 })
  toStatus: string;

  @Column({ type: 'numeric', precision: 19, scale: 4, nullable: true })
  amount: string | number | null;

  @Column({ name: 'requested_amount', type: 'numeric', precision: 19, scale: 4, nullable: true })
  requestedAmount: string | number | null;

  @Column({ name: 'approved_amount', type: 'numeric', precision: 19, scale: 4, nullable: true })
  approvedAmount: string | number | null;

  @Column({ name: 'disbursed_amount', type: 'numeric', precision: 19, scale: 4, nullable: true })
  disbursedAmount: string | number | null;

  @Column({ name: 'recovered_amount', type: 'numeric', precision: 19, scale: 4, nullable: true })
  recoveredAmount: string | number | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'changed_fields', type: 'text', array: true, default: () => 'ARRAY[]::text[]' })
  changedFields: string[];
}