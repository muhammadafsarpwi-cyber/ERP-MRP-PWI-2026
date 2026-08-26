import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { MaintenanceJobCard } from './maintenance-job-card.entity';

@Entity('maintenance_job_card_technicians')
@Index(['jobCardId'])
@Index(['technicianUserId'])
export class MaintenanceJobCardTechnician extends BaseEntity {
  @Column({ name: 'job_card_id', type: 'uuid' })
  jobCardId: string;

  @ManyToOne(() => MaintenanceJobCard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_card_id' })
  jobCard: MaintenanceJobCard;

  @Column({ name: 'technician_user_id', type: 'uuid' })
  technicianUserId: string;

  @ManyToOne(() => ErpUser)
  @JoinColumn({ name: 'technician_user_id' })
  technicianUser: ErpUser;

  @Column({ name: 'role', type: 'varchar', length: 50, default: 'PRIMARY' })
  role: string;

  @Column({ name: 'assigned_at', type: 'timestamp with time zone', default: () => 'NOW()' })
  assignedAt: Date;

  @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completedAt: Date | null;
}
