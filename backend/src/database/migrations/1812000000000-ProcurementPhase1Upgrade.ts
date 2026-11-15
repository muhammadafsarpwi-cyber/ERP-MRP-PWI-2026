import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProcurementPhase1Upgrade1812000000000 implements MigrationInterface {
  name = 'ProcurementPhase1Upgrade1812000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Make request_for_quotations.supplier_id nullable for multi-supplier RFQs
    await queryRunner.query(`
      ALTER TABLE request_for_quotations
      ALTER COLUMN supplier_id DROP NOT NULL;
    `);

    // 2. Create rfq_suppliers join table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS rfq_suppliers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        rfq_id uuid NOT NULL REFERENCES request_for_quotations(id) ON DELETE CASCADE,
        supplier_id uuid NOT NULL REFERENCES suppliers(id),
        status varchar(20) NOT NULL DEFAULT 'PENDING',
        sent_at timestamptz NULL,
        quoted_at timestamptz NULL,
        notes text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid NULL,
        updated_by uuid NULL,
        deleted_at timestamptz NULL,
        deleted_by uuid NULL
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_rfq_suppliers_rfq_id ON rfq_suppliers (rfq_id);
      CREATE INDEX IF NOT EXISTS idx_rfq_suppliers_supplier_id ON rfq_suppliers (supplier_id);
    `);

    // Backfill existing single-supplier RFQs into rfq_suppliers
    await queryRunner.query(`
      INSERT INTO rfq_suppliers (rfq_id, supplier_id, status, sent_at)
      SELECT r.id, r.supplier_id,
        CASE WHEN r.status IN ('AWARDED', 'CLOSED') THEN 'QUOTED' ELSE 'PENDING' END,
        CASE WHEN r.status != 'DRAFT' THEN r.created_at ELSE NULL END
      FROM request_for_quotations r
      WHERE r.supplier_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM rfq_suppliers rs WHERE rs.rfq_id = r.id AND rs.supplier_id = r.supplier_id
        );
    `);

    // 3. Add delivery_lead_time_days to quotations
    await queryRunner.query(`
      ALTER TABLE quotations
      ADD COLUMN IF NOT EXISTS delivery_lead_time_days int NULL;
    `);

    // 4. Add grn_id to purchase_invoices & grn_line_id / tax_percent to purchase_invoice_lines
    await queryRunner.query(`
      ALTER TABLE purchase_invoices
      ADD COLUMN IF NOT EXISTS grn_id uuid NULL REFERENCES goods_receipts(id);
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_invoice_lines
      ADD COLUMN IF NOT EXISTS grn_line_id uuid NULL REFERENCES goods_receipt_lines(id),
      ADD COLUMN IF NOT EXISTS tax_percent decimal(5,2) NOT NULL DEFAULT 0;
    `);

    // 5. Add grn_id / total_amount to purchase_returns & grn_line_id to purchase_return_lines
    await queryRunner.query(`
      ALTER TABLE purchase_returns
      ADD COLUMN IF NOT EXISTS grn_id uuid NULL REFERENCES goods_receipts(id),
      ADD COLUMN IF NOT EXISTS total_amount decimal(15,6) NOT NULL DEFAULT 0;
    `);

    await queryRunner.query(`
      ALTER TABLE purchase_return_lines
      ADD COLUMN IF NOT EXISTS grn_line_id uuid NULL REFERENCES goods_receipt_lines(id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE purchase_return_lines DROP COLUMN IF EXISTS grn_line_id;`);
    await queryRunner.query(`ALTER TABLE purchase_returns DROP COLUMN IF EXISTS total_amount, DROP COLUMN IF EXISTS grn_id;`);
    await queryRunner.query(`ALTER TABLE purchase_invoice_lines DROP COLUMN IF EXISTS tax_percent, DROP COLUMN IF EXISTS grn_line_id;`);
    await queryRunner.query(`ALTER TABLE purchase_invoices DROP COLUMN IF EXISTS grn_id;`);
    await queryRunner.query(`ALTER TABLE quotations DROP COLUMN IF EXISTS delivery_lead_time_days;`);
    await queryRunner.query(`DROP TABLE IF EXISTS rfq_suppliers;`);
  }
}
