import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrgTrailToStockLedger1730000000000 implements MigrationInterface {
  name = 'AddOrgTrailToStockLedger1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const cols = ['division_id', 'section_id', 'department_id'];
    for (const col of cols) {
      const exists = await queryRunner.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name='stock_ledger' AND column_name=$1`,
        [col],
      );
      if (exists.length === 0) {
        await queryRunner.query(`ALTER TABLE stock_ledger ADD COLUMN ${col} UUID`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE stock_ledger DROP COLUMN IF EXISTS division_id`);
    await queryRunner.query(`ALTER TABLE stock_ledger DROP COLUMN IF EXISTS section_id`);
    await queryRunner.query(`ALTER TABLE stock_ledger DROP COLUMN IF EXISTS department_id`);
  }
}