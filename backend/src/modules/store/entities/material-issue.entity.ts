import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { MaterialIssueLine } from './material-issue-line.entity';

@Entity('material_issues')
export class MaterialIssue {
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

  @Column({ name: 'issue_number', type: 'varchar', length: 50 })
  issueNumber!: string;

  @Column({ name: 'issue_date', type: 'date' })
  issueDate!: string;

  @Column({ name: 'store_id', type: 'uuid' })
  storeId!: string;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null;

  @Column({ name: 'issued_to_department_id', type: 'uuid', nullable: true })
  issuedToDepartmentId!: string | null;

  @Column({ name: 'issued_to_employee_id', type: 'uuid', nullable: true })
  issuedToEmployeeId!: string | null;

  @Column({ name: 'issued_by', type: 'uuid', nullable: true })
  issuedBy!: string | null;

  @Column({ type: 'text', nullable: true })
  purpose!: string | null;

  @Column({ name: 'reference_document', type: 'varchar', length: 200, nullable: true })
  referenceDocument!: string | null;

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

  @OneToMany(() => MaterialIssueLine, (line) => line.issue, { cascade: true })
  lines!: MaterialIssueLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;
}
