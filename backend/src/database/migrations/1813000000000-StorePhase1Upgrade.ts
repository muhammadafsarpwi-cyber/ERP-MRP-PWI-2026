import { MigrationInterface, QueryRunner } from 'typeorm';

export class StorePhase1Upgrade1813000000000 implements MigrationInterface {
  name = 'StorePhase1Upgrade1813000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inventory_balances
      ADD COLUMN IF NOT EXISTS scrap_qty DECIMAL(15, 4) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS quarantine_qty DECIMAL(15, 4) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE material_issue_lines
      ADD COLUMN IF NOT EXISTS requires_old_item_return BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS old_item_returned_qty DECIMAL(15, 4) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS scrap_disposals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        division_id UUID,
        store_id UUID,
        warehouse_id UUID,
        item_id UUID,
        uom_id UUID,
        disposal_code VARCHAR(50) NOT NULL,
        disposal_date DATE NOT NULL,
        buyer_name VARCHAR(200) NOT NULL,
        quantity DECIMAL(15, 4) NOT NULL,
        auction_rate DECIMAL(15, 4) NOT NULL DEFAULT 0,
        total_value DECIMAL(15, 2) NOT NULL DEFAULT 0,
        gate_pass_ref VARCHAR(100),
        status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        remarks TEXT,
        completed_by UUID,
        completed_at TIMESTAMPTZ,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_scrap_disposals_company ON scrap_disposals(company_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS store_gate_passes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        division_id UUID,
        store_id UUID,
        gate_pass_number VARCHAR(50) NOT NULL,
        pass_type VARCHAR(10) NOT NULL,
        party_name VARCHAR(200) NOT NULL,
        party_address TEXT,
        vehicle_number VARCHAR(50),
        driver_name VARCHAR(100),
        issue_date DATE NOT NULL,
        expected_return_date DATE,
        purpose TEXT,
        authorized_by VARCHAR(150),
        status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        dispatched_by UUID,
        dispatched_at TIMESTAMPTZ,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_store_gate_passes_company ON store_gate_passes(company_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS store_gate_pass_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        gate_pass_id UUID NOT NULL REFERENCES store_gate_passes(id) ON DELETE CASCADE,
        line_number INT NOT NULL,
        item_id UUID,
        item_description VARCHAR(255) NOT NULL,
        uom_id UUID,
        quantity DECIMAL(15, 4) NOT NULL,
        returned_qty DECIMAL(15, 4) NOT NULL DEFAULT 0,
        remarks TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_store_gp_lines_gp ON store_gate_pass_lines(gate_pass_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS store_transfer_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        mtn_number VARCHAR(50) NOT NULL,
        from_store_id UUID NOT NULL,
        to_store_id UUID NOT NULL,
        from_division_id UUID,
        to_division_id UUID,
        transfer_date DATE NOT NULL,
        purpose TEXT,
        status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
        posted_by UUID,
        posted_at TIMESTAMPTZ,
        created_by UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_store_mtn_company ON store_transfer_notes(company_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS store_transfer_note_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transfer_note_id UUID NOT NULL REFERENCES store_transfer_notes(id) ON DELETE CASCADE,
        line_number INT NOT NULL,
        item_id UUID NOT NULL,
        uom_id UUID NOT NULL,
        quantity DECIMAL(15, 4) NOT NULL,
        remarks TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_store_mtn_lines_mtn ON store_transfer_note_lines(transfer_note_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS store_transfer_note_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS store_transfer_notes`);
    await queryRunner.query(`DROP TABLE IF EXISTS store_gate_pass_lines`);
    await queryRunner.query(`DROP TABLE IF EXISTS store_gate_passes`);
    await queryRunner.query(`DROP TABLE IF EXISTS scrap_disposals`);
    await queryRunner.query(`
      ALTER TABLE material_issue_lines
      DROP COLUMN IF EXISTS requires_old_item_return,
      DROP COLUMN IF EXISTS old_item_returned_qty
    `);
    await queryRunner.query(`
      ALTER TABLE inventory_balances
      DROP COLUMN IF EXISTS scrap_qty,
      DROP COLUMN IF EXISTS quarantine_qty
    `);
  }
}
