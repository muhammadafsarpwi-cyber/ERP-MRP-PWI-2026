import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';

export enum MachineStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  RETIRED = 'RETIRED',
}

export enum MachineCriticality {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

@Entity('machines')
@Index(['companyId'])
export class Machine extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

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

  /**
   * PROMPT-07-FIX canonical columns: machine_id (system-generated MCH###),
   * machine_name, machine_model and qr_code are the physical columns; the TS
   * property names below keep the established API contract stable
   * (name -> machine_name, model -> machine_model, qrPayload -> qr_code).
   */
  @Column({ name: 'machine_id', type: 'varchar', length: 50 })
  machineId: string;

  @Index({ unique: false })
  @Column({ name: 'machine_code', type: 'varchar', length: 100 })
  machineCode: string;

  @Column({ name: 'machine_number', type: 'varchar', length: 100, nullable: true })
  machineNumber: string | null;

  @Column({ name: 'machine_name', type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'machine_type', type: 'varchar', length: 100, nullable: true })
  machineType: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string | null;

  @Column({ name: 'machine_model', type: 'varchar', length: 255, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  manufacturer: string | null;

  @Column({ name: 'serial_number', type: 'varchar', length: 255, nullable: true })
  serialNumber: string | null;

  /** Canonical numeric capacity — physical column capacity DECIMAL(19,4) */
  @Column({ type: 'numeric', precision: 19, scale: 4, nullable: true })
  capacity: number | null;

  @Column({ name: 'power_rating', type: 'varchar', length: 100, nullable: true })
  powerRating: string | null;

  @Column({ name: 'installation_date', type: 'date', nullable: true })
  installationDate: string | null;

  @Column({ name: 'warranty_expiry_date', type: 'date', nullable: true })
  warrantyExpiryDate: string | null;

  @Column({
    name: 'criticality',
    type: 'varchar',
    length: 30,
    default: MachineCriticality.MEDIUM,
  })
  criticality: MachineCriticality;

  @Column({ name: 'status', type: 'varchar', length: 30, default: MachineStatus.ACTIVE })
  status: MachineStatus;

  @Column({ name: 'qr_code', type: 'varchar', length: 255, nullable: true })
  qrPayload: string | null;
}
