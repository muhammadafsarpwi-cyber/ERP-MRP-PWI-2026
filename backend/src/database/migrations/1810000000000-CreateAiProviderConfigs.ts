import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiProviderConfigs1810000000000 implements MigrationInterface {
  name = 'CreateAiProviderConfigs1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ai_provider_configs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "org_id" character varying(128),
        "provider_platform" character varying(64) NOT NULL DEFAULT 'google_gemini',
        "configuration_label" character varying(255) NOT NULL,
        "encrypted_api_key" text,
        "model_id" character varying(128) NOT NULL,
        "base_api_url" character varying(512),
        "temperature" numeric(3,2) NOT NULL DEFAULT 0.20,
        "max_output_tokens" integer NOT NULL DEFAULT 4096,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "is_primary_default" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_provider_configs" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_ai_provider_configs_org_id" ON "ai_provider_configs" ("org_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_provider_configs";`);
  }
}

