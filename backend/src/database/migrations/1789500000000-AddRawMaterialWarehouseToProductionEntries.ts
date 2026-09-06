import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TASK #37: persist the resolved Raw Material Source Warehouse on each daily
 * production entry that posts directly to inventory. Previously the value was
 * passed into the posting transaction but never stored, so the audited source
 * store (where PRODUCTION_CONSUMPTION OUT movements happened) was not
 * recoverable from the entry itself after the fact.
 */
export class AddRawMaterialWarehouseToProductionEntries1789500000000 implements MigrationInterface {
  name = 'AddRawMaterialWarehouseToProductionEntries1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasCol = await queryRunner.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='production_entries' AND column_name='raw_material_warehouse_id'`,
    );
    if (hasCol.length === 0) {
      await queryRunner.query(`ALTER TABLE production_entries ADD COLUMN raw_material_warehouse_id UUID`);
    }
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_production_entries_raw_material_warehouse'
        ) THEN
          ALTER TABLE production_entries
            ADD CONSTRAINT fk_production_entries_raw_material_warehouse
            FOREIGN KEY (raw_material_warehouse_id) REFERENCES warehouses(id);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE production_entries DROP CONSTRAINT IF EXISTS fk_production_entries_raw_material_warehouse`,
    );
    await queryRunner.query(
      `ALTER TABLE production_entries DROP COLUMN IF EXISTS raw_material_warehouse_id`,
    );
  }
}