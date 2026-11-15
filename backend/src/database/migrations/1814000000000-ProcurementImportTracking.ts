import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProcurementImportTracking1814000000000 implements MigrationInterface {
  name = 'ProcurementImportTracking1814000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchase_requisitions
      ADD COLUMN IF NOT EXISTS purchase_origin VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
      ADD COLUMN IF NOT EXISTS import_cargo_type VARCHAR(30),
      ADD COLUMN IF NOT EXISTS incoterm VARCHAR(20),
      ADD COLUMN IF NOT EXISTS port_of_loading VARCHAR(150),
      ADD COLUMN IF NOT EXISTS port_of_discharge VARCHAR(150),
      ADD COLUMN IF NOT EXISTS currency_code VARCHAR(10) NOT NULL DEFAULT 'PKR',
      ADD COLUMN IF NOT EXISTS expected_etd DATE,
      ADD COLUMN IF NOT EXISTS expected_eta DATE,
      ADD COLUMN IF NOT EXISTS import_remarks TEXT
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pr_purchase_origin ON purchase_requisitions(purchase_origin)
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_orders
      ADD COLUMN IF NOT EXISTS purchase_origin VARCHAR(20) NOT NULL DEFAULT 'LOCAL',
      ADD COLUMN IF NOT EXISTS import_cargo_type VARCHAR(30),
      ADD COLUMN IF NOT EXISTS incoterm VARCHAR(20),
      ADD COLUMN IF NOT EXISTS port_of_loading VARCHAR(150),
      ADD COLUMN IF NOT EXISTS port_of_discharge VARCHAR(150),
      ADD COLUMN IF NOT EXISTS shipping_line VARCHAR(150),
      ADD COLUMN IF NOT EXISTS vessel_name VARCHAR(150),
      ADD COLUMN IF NOT EXISTS bl_awb_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS container_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS lc_tt_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS production_ready_date DATE,
      ADD COLUMN IF NOT EXISTS etd_date DATE,
      ADD COLUMN IF NOT EXISTS eta_date DATE,
      ADD COLUMN IF NOT EXISTS import_stage VARCHAR(40),
      ADD COLUMN IF NOT EXISTS eta_revision_count INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS division_id UUID
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_po_purchase_origin ON purchase_orders(purchase_origin)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_import_updates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
        milestone_type VARCHAR(40) NOT NULL,
        stage VARCHAR(40),
        previous_date DATE,
        new_date DATE,
        location_port VARCHAR(150),
        vessel_name VARCHAR(150),
        bl_awb_number VARCHAR(100),
        remarks TEXT,
        revision_number INT NOT NULL DEFAULT 1,
        updated_by UUID,
        updated_by_name VARCHAR(150),
        created_by UUID,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_po_import_updates_po ON purchase_order_import_updates(po_id, created_at DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS purchase_order_import_updates`);
    await queryRunner.query(`
      ALTER TABLE purchase_orders
      DROP COLUMN IF EXISTS purchase_origin,
      DROP COLUMN IF EXISTS import_cargo_type,
      DROP COLUMN IF EXISTS incoterm,
      DROP COLUMN IF EXISTS port_of_loading,
      DROP COLUMN IF EXISTS port_of_discharge,
      DROP COLUMN IF EXISTS shipping_line,
      DROP COLUMN IF EXISTS vessel_name,
      DROP COLUMN IF EXISTS bl_awb_number,
      DROP COLUMN IF EXISTS container_number,
      DROP COLUMN IF EXISTS lc_tt_number,
      DROP COLUMN IF EXISTS production_ready_date,
      DROP COLUMN IF EXISTS etd_date,
      DROP COLUMN IF EXISTS eta_date,
      DROP COLUMN IF EXISTS import_stage,
      DROP COLUMN IF EXISTS eta_revision_count
    `);
    await queryRunner.query(`
      ALTER TABLE purchase_requisitions
      DROP COLUMN IF EXISTS purchase_origin,
      DROP COLUMN IF EXISTS import_cargo_type,
      DROP COLUMN IF EXISTS incoterm,
      DROP COLUMN IF EXISTS port_of_loading,
      DROP COLUMN IF EXISTS port_of_discharge,
      DROP COLUMN IF EXISTS currency_code,
      DROP COLUMN IF EXISTS expected_etd,
      DROP COLUMN IF EXISTS expected_eta,
      DROP COLUMN IF EXISTS import_remarks
    `);
  }
}
