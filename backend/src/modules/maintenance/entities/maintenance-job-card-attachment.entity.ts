import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';
import { ErpUser } from '../../user/entities/erp-user.entity';
import { MaintenanceJobCard } from './maintenance-job-card.entity';

@Entity('maintenance_job_card_attachments')
@Index(['jobCardId'])
export class MaintenanceJobCardAttachment extends BaseEntity {
  @Column({ name: 'job_card_id', type: 'uuid' })
  jobCardId: string;

  @ManyToOne(() => MaintenanceJobCard, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_card_id' })
  jobCard: MaintenanceJobCard;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'file_url', type: 'varchar', length: 500 })
  fileUrl: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: true })
  mimeType: string | null;

  @Column({ name: 'file_size', type: 'integer', nullable: true })
  fileSize: number | null;

  @Column({ name: 'uploaded_by', type: 'uuid', nullable: true })
  uploadedBy: string | null;

  @ManyToOne(() => ErpUser, { nullable: true })
  @JoinColumn({ name: 'uploaded_by' })
  uploadedByUser: ErpUser | null;

  @Column({ name: 'uploaded_at', type: 'timestamp with time zone', default: () => 'NOW()' })
  uploadedAt: Date;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;
}
