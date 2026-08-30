import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

@Entity('notification_rules')
@Index('idx_nr_company', ['companyId'])
@Index('idx_nr_event', ['eventCode'])
export class NotificationRule extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ name: 'rule_code', type: 'varchar', length: 100 })
  ruleCode: string;

  @Column({ name: 'rule_name', type: 'varchar', length: 200 })
  ruleName: string;

  @Column({ name: 'event_code', type: 'varchar', length: 100 })
  eventCode: string;

  @Column({ type: 'varchar', length: 50 })
  module: string;

  @Column({ name: 'in_app', type: 'boolean', default: true })
  inApp: boolean;

  @Column({ type: 'boolean', default: false })
  email: boolean;

  @Column({ type: 'boolean', default: false })
  whatsapp: boolean;

  @Column({ type: 'varchar', length: 20, default: 'INFO' })
  severity: string;

  @Column({ name: 'recipient_type', type: 'varchar', length: 30, default: 'ROLE' })
  recipientType: string;

  @Column({ name: 'recipient_roles', type: 'text', array: true, nullable: true })
  recipientRoles: string[] | null;

  @Column({ name: 'recipient_user_ids', type: 'uuid', array: true, nullable: true })
  recipientUserIds: string[] | null;

  @Column({ name: 'template_code', type: 'varchar', length: 100, nullable: true })
  templateCode: string | null;

  @Column({ name: 'escalation_delay_minutes', type: 'int', default: 0 })
  escalationDelayMinutes: number;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;
}
