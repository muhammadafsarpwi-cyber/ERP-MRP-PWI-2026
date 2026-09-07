import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add diameter_mm, process_6, and processes JSONB column to items table.
 * Supports explicit diameter physical specification, 6+ production operations,
 * and maintains sequence order persistence with backward-compatible scalar fallback.
 */
export class AddItemDiameterAndOperations1789600000000 implements MigrationInterface {
  name = 'AddItemDiameterAndOperations1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add diameter_mm column
    await queryRunner.query(
      `ALTER TABLE items ADD COLUMN IF NOT EXISTS diameter_mm NUMERIC(8,3);`,
    );

    // 2. Add process_6 column for backward compatibility
    await queryRunner.query(
      `ALTER TABLE items ADD COLUMN IF NOT EXISTS process_6 VARCHAR(255);`,
    );

    // 3. Add processes JSONB column for repeatable scalable operations list
    await queryRunner.query(
      `ALTER TABLE items ADD COLUMN IF NOT EXISTS processes JSONB DEFAULT '[]'::jsonb;`,
    );

    // 4. Backfill diameter_mm for Spoke items where wire_size_mm was used
    await queryRunner.query(`
      UPDATE items
      SET diameter_mm = wire_size_mm
      WHERE wire_size_mm IS NOT NULL
        AND diameter_mm IS NULL
        AND (
          item_code ILIKE '%spoke%'
          OR name ILIKE '%spoke%'
          OR division_id IN (SELECT id FROM divisions WHERE name ILIKE '%spoke%')
        );
    `);

    // 5. Backfill processes JSONB from existing process_1..process_5 columns
    await queryRunner.query(`
      UPDATE items
      SET processes = (
        SELECT jsonb_agg(jsonb_build_object('sequence', step.seq, 'name', step.pname))
        FROM (
          SELECT 1 AS seq, process_1 AS pname WHERE process_1 IS NOT NULL AND process_1 != ''
          UNION ALL
          SELECT 2 AS seq, process_2 AS pname WHERE process_2 IS NOT NULL AND process_2 != ''
          UNION ALL
          SELECT 3 AS seq, process_3 AS pname WHERE process_3 IS NOT NULL AND process_3 != ''
          UNION ALL
          SELECT 4 AS seq, process_4 AS pname WHERE process_4 IS NOT NULL AND process_4 != ''
          UNION ALL
          SELECT 5 AS seq, process_5 AS pname WHERE process_5 IS NOT NULL AND process_5 != ''
          ORDER BY seq
        ) step
      )
      WHERE process_1 IS NOT NULL
        AND (processes IS NULL OR processes = '[]'::jsonb);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE items DROP COLUMN IF EXISTS processes;`);
    await queryRunner.query(`ALTER TABLE items DROP COLUMN IF EXISTS process_6;`);
    await queryRunner.query(`ALTER TABLE items DROP COLUMN IF EXISTS diameter_mm;`);
  }
}
