import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type AiProviderPlatform =
  | 'google_gemini'
  | 'openrouter'
  | 'openai'
  | 'anthropic'
  | 'custom_openai';

@Entity('ai_provider_configs')
export class AiProviderConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'org_id', type: 'varchar', length: 128, nullable: true })
  orgId: string | null;

  @Column({
    name: 'provider_platform',
    type: 'varchar',
    length: 64,
    default: 'google_gemini',
  })
  providerPlatform: AiProviderPlatform;

  @Column({ name: 'configuration_label', type: 'varchar', length: 255 })
  configurationLabel: string;

  @Column({ name: 'encrypted_api_key', type: 'text', nullable: true })
  encryptedApiKey: string | null;

  @Column({ name: 'model_id', type: 'varchar', length: 128 })
  modelId: string;

  @Column({ name: 'base_api_url', type: 'varchar', length: 512, nullable: true })
  baseApiUrl: string | null;

  @Column({
    name: 'temperature',
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 0.2,
  })
  temperature: number;

  @Column({ name: 'max_output_tokens', type: 'int', default: 4096 })
  maxOutputTokens: number;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @Column({ name: 'is_primary_default', type: 'boolean', default: false })
  isPrimaryDefault: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

