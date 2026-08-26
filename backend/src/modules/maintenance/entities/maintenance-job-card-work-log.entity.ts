import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { MaintenanceJobCard } from './maintenance-job-card.entity';

@Entity('maintenance_job_card_work_logs')
@Index(['jobCardId'])
export class MaintenanceJobCardWorkLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

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

  @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'ended_at', type: 'timestamp with time zone', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'duration_minutes', type: 'integer', nullable: true })
  durationMinutes: number | null;

  @Column({ name: 'work_description', type: 'text' })
  workDescription: string;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;
}
