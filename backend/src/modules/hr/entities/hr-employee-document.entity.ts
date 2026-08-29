import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { HrEmployee } from './hr-employee.entity';

@Entity('hr_employee_documents')
export class HrEmployeeDocument extends BaseEntity {
  @Column({ name: 'employee_id', type: 'uuid' })
  employeeId: string;

  @ManyToOne(() => HrEmployee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee: HrEmployee;

  @Column({ name: 'document_name', type: 'varchar', length: 255, nullable: true })
  documentName: string | null;

  @Column({ name: 'document_type', type: 'varchar', length: 50, nullable: true })
  documentType: string | null;

  @Column({ name: 'file_url', type: 'text', nullable: true })
  fileUrl: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}