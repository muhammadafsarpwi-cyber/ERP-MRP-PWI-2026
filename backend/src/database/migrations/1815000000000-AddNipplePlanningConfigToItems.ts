import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNipplePlanningConfigToItems1815000000000 implements MigrationInterface {
  name = 'AddNipplePlanningConfigToItems1815000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.items
      ADD COLUMN IF NOT EXISTS manual_monthly_usage_grs NUMERIC(18, 2),
      ADD COLUMN IF NOT EXISTS import_lead_time_months NUMERIC(6, 2) NOT NULL DEFAULT 4,
      ADD COLUMN IF NOT EXISTS safety_buffer_months NUMERIC(6, 2) NOT NULL DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.items
      DROP COLUMN IF EXISTS safety_buffer_months,
      DROP COLUMN IF EXISTS import_lead_time_months,
      DROP COLUMN IF EXISTS manual_monthly_usage_grs
    `);
  }
}
