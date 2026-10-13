import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductionInItemId3ToItems1804000000000 implements MigrationInterface {
  name = 'AddProductionInItemId3ToItems1804000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasCol = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='production_in_item_id_3'`,
    );
    if (hasCol.length === 0) {
      await queryRunner.query(
        `ALTER TABLE items ADD COLUMN production_in_item_id_3 UUID REFERENCES items(id) ON DELETE SET NULL`,
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS idx_items_production_in_item_3 ON items (production_in_item_id_3)`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_items_production_in_item_3`);
    await queryRunner.query(`ALTER TABLE items DROP COLUMN IF EXISTS production_in_item_id_3`);
  }
}
