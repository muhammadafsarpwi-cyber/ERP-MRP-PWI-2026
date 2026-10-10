import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Split the flat "Rejection / Scrap" input into two factory-floor classes:
 *
 *   * scrap_quantity  — PRODUCT REJECTION: fully formed items that failed the
 *     dimensional/visual audit. Stock-deducting (reduces good output and drives
 *     the raw-material consumption basis). Column already exists — untouched.
 *   * process_scrap_kg — PROCESS CUTTING SCRAP: raw metal off-cuts, wire
 *     trimmings and machine setup filings. REPORT-ONLY: never deducted from
 *     output pieces and never posted to the stock ledger, so it exists purely
 *     as an audit metric for monthly dashboards/summaries.
 *
 * Idempotent — safe to re-run.
 */
export class AddProcessScrapKgToProductionEntries1805000000000 implements MigrationInterface {
  name = 'AddProcessScrapKgToProductionEntries1805000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasCol = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='production_entries' AND column_name='process_scrap_kg'`,
    );
    if (hasCol.length === 0) {
      await queryRunner.query(
        `ALTER TABLE production_entries ADD COLUMN process_scrap_kg DECIMAL(19,4) NOT NULL DEFAULT 0`,
      );
    }
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'ck_prod_entries_process_scrap_nonneg'
        ) THEN
          ALTER TABLE production_entries
            ADD CONSTRAINT ck_prod_entries_process_scrap_nonneg
            CHECK (process_scrap_kg >= 0);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE production_entries DROP CONSTRAINT IF EXISTS ck_prod_entries_process_scrap_nonneg`,
    );
    await queryRunner.query(
      `ALTER TABLE production_entries DROP COLUMN IF EXISTS process_scrap_kg`,
    );
  }
}
