const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env') });

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';

const ENTITY_QUERIES = {
  ITEM: `SELECT id, item_code as code, name as label FROM items WHERE company_id = $1 AND is_active = true`,
  CUSTOMER: `SELECT id, customer_code as code, name as label FROM customers WHERE company_id = $1 AND is_active = true`,
  MACHINE: `SELECT id, machine_code as code, machine_name as label FROM machines WHERE company_id = $1 AND is_active = true`,
  WAREHOUSE: `SELECT id, warehouse_code as code, name as label FROM warehouses WHERE company_id = $1 AND is_active = true`,
  EMPLOYEE: `SELECT id, employee_code as code, (first_name || ' ' || COALESCE(last_name, '')) as label FROM hr_employees WHERE company_id = $1 AND is_active = true`,
  PRODUCTION_ENTRY: `SELECT id, 'PE-' || LEFT(id::text, 8) as code, 'Production Entry' as label FROM production_entries WHERE company_id = $1 AND is_active = true`,
  JOB_CARD: `SELECT id, job_card_no as code, (job_card_no || ' - Job Card') as label FROM maintenance_job_cards WHERE company_id = $1 AND is_active = true`,
};

async function getNextBarcodeValue() {
  const result = await client.query(`
    SELECT COALESCE(
      MAX(CAST(barcode_value AS BIGINT)),
      8901000000000
    ) + 1 AS next_value
    FROM barcodes
    WHERE barcode_value IS NOT NULL AND barcode_value != '' AND barcode_value ~ '^[0-9]+$'
  `);
  const next = Number(result.rows[0].next_value);
  return String(next).padStart(13, '0');
}

(async () => {
  try {
    await client.connect();
    console.log('Connected to database');

    let globalBarcodeSeq = null;

    const totalScanned = { value: 0 };
    const totalCreated = { value: 0 };
    const totalSkipped = { value: 0 };
    const totalFailed = { value: 0 };

    for (const [entityType, query] of Object.entries(ENTITY_QUERIES)) {
      console.log(`\n=== Processing ${entityType} ===`);
      try {
        const entities = await client.query(query, [COMPANY_ID]);
        console.log(`  Found ${entities.rows.length} active entities`);
        totalScanned.value += entities.rows.length;

        for (const entity of entities.rows) {
          try {
            const existing = await client.query(
              `SELECT id FROM barcodes WHERE company_id = $1 AND entity_type = $2 AND entity_id = $3 AND status = 'ACTIVE' LIMIT 1`,
              [COMPANY_ID, entityType, entity.id]
            );

            if (existing.rows.length > 0) {
              totalSkipped.value++;
              continue;
            }

            if (!globalBarcodeSeq) {
              const nextVal = await getNextBarcodeValue();
              globalBarcodeSeq = BigInt(nextVal);
            }

            const barcodeValue = String(globalBarcodeSeq).padStart(13, '0');
            globalBarcodeSeq++;

            const now = new Date().toISOString();
            await client.query(
              `INSERT INTO barcodes (id, company_id, barcode_value, entity_type, entity_id, barcode_label, entity_label, entity_code, status, is_primary, created_at, updated_at, is_active)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 'ACTIVE', true, $8, $8, true)`,
              [COMPANY_ID, barcodeValue, entityType, entity.id, entity.code, entity.label, entity.code, now]
            );
            totalCreated.value++;
            if (totalCreated.value % 20 === 0) {
              console.log(`  ... created ${totalCreated.value} barcodes so far`);
            }
          } catch (err) {
            totalFailed.value++;
            console.error(`  FAILED: ${entityType}:${entity.id} - ${err.message}`);
          }
        }
      } catch (err) {
        totalFailed.value++;
        console.error(`  ${entityType} query failed: ${err.message}`);
      }
    }

    console.log('\n=== BACKFILL COMPLETE ===');
    console.log(`  Total Scanned: ${totalScanned.value}`);
    console.log(`  Created: ${totalCreated.value}`);
    console.log(`  Skipped (already existing): ${totalSkipped.value}`);
    console.log(`  Failed: ${totalFailed.value}`);

    // Verify counts
    const countResult = await client.query('SELECT entity_type, COUNT(*) as count FROM barcodes WHERE company_id = $1 GROUP BY entity_type ORDER BY entity_type', [COMPANY_ID]);
    console.log('\n=== BARCODES BY ENTITY TYPE ===');
    countResult.rows.forEach(r => console.log(`  ${r.entity_type}: ${r.count}`));
    const totalResult = await client.query('SELECT COUNT(*) as count FROM barcodes WHERE company_id = $1', [COMPANY_ID]);
    console.log(`  TOTAL: ${totalResult.rows[0].count}`);

    await client.end();
  } catch (e) {
    console.error('Connection error:', e.message);
    process.exit(1);
  }
})();
