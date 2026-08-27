import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { Company } from '../../organization/entities/company.entity';
import { Machine } from '../../production/entities/machine.entity';
import { MaintenanceTeam } from './maintenance-team.entity';

@Entity('maintenance_pm_plans')
@Index(['companyId'])
@Index(['machineId'])
export class MaintenancePmPlan extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid' })
  companyId: string;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ name: 'plan_code', type: 'varchar', length: 50, unique: true })
  planCode: string;

  @Column({ name: 'plan_name', type: 'varchar', length: 255 })
  planName: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'machine_id', type: 'uuid' })
  machineId: string;

  @ManyToOne(() => Machine)
  @JoinColumn({ name: 'machine_id' })
  machine: Machine;

  @Column({ name: 'frequency_type', type: 'varchar', length: 30 })
  frequencyType: string;

  @Column({ name: 'frequency_value', type: 'integer' })
  frequencyValue: number;

  @Column({ name: 'checklist', type: 'jsonb', nullable: true })
  checklist: any;

  @Column({ name: 'assigned_team_id', type: 'uuid', nullable: true })
  assignedTeamId: string | null;

  @ManyToOne(() => MaintenanceTeam, { nullable: true })
  @JoinColumn({ name: 'assigned_team_id' })
  assignedTeam: MaintenanceTeam | null;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ name: 'next_due_date', type: 'date', nullable: true })
  nextDueDate: string | null;

  @Column({ name: 'last_generated_at', type: 'timestamp with time zone', nullable: true })
  lastGeneratedAt: Date | null;
}
