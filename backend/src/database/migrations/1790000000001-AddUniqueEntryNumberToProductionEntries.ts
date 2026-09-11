import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PROMPT-35 (follow-up): enforce DB-level uniqueness of the company-scoped
 * entry_number (PE-YYYY-NNNNN). The initial migration only created a plain
 * (non-unique) btree index, so uniqueness relied entirely on the in-app
 * max+1 generator. A composite UNIQUE index on (company_id, entry_number)
 * makes a silent duplicate impossible even if two entries are created
 * concurrently; existing rows are all distinct so this applies cleanly.
 */
export class AddUniqueEntryNumberToProductionEntries1790000000001 implements MigrationInterface {
  name = 'AddUniqueEntryNumberToProductionEntries1790000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_production_entries_company_entry_number
         ON production_entries (company_id, entry_number)
        WHERE entry_number IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_production_entries_company_entry_number`,
    );
  }
}