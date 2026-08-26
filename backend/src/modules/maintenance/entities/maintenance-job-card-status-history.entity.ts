import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { PrimaryGeneratedColumn } from 'typeorm';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { MaintenanceJobCard } from './maintenance-job-card.entity';

@Entity('maintenance_job_card_status_history')
@Index(['jobCardId'])
@Index(['changedAt'])
export class MaintenanceJobCardStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_card_id', type: 'uuid' })
  jobCardId: string;

  @ManyToOne(() => MaintenanceJobCard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_card_id' })
  jobCard: MaintenanceJobCard;

  @Column({ name: 'from_status', type: 'varchar', length: 30, nullable: true })
  fromStatus: string | null;

  @Column({ name: 'to_status', type: 'varchar', length: 30 })
  toStatus: string;

  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'changed_by' })
  changedByUser: ErpUser | null;

  @Column({ name: 'changed_at', type: 'timestamp with time zone', default: () => 'NOW()' })
  changedAt: Date;

  @Column({ name: 'remarks', type: 'text', nullable: true })
  remarks: string | null;
}
