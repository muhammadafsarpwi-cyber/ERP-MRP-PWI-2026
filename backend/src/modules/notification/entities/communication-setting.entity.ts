import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/base.entity';

export enum CommunicationSettingType {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
}

/**
 * Communication provider settings (SMTP email / WhatsApp Cloud API).
 * Secrets are stored as environment-variable references (e.g. "env:SMTP_PASSWORD")
 * or as references to the encrypted secrets store — never plaintext SMTP passwords
 * in the frontend. The API surface never returns resolved secrets.
 */
@Entity('communication_settings')
@Index('idx_cs_company_type', ['companyId', 'settingType'])
export class CommunicationSetting extends BaseEntity {
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId: string | null;

  @Column({ name: 'setting_type', type: 'varchar', length: 30 })
  settingType: 'EMAIL' | 'WHATSAPP';

  @Column({ type: 'varchar', length: 50, default: 'smtp' })
  provider: string;

  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, any> | null;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: string;
}
