import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { HrEmployee } from './hr-employee.entity';

@Entity('hr_attendance')
export class HrAttendance extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => HrEmployee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: HrEmployee;

  @Column({ name: 'attendance_date', type: 'date' })
  attendanceDate: Date;

  @Column({ name: 'shift_id', type: 'uuid', nullable: true })
  shiftId: string | null;

  @Column({ name: 'check_in', type: 'timestamptz', nullable: true })
  checkIn: Date | null;

  @Column({ name: 'check_out', type: 'timestamptz', nullable: true })
  checkOut: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'PRESENT' })
  status: string;

  @Column({ name: 'overtime_minutes', type: 'int', default: 0 })
  overtimeMinutes: number;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}