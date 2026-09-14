import { Entity, PrimaryGeneratedColumn, CreateDateColumn, Column } from 'typeorm';

/**
 * Point-in-time audit trail for approved attendance corrections. The ORIGINAL
 * hr_attendance row is snapshotted here BEFORE any approved regularization is
 * applied, so a decision can always be reconstructed (and undone) with the
 * exact pre-correction values. Intentionally a bare ledger: no
 * updated_at/is_active — rows are immutable once written.
 */
@Entity('hr_attendance_history')
export class HrAttendanceHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'attendance_id', type: 'uuid' })
  attendanceId: string;

  @Column({ name: 'regularization_id', type: 'uuid', nullable: true })
  regularizationId: string | null;

  @Column({ type: 'varchar', length: 20 })
  operation: string;

  @Column({ type: 'jsonb' })
  snapshot: Record<string, unknown>;

  @Column({ name: 'changed_fields', type: 'text', array: true, default: () => 'ARRAY[]::text[]' })
  changedFields: string[];
}