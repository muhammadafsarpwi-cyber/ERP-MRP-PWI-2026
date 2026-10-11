const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME },
  });

  await client.connect();
  console.log('Connected to DB');

  // 1. Add warehouse_id to production_entries
  await client.query(`
    ALTER TABLE production_entries 
    ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
  `);
  console.log('Added warehouse_id column to production_entries');

  // 2. Add index
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_production_entries_warehouse_id 
    ON production_entries(warehouse_id);
  `);
  console.log('Created index on warehouse_id');

  // 3. Backfill warehouse_id from stock_ledger receipts
  const backfill = await client.query(`
    UPDATE production_entries pe
    SET warehouse_id = sl.warehouse_id
    FROM (
      SELECT DISTINCT ON (reference_id) reference_id, warehouse_id
      FROM stock_ledger
      WHERE reference_type = 'PRODUCTION_ENTRY' AND transaction_type = 'PRODUCTION_RECEIPT'
      ORDER BY reference_id, created_at DESC
    ) sl
    WHERE pe.id = sl.reference_id AND pe.warehouse_id IS NULL;
  `);
  console.log(`Backfilled ${backfill.rowCount} entries with warehouse_id from stock_ledger receipts`);

  // 4. Verify count
  const verify = await client.query(`
    SELECT count(*) as total, 
           count(raw_material_warehouse_id) as with_raw_wh, 
           count(warehouse_id) as with_wh 
    FROM production_entries;
  `);
  console.log('Verification stats:', verify.rows[0]);

  await client.end();
}

run().catch(console.error);
