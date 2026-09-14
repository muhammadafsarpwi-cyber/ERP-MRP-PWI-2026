import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { HrEmployee } from './hr-employee.entity';
import { HrAttendance } from './hr-attendance.entity';

/**
 * Attendance Regularizations (HR-07). One request per (company, employee,
 * attendance date). A request records the CURRENT attendance values it refers
 * to and the REQUESTED values. Only the APPROVED transition applies a
 * controlled correction to hr_attendance — always after snapshotting the
 * original row into hr_attendance_history.
 */
@Entity('hr_regularizations')
export class HrRegularization extends BaseEntity {
  @Column({ name: 'request_no', type: 'varchar', length: 24 })
  requestNo: string;

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

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: Date;

  @Column({ name: 'correction_type', type: 'varchar', length: 30 })
  correctionType: string;

  @Column({ type: 'varchar', length: 50 })
  reason: string;

  @Column({ name: 'current_check_in', type: 'timestamptz', nullable: true })
  currentCheckIn: Date | null;

  @Column({ name: 'current_check_out', type: 'timestamptz', nullable: true })
  currentCheckOut: Date | null;

  @Column({ name: 'current_status', type: 'varchar', length: 20, nullable: true })
  currentStatus: string | null;

  @Column({ name: 'requested_check_in', type: 'timestamptz', nullable: true })
  requestedCheckIn: Date | null;

  @Column({ name: 'requested_check_out', type: 'timestamptz', nullable: true })
  requestedCheckOut: Date | null;

  @Column({ name: 'requested_status', type: 'varchar', length: 20, nullable: true })
  requestedStatus: string | null;

  @Column({ name: 'approved_check_in', type: 'timestamptz', nullable: true })
  approvedCheckIn: Date | null;

  @Column({ name: 'approved_check_out', type: 'timestamptz', nullable: true })
  approvedCheckOut: Date | null;

  @Column({ name: 'approved_status', type: 'varchar', length: 20, nullable: true })
  approvedStatus: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'varchar', length: 20, default: 'SUBMITTED' })
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