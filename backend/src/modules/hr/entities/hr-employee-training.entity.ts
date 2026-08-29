import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { HrEmployee } from './hr-employee.entity';

@Entity('hr_employee_training')
export class HrEmployeeTraining extends BaseEntity {
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => HrEmployee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: HrEmployee;

  @Column({ name: 'training_name', type: 'varchar', length: 255 })
  trainingName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider: string | null;

  @Column({ name: 'training_date', type: 'date', nullable: true })
  trainingDate: Date | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: Date | null;

  @Column({ name: 'certificate_url', type: 'text', nullable: true })
  certificateUrl: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}