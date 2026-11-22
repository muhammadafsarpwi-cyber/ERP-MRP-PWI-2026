import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryLinkAndLinesToSalesInvoices1816000000000 implements MigrationInterface {
  name = 'AddDeliveryLinkAndLinesToSalesInvoices1816000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE erp_sales.sales_invoices
        ADD COLUMN IF NOT EXISTS sales_delivery_id UUID NULL,
        ADD COLUMN IF NOT EXISTS delivery_number VARCHAR(60) NULL,
        ADD COLUMN IF NOT EXISTS gate_pass_number VARCHAR(60) NULL,
        ADD COLUMN IF NOT EXISTS division_id UUID NULL,
        ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(60) NULL,
        ADD COLUMN IF NOT EXISTS document_type VARCHAR(40) NULL DEFAULT 'Tax Invoice',
        ADD COLUMN IF NOT EXISTS notes TEXT NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_invoices_delivery_id
      ON erp_sales.sales_invoices (sales_delivery_id)
      WHERE deleted_at IS NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS erp_sales.sales_invoice_lines (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        invoice_id UUID NOT NULL REFERENCES erp_sales.sales_invoices(id) ON DELETE CASCADE,
        line_number INTEGER NULL,
        item_id UUID NULL,
        item_code VARCHAR(60) NULL,
        description TEXT NULL,
        soc_number VARCHAR(60) NULL,
        quantity NUMERIC(15, 4) NOT NULL DEFAULT 0,
        uom_id UUID NULL,
        uom_code VARCHAR(30) NULL,
        unit_price NUMERIC(15, 6) NOT NULL DEFAULT 0,
        discount_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
        tax_rate NUMERIC(6, 2) NOT NULL DEFAULT 0,
        tax_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
        line_total NUMERIC(15, 4) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_sales_invoice_lines_invoice_id
      ON erp_sales.sales_invoice_lines (invoice_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS erp_sales.sales_invoice_lines;`);
    await queryRunner.query(`DROP INDEX IF EXISTS erp_sales.idx_sales_invoices_delivery_id;`);
  }
}
