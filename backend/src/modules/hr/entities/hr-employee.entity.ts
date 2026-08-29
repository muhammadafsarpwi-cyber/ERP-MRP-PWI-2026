import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { HrDesignation } from './hr-designation.entity';

@Entity('hr_employees')
export class HrEmployee extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @Column({ name: 'employee_code', type: 'varchar', length: 50 })
  employeeCode: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({ name: 'designation_id', type: 'uuid', nullable: true })
  designationId: string | null;

  @ManyToOne(() => HrDesignation, { nullable: true })
  @JoinColumn({ name: 'designation_id' })
  designation: HrDesignation | null;

  @Column({ name: 'manager_id', type: 'uuid', nullable: true })
  managerId: string | null;

  @ManyToOne(() => HrEmployee, { nullable: true })
  @JoinColumn({ name: 'manager_id' })
  manager: HrEmployee | null;

  @Column({ name: 'employment_type', type: 'varchar', length: 30, default: 'FULL_TIME' })
  employmentType: string;

  @Column({ name: 'join_date', type: 'date', nullable: true })
  joinDate: Date | null;

  @Column({ name: 'termination_date', type: 'date', nullable: true })
  terminationDate: Date | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;

  @Column({ name: 'job_title', type: 'varchar', length: 255, nullable: true })
  jobTitle: string | null;

  @Column({ name: 'monthly_salary', type: 'numeric', precision: 19, scale: 4, nullable: true })
  monthlySalary: number | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;
}