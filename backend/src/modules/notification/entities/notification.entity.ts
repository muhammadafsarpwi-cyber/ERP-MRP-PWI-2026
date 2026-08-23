import { Entity, Column, Index, CreateDateColumn } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

@Entity('notifications')
@Index('idx_notifications_user_read', ['userId', 'isRead'])
@Index('ux_notifications_user_entity', ['userId', 'entityType', 'entityId'], { unique: true })
export class Notification extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 50 })
  type: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  message: string | null;

  @Column({ name: 'entity_type', type: 'varchar', length: 50, nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @Column({ name: 'read_at', type: 'timestamp with time zone', nullable: true })
  readAt: Date | null;
}
