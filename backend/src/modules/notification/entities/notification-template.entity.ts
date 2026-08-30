import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

@Entity('notification_templates')
@Index('idx_nt_company', ['companyId'])
export class NotificationTemplate extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ name: 'template_code', type: 'varchar', length: 100 })
  templateCode: string;

  @Column({ name: 'template_name', type: 'varchar', length: 200 })
  templateName: string;

  @Column({ type: 'varchar', length: 50 })
  module: string;

  @Column({ name: 'event_code', type: 'varchar', length: 100, nullable: true })
  eventCode: string | null;

  @Column({ type: 'varchar', length: 20 })
  channel: 'IN_APP' | 'EMAIL' | 'WHATSAPP';

  @Column({ type: 'varchar', length: 300, nullable: true })
  subject: string | null;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'text', array: true, nullable: true })
  variables: string[] | null;
}
