import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

export enum NotificationDeliveryStatus {
  QUEUED = 'QUEUED',
  SENDING = 'SENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

@Entity('notification_deliveries')
@Index('idx_nd_company', ['companyId'])
@Index('idx_nd_user', ['recipientUserId'])
@Index('idx_nd_status', ['status'])
export class NotificationDelivery extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ name: 'notification_id', type: 'uuid', nullable: true })
  notificationId: string | null;

  @Column({ name: 'recipient_user_id', type: 'uuid', nullable: true })
  recipientUserId: string | null;

  @Column({ name: 'recipient_type', type: 'varchar', length: 30, nullable: true })
  recipientType: string | null;

  @Column({ type: 'varchar', length: 20 })
  channel: 'IN_APP' | 'EMAIL' | 'WHATSAPP';

  @Column({ name: 'template_code', type: 'varchar', length: 100, nullable: true })
  templateCode: string | null;

  @Column({ name: 'rendered_subject', type: 'text', nullable: true })
  renderedSubject: string | null;

  @Column({ name: 'rendered_body', type: 'text', nullable: true })
  renderedBody: string | null;

  @Column({ name: 'recipient_address', type: 'varchar', length: 300, nullable: true })
  recipientAddress: string | null;

  @Column({ type: 'varchar', length: 20, default: 'QUEUED' })
  status: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  provider: string | null;

  @Column({ name: 'provider_message_id', type: 'varchar', length: 200, nullable: true })
  providerMessageId: string | null;

  @Column({ name: 'provider_response', type: 'text', nullable: true })
  providerResponse: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', type: 'int', default: 3 })
  maxRetries: number;

  @Column({ name: 'sent_at', type: 'timestamp with time zone', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamp with time zone', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'read_at', type: 'timestamp with time zone', nullable: true })
  readAt: Date | null;

  @Column({ name: 'event_id', type: 'uuid', nullable: true })
  eventId: string | null;
}
