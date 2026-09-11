import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PROMPT-35: add a human-readable entry reference (PE-YYYY-NNNNN) to
 * production_entries. The barcode convention PE-<uuid8> exists but is an
 * opaque internal handle; operators and audit trails need a stable, readable
 * number. Generated server-side on create (year-based, company-scoped
 * sequence). This migration also backfills existing rows in creation order
 * (year taken from entry_date so historical entries stay consistent with the
 * period they were produced in).
 */
export class AddEntryNumberToProductionEntries1790000000000 implements MigrationInterface {
  name = 'AddEntryNumberToProductionEntries1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasCol = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='production_entries' AND column_name='entry_number'`,
    );
    if (hasCol.length === 0) {
      await queryRunner.query(`ALTER TABLE production_entries ADD COLUMN entry_number VARCHAR(30)`);
    }
    await queryRunner.query(`
      WITH numbered AS (
        SELECT id, entry_date,
               ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at, id) AS rn
        FROM production_entries
        WHERE entry_number IS NULL
      )
      UPDATE production_entries pe
      SET entry_number = 'PE-' || TO_CHAR(pe.entry_date, 'YYYY') || '-' || LPAD(n.rn::text, 5, '0')
      FROM numbered n
      WHERE pe.id = n.id AND pe.entry_number IS NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_production_entries_entry_number ON production_entries (entry_number)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_production_entries_entry_number`);
    await queryRunner.query(
      `ALTER TABLE production_entries DROP COLUMN IF EXISTS entry_number`,
    );
  }
}