import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductionInItemId2ToItems1803000000000 implements MigrationInterface {
  name = 'AddProductionInItemId2ToItems1803000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasCol = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='items' AND column_name='production_in_item_id_2'`,
    );
    if (hasCol.length === 0) {
      await queryRunner.query(
        `ALTER TABLE items ADD COLUMN production_in_item_id_2 UUID REFERENCES items(id) ON DELETE SET NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE items DROP COLUMN IF EXISTS production_in_item_id_2`);
  }
}
