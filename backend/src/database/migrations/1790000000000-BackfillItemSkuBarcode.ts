import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Backfill SKU and Barcode for existing Items.
 *
 * - Generates deterministic SKU from itemCode for items missing SKU
 * - Generates unique numeric Barcode for items missing Barcode
 * - Does NOT overwrite existing valid values
 * - Safe to run multiple times (idempotent)
 * - Adds unique constraints after backfill
 */
export class BackfillItemSkuBarcode1790000000000 implements MigrationInterface {
  name = 'BackfillItemSkuBarcode1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Backfill SKU: use itemCode as SKU base, with suffix if duplicate
    //    Strategy: SKU = itemCode (already unique per company)
    await queryRunner.query(`
      UPDATE items
      SET sku = item_code
      WHERE (sku IS NULL OR sku = '' OR LENGTH(TRIM(sku)) = 0)
    `);

    // Handle potential SKU duplicates by appending a numeric suffix
    // Find items with duplicate SKUs within the same company and fix them
    await queryRunner.query(`
      WITH duplicate_skus AS (
        SELECT id, sku, company_id,
               ROW_NUMBER() OVER (PARTITION BY company_id, sku ORDER BY created_at ASC) AS rn
        FROM items
        WHERE sku IS NOT NULL AND sku != ''
      )
      UPDATE items
      SET sku = items.sku || '-' || ds.rn
      FROM duplicate_skus ds
      WHERE items.id = ds.id
        AND ds.rn > 1;
    `);

    // 2. Backfill Barcode: generate sequential numeric barcodes
    //    Format: 8901000000001, 8901000000002, etc. (13-digit internal barcode)
    //    Start from max existing barcode + 1, or 8901000000001 if none exist
    await queryRunner.query(`
      WITH numbered_items AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY company_id, created_at ASC) AS seq
        FROM items
        WHERE barcode IS NULL OR barcode = '' OR LENGTH(TRIM(barcode)) = 0
      ),
      max_barcode AS (
        SELECT COALESCE(
          MAX(CAST(barcode AS BIGINT)),
          8901000000000
        ) AS max_bc
        FROM items
        WHERE barcode IS NOT NULL AND barcode != '' AND barcode ~ '^[0-9]+$'
      )
      UPDATE items
      SET barcode = LPAD(CAST((mb.max_bc + ni.seq) AS TEXT), 13, '0')
      FROM numbered_items ni, max_barcode mb
      WHERE items.id = ni.id;
    `);

    // 3. Fix any remaining items with empty barcodes (edge case)
    await queryRunner.query(`
      WITH remaining AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY company_id, created_at ASC) AS seq
        FROM items
        WHERE barcode IS NULL OR barcode = '' OR LENGTH(TRIM(barcode)) = 0
      ),
      max_barcode AS (
        SELECT COALESCE(
          MAX(CAST(barcode AS BIGINT)),
          8901000000000
        ) AS max_bc
        FROM items
        WHERE barcode IS NOT NULL AND barcode != '' AND barcode ~ '^[0-9]+$'
      )
      UPDATE items
      SET barcode = LPAD(CAST((mb.max_bc + r.seq) AS TEXT), 13, '0')
      FROM remaining r, max_barcode mb
      WHERE items.id = r.id;
    `);

    // 4. Add unique constraints (with IF NOT EXISTS for safety)
    // SKU unique per company
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_items_sku_company'
        ) THEN
          ALTER TABLE items ADD CONSTRAINT uq_items_sku_company UNIQUE (company_id, sku);
        END IF;
      END
      $$;
    `);

    // Barcode global unique
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_items_barcode'
        ) THEN
          ALTER TABLE items ADD CONSTRAINT uq_items_barcode UNIQUE (barcode);
        END IF;
      END
      $$;
    `);

    // 5. Report results
    const [totalResult] = await queryRunner.query(`SELECT COUNT(*)::int AS total FROM items`);
    const [skuResult] = await queryRunner.query(`SELECT COUNT(*)::int AS with_sku FROM items WHERE sku IS NOT NULL AND sku != ''`);
    const [barcodeResult] = await queryRunner.query(`SELECT COUNT(*)::int AS with_barcode FROM items WHERE barcode IS NOT NULL AND barcode != ''`);
    const [dupSkuResult] = await queryRunner.query(`
      SELECT COUNT(*)::int AS dup_sku FROM (
        SELECT company_id, sku, COUNT(*) AS cnt
        FROM items WHERE sku IS NOT NULL AND sku != ''
        GROUP BY company_id, sku HAVING COUNT(*) > 1
      ) t
    `);
    const [dupBarcodeResult] = await queryRunner.query(`
      SELECT COUNT(*)::int AS dup_barcode FROM (
        SELECT barcode, COUNT(*) AS cnt
        FROM items WHERE barcode IS NOT NULL AND barcode != ''
        GROUP BY barcode HAVING COUNT(*) > 1
      ) t
    `);

    console.log('=== Item SKU/Barcode Backfill Report ===');
    console.log(`Total Items: ${totalResult.total}`);
    console.log(`Items with SKU: ${skuResult.with_sku}`);
    console.log(`Items with Barcode: ${barcodeResult.with_barcode}`);
    console.log(`Duplicate SKUs: ${dupSkuResult.dup_sku}`);
    console.log(`Duplicate Barcodes: ${dupBarcodeResult.dup_barcode}`);
    console.log('========================================');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove unique constraints
    await queryRunner.query(`ALTER TABLE items DROP CONSTRAINT IF EXISTS uq_items_sku_company;`);
    await queryRunner.query(`ALTER TABLE items DROP CONSTRAINT IF EXISTS uq_items_barcode;`);
  }
}
