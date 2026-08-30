import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

@Entity('notification_channels')
@Index('idx_nc_company', ['companyId'])
export class NotificationChannel extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ name: 'channel_code', type: 'varchar', length: 50 })
  channelCode: string;

  @Column({ name: 'channel_name', type: 'varchar', length: 100 })
  channelName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  provider: string | null;

  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, any> | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}
