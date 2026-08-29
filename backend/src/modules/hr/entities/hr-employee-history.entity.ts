import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { HrEmployee } from './hr-employee.entity';

@Entity('hr_employee_histories')
export class HrEmployeeHistory extends BaseEntity {
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => HrEmployee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: HrEmployee;

  @Column({ name: 'change_type', type: 'varchar', length: 50 })
  changeType: string;

  @Column({ name: 'from_value', type: 'varchar', length: 255, nullable: true })
  fromValue: string | null;

  @Column({ name: 'to_value', type: 'varchar', length: 255, nullable: true })
  toValue: string | null;

  @Column({ name: 'change_date', type: 'date', nullable: true })
  changeDate: Date | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;
}