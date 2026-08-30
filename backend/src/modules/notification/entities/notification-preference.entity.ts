import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

@Entity('notification_preferences')
@Index('idx_np_user', ['userId'])
export class NotificationPreference extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ type: 'varchar', length: 50 })
  module: string;

  @Column({ name: 'in_app', type: 'boolean', default: true })
  inApp: boolean;

  @Column({ type: 'boolean', default: true })
  email: boolean;

  @Column({ type: 'boolean', default: false })
  whatsapp: boolean;
}
