import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { Department } from '../../organization/entities/department.entity';

export enum OperationStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/**
 * ERP-00047 — Operation Master
 *
 * Reusable manufacturing operation definitions (e.g. Flattening, Spiral,
 * PVC Extrusion) that production routing steps reference via operation_id.
 * Standard setup/run/queue/wait times act as defaults when a routing step
 * is created from a master operation; the step keeps its own time columns.
 */
@Entity('operations')
@Index(['companyId'])
export class Operation extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'operation_code', type: 'varchar', length: 50 })
  operationCode: string;

  @Column({ name: 'operation_name', type: 'varchar', length: 255 })
  operationName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'division_id', type: 'uuid', nullable: true })
  divisionId: string | null;

  @ManyToOne(() => Division, { nullable: true })
  @JoinColumn({ name: 'division_id' })
  division: Division | null;

  @Column({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId: string | null;

  @ManyToOne(() => Section, { nullable: true })
  @JoinColumn({ name: 'section_id' })
  section: Section | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @Column({ name: 'setup_time_minutes', type: 'decimal', precision: 19, scale: 4, default: 0 })
  setupTimeMinutes: number;

  @Column({ name: 'run_time_minutes', type: 'decimal', precision: 19, scale: 4, default: 0 })
  runTimeMinutes: number;

  @Column({ name: 'queue_time_minutes', type: 'decimal', precision: 19, scale: 4, default: 0 })
  queueTimeMinutes: number;

  @Column({ name: 'wait_time_minutes', type: 'decimal', precision: 19, scale: 4, default: 0 })
  waitTimeMinutes: number;

  @Column({ type: 'varchar', length: 20, default: OperationStatus.ACTIVE })
  status: OperationStatus;
}