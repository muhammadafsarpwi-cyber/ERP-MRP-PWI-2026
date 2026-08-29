import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { HrEmployee } from './hr-employee.entity';

@Entity('hr_leave_requests')
export class HrLeaveRequest extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => HrEmployee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: HrEmployee;

  @Column({ name: 'leave_type_id', type: 'uuid' })
  leaveTypeId: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  days: number | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}