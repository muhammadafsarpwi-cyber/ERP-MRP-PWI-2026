import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Machine } from '../../production/entities/machine.entity';
import { Department } from '../../organization/entities/department.entity';
import { Division } from '../../organization/entities/division.entity';
import { Section } from '../../organization/entities/section.entity';
import { MaintenanceComplaintCategory } from './maintenance-complaint-category.entity';
import { MaintenanceRootCauseCategory } from './maintenance-root-cause-category.entity';
import { MaintenanceFailureCategory } from './maintenance-failure-category.entity';
import { MaintenanceJobCardTechnician } from './maintenance-job-card-technician.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { JobCardStatus, MaintenancePriority, MaintenanceType } from '../enums';

@Entity('maintenance_job_cards')
@Index(['companyId'])
@Index(['machineId'])
@Index(['currentStatus'])
@Index(['priority'])
@Index(['requestedAt'])
@Index(['assignedDepartmentId'])
export class MaintenanceJobCard extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'division_id', type: 'uuid' })
  divisionId: string;

  @ManyToOne(() => Division)
  @JoinColumn({ name: 'division_id' })
  division: Division;

  @Column({ name: 'section_id', type: 'uuid' })
  sectionId: string;

  @ManyToOne(() => Section)
  @JoinColumn({ name: 'section_id' })
  section: Section;

  @Column({ name: 'job_card_no', type: 'varchar', length: 30, unique: true })
  jobCardNo: string;

  @Column({ name: 'machine_id', type: 'uuid' })
  machineId: string;

  @ManyToOne(() => Machine)
  @JoinColumn({ name: 'machine_id' })
  machine: Machine;

  @Column({ name: 'assigned_department_id', type: 'uuid', nullable: true })
  assignedDepartmentId: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'assigned_department_id' })
  assignedDepartment: Department | null;

  @Column({ name: 'complaint_category_id', type: 'uuid', nullable: true })
  complaintCategoryId: string | null;

  @ManyToOne(() => MaintenanceComplaintCategory, { nullable: true })
  @JoinColumn({ name: 'complaint_category_id' })
  complaintCategory: MaintenanceComplaintCategory | null;

  @Column({ name: 'complaint', type: 'text' })
  complaint: string;

  @Column({ name: 'priority', type: 'varchar', length: 20, default: MaintenancePriority.MEDIUM })
  priority: MaintenancePriority;

  @Column({ name: 'maintenance_type', type: 'varchar', length: 30, default: MaintenanceType.BREAKDOWN })
  maintenanceType: MaintenanceType;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'requested_by' })
  requestedByUser: ErpUser | null;

  @Column({ name: 'requested_at', type: 'timestamp with time zone', default: () => 'NOW()' })
  requestedAt: Date;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'diagnosis', type: 'text', nullable: true })
  diagnosis: string | null;

  @Column({ name: 'root_cause_category_id', type: 'uuid', nullable: true })
  rootCauseCategoryId: string | null;

  @ManyToOne(() => MaintenanceRootCauseCategory, { nullable: true })
  @JoinColumn({ name: 'root_cause_category_id' })
  rootCauseCategory: MaintenanceRootCauseCategory | null;

  @Column({ name: 'failure_category_id', type: 'uuid', nullable: true })
  failureCategoryId: string | null;

  @ManyToOne(() => MaintenanceFailureCategory, { nullable: true })
  @JoinColumn({ name: 'failure_category_id' })
  failureCategory: MaintenanceFailureCategory | null;

  @Column({ name: 'corrective_action', type: 'text', nullable: true })
  correctiveAction: string | null;

  @Column({ name: 'preventive_action', type: 'text', nullable: true })
  preventiveAction: string | null;

  @Column({ name: 'current_status', type: 'varchar', length: 30, default: JobCardStatus.OPEN })
  currentStatus: JobCardStatus;

  @Column({ name: 'assigned_at', type: 'timestamp with time zone', nullable: true })
  assignedAt: Date | null;

  @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamp with time zone', nullable: true })
  closedAt: Date | null;

  @Column({ name: 'verified_at', type: 'timestamp with time zone', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'approved_at', type: 'timestamp with time zone', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'started_by', type: 'uuid', nullable: true })
  startedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'started_by' })
  startedByUser: ErpUser | null;

  @Column({ name: 'completed_by', type: 'uuid', nullable: true })
  completedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'completed_by' })
  completedByUser: ErpUser | null;

  @Column({ name: 'closed_by', type: 'uuid', nullable: true })
  closedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'closed_by' })
  closedByUser: ErpUser | null;

  @Column({ name: 'verified_by', type: 'uuid', nullable: true })
  verifiedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'verified_by' })
  verifiedByUser: ErpUser | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedByUser: ErpUser | null;

  @Column({ name: 'downtime_start', type: 'timestamp with time zone', nullable: true })
  downtimeStart: Date | null;

  @Column({ name: 'downtime_end', type: 'timestamp with time zone', nullable: true })
  downtimeEnd: Date | null;

  @Column({ name: 'downtime_minutes', type: 'integer', nullable: true })
  downtimeMinutes: number | null;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;

  @OneToMany(() => MaintenanceJobCardTechnician, (technician) => technician.jobCard)
  technicians: MaintenanceJobCardTechnician[];
}
