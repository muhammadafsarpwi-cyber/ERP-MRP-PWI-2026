import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

@Entity('notification_events')
@Index('idx_ne_company', ['companyId'])
@Index('idx_ne_module', ['module'])
export class NotificationEvent extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ name: 'event_code', type: 'varchar', length: 100 })
  eventCode: string;

  @Column({ name: 'event_name', type: 'varchar', length: 200 })
  eventName: string;

  @Column({ type: 'varchar', length: 50 })
  module: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;
}
