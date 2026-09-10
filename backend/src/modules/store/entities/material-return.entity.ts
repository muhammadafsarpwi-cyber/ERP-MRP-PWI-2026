import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { MaterialReturnLine } from './material-return-line.entity';

@Entity('material_returns')
export class MaterialReturn {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId!: string | null;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId!: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'return_number', type: 'varchar', length: 50 })
  returnNumber!: string;

  @Column({ name: 'return_date', type: 'date' })
  returnDate!: string;

  @Column({ name: 'store_id', type: 'uuid' })
  storeId!: string;

  @Column({ name: 'issue_id', type: 'uuid', nullable: true })
  issueId!: string | null;

  @Column({ name: 'from_department_id', type: 'uuid', nullable: true })
  fromDepartmentId!: string | null;

  @Column({ name: 'returned_by_employee_id', type: 'uuid', nullable: true })
  returnedByEmployeeId!: string | null;

  @Column({ name: 'condition_code', type: 'varchar', length: 50, default: 'GOOD' })
  conditionCode!: string;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @Column({ type: 'varchar', length: 30, default: 'DRAFT' })
  status!: string;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy!: string | null;

  @Column({ name: 'posted_at', type: 'timestamp with time zone', nullable: true })
  postedAt!: Date | null;

  @Column({ name: 'cancelled_by', type: 'uuid', nullable: true })
  cancelledBy!: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamp with time zone', nullable: true })
  cancelledAt!: Date | null;

  @OneToMany(() => MaterialReturnLine, (line) => line.materialReturn, { cascade: true })
  lines!: MaterialReturnLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;
}
