import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBarcodeRegistry1791000000000 implements MigrationInterface {
  name = 'CreateBarcodeRegistry1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS barcodes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL,
        barcode_value VARCHAR(255) NOT NULL,
        entity_type VARCHAR(30) NOT NULL,
        entity_id UUID NOT NULL,
        barcode_label VARCHAR(255),
        entity_label VARCHAR(500),
        entity_code VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        is_primary BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by UUID,
        updated_by UUID,
        is_active BOOLEAN NOT NULL DEFAULT true
      );

      CREATE UNIQUE INDEX IF NOT EXISTS uq_barcodes_company_value
        ON barcodes (company_id, barcode_value);

      CREATE INDEX IF NOT EXISTS idx_barcodes_company_entity_type
        ON barcodes (company_id, entity_type);

      CREATE INDEX IF NOT EXISTS idx_barcodes_company_entity
        ON barcodes (company_id, entity_type, entity_id);

      CREATE INDEX IF NOT EXISTS idx_barcodes_value
        ON barcodes (barcode_value);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS barcodes`);
  }
}
