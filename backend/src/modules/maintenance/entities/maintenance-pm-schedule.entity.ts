import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { Machine } from '../../production/entities/machine.entity';
import { MaintenancePmPlan } from './maintenance-pm-plan.entity';
import { MaintenanceJobCard } from './maintenance-job-card.entity';

@Entity('maintenance_pm_schedules')
@Index(['pmPlanId'])
@Index(['machineId'])
@Index(['scheduledDate'])
@Index(['status'])
export class MaintenancePmSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @Column({ name: 'pm_plan_id', type: 'uuid' })
  pmPlanId: string;

  @ManyToOne(() => MaintenancePmPlan, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pm_plan_id' })
  pmPlan: MaintenancePmPlan;

  @Column({ name: 'machine_id', type: 'uuid' })
  machineId: string;

  @ManyToOne(() => Machine)
  @JoinColumn({ name: 'machine_id' })
  machine: Machine;

  @Column({ name: 'scheduled_date', type: 'date' })
  scheduledDate: string;

  @Column({ name: 'generated_job_card_id', type: 'uuid', nullable: true })
  generatedJobCardId: string | null;

  @ManyToOne(() => MaintenanceJobCard, { nullable: true })
  @JoinColumn({ name: 'generated_job_card_id' })
  generatedJobCard: MaintenanceJobCard | null;

  @Column({ name: 'status', type: 'varchar', length: 30, default: 'SCHEDULED' })
  status: string;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;

  /**
   * Recycle Bin columns.
   *
   * NOTE: this table has NO `company_id` of its own — a schedule inherits its
   * tenancy from the PM plan it was generated from. The Recycle Bin registry
   * therefore scopes it with a `JOIN maintenance_pm_plans` clause rather than
   * the plain `e.companyId = :companyId` every other trash type uses.
   */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp with time zone', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy: string | null;
}
