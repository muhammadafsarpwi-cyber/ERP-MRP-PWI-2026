import { Entity, PrimaryGeneratedColumn, CreateDateColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { HrOvertime } from './hr-overtime.entity';

/**
 * Immutable transition ledger for overtime decisions (HR-08). Every state
 * change is recorded: created -> PENDING on submission, PENDING -> APPROVED,
 * PENDING -> REJECTED on decisions. Intentionally a bare ledger: no
 * updated_at/is_active — rows are immutable once written.
 */
@Entity('hr_overtime_history')
export class HrOvertimeHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'overtime_id', type: 'uuid' })
  overtimeId: string;

  @ManyToOne(() => HrOvertime, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'overtime_id' })
  overtime: HrOvertime;

  @Column({ name: 'from_status', type: 'varchar', length: 20, nullable: true })
  fromStatus: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 20 })
  toStatus: string;

  @Column({ name: 'requested_hours', type: 'numeric', precision: 6, scale: 2 })
  requestedHours: string | number;

  @Column({ name: 'approved_hours', type: 'numeric', precision: 6, scale: 2, nullable: true })
  approvedHours: string | number | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ name: 'changed_fields', type: 'text', array: true, default: () => 'ARRAY[]::text[]' })
  changedFields: string[];
}