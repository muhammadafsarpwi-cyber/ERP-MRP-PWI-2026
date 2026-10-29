import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add persistent packing_mode column to production_entries table.
 * Also create views packing_production_entries and packing_production_item_entries
 * for historical packing transaction auditing and mode persistence.
 *
 * packing_mode enum values:
 *   - 'FULL_SET'    (Inner + Outer + Nipple)
 *   - 'INNER_ONLY'  (Inner Spokes Only + Nipple; Outer excluded)
 *   - 'OUTER_ONLY'  (Outer Spokes Only + Nipple; Inner excluded)
 *   - 'WITHOUT_NIPPLE' (Spokes only; Nipple deferred)
 */
export class AddPackingModeToProductionEntries1809000000000 implements MigrationInterface {
  name = 'AddPackingModeToProductionEntries1809000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasCol = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='production_entries' AND column_name='packing_mode'`,
    );
    if (hasCol.length === 0) {
      await queryRunner.query(
        `ALTER TABLE production_entries ADD COLUMN packing_mode VARCHAR(50) NOT NULL DEFAULT 'FULL_SET'`,
      );
    }

    // Backfill packing_mode from existing remarks
    await queryRunner.query(`
      UPDATE production_entries
      SET packing_mode = CASE
        WHEN remarks ILIKE '%ONLY_OUTER%' OR remarks ILIKE '%Only Outer%' THEN 'OUTER_ONLY'
        WHEN remarks ILIKE '%ONLY_INNER%' OR remarks ILIKE '%Only Inner%' THEN 'INNER_ONLY'
        WHEN remarks ILIKE '%WITHOUT_NIPPLE%' OR remarks ILIKE '%Without Nipple%' THEN 'WITHOUT_NIPPLE'
        ELSE 'FULL_SET'
      END
      WHERE packing_mode IS NULL OR packing_mode = 'FULL_SET';
    `);

    // Create / replace convenience views for packing audits
    await queryRunner.query(`
      CREATE OR REPLACE VIEW packing_production_entries AS
      SELECT * FROM production_entries;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE VIEW packing_production_item_entries AS
      SELECT * FROM production_entry_items;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS packing_production_item_entries`);
    await queryRunner.query(`DROP VIEW IF EXISTS packing_production_entries`);
    await queryRunner.query(
      `ALTER TABLE production_entries DROP COLUMN IF EXISTS packing_mode`,
    );
  }
}
