import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { HrEmployee } from './hr-employee.entity';
import { HrAttendance } from './hr-attendance.entity';
import { HrShift } from './hr-shift.entity';

/**
 * Overtime Approvals (HR-08). One request per (company, employee, overtime
 * date). The candidate overtime on the linked attendance is COMPUTED
 * (display-only) from the actual check-out vs the scheduled shift end — the
 * backend never auto-writes overtime to hr_attendance. Approved hours are
 * recorded only on this request, keeping payroll decisions explicit.
 */
@Entity('hr_overtime')
export class HrOvertime extends BaseEntity {
  @Column({ name: 'ref_no', type: 'varchar', length: 24 })
  refNo: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => HrEmployee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: HrEmployee;

  @Column({ name: 'attendance_id', type: 'uuid', nullable: true })
  attendanceId: string | null;

  @ManyToOne(() => HrAttendance, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'attendance_id' })
  attendance: HrAttendance | null;

  @Column({ name: 'overtime_date', type: 'date' })
  overtimeDate: Date;

  @Column({ name: 'shift_id', type: 'uuid', nullable: true })
  shiftId: string | null;

  @ManyToOne(() => HrShift, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'shift_id' })
  shift: HrShift | null;

  @Column({ name: 'requested_hours', type: 'numeric', precision: 6, scale: 2, default: 0 })
  requestedHours: string | number;

  @Column({ name: 'approved_hours', type: 'numeric', precision: 6, scale: 2, nullable: true })
  approvedHours: string | number | null;

  @Column({ type: 'varchar', length: 255 })
  reason: string;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ name: 'submitted_at', type: 'timestamptz', default: () => 'NOW()' })
  submittedAt: Date;

  @Column({ name: 'submitted_by', type: 'uuid', nullable: true })
  submittedBy: string | null;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'decision_remarks', type: 'text', nullable: true })
  decisionRemarks: string | null;
}