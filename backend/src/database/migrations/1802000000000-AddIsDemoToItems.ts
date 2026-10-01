import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DUMMY-DATA-CLEANUP: explicit demo/test classification flag on items.
 * Idempotent — safe to re-run. Existing rows default to NOT demo.
 * The flag (not name-matching) is the source of truth for hard-delete
 * eligibility; name patterns are only used to FIND review candidates.
 */
export class AddIsDemoToItems1802000000000 implements MigrationInterface {
  name = 'AddIsDemoToItems1802000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE items ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE items DROP COLUMN IF EXISTS is_demo`);
  }
}
