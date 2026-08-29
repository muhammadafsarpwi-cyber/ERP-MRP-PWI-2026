import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { HrEmployee } from './hr-employee.entity';

@Entity('hr_employee_skills')
export class HrEmployeeSkill extends BaseEntity {
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => HrEmployee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: HrEmployee;

  @Column({ name: 'skill_name', type: 'varchar', length: 255 })
  skillName: string;

  @Column({ name: 'skill_level', type: 'varchar', length: 20, default: 'BEGINNER' })
  skillLevel: string;

  @Column({ name: 'years_experience', type: 'numeric', precision: 5, scale: 2, default: 0 })
  yearsExperience: number;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}