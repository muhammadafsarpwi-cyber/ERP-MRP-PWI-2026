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

(async () => {
  await client.connect();

  // Check RM-WIRE-001 specifically
  console.log('=== RM-WIRE-001 DATA VERIFICATION ===');
  const r = await client.query(`
    SELECT i.id, i.item_code, i.name, i.sku, i.barcode as item_barcode, i.is_active,
           b.id as bc_id, b.barcode_value, b.entity_type, b.entity_id, b.status as bc_status
    FROM items i
    LEFT JOIN barcodes b ON b.entity_id = i.id AND b.entity_type = 'ITEM' AND b.status = 'ACTIVE'
    WHERE i.item_code = 'RM-WIRE-001'
  `);
  if (r.rows.length === 0) {
    console.log('RM-WIRE-001 NOT FOUND in items table');
  } else {
    const row = r.rows[0];
    console.log(`  Item ID: ${row.id}`);
    console.log(`  Item Code: ${row.item_code}`);
    console.log(`  Name: ${row.name}`);
    console.log(`  SKU: ${row.sku}`);
    console.log(`  items.barcode column: ${row.item_barcode}`);
    console.log(`  Is Active: ${row.is_active}`);
    console.log(`  Registry barcode ID: ${row.bc_id}`);
    console.log(`  Registry barcode_value: ${row.barcode_value}`);
    console.log(`  Registry entity_type: ${row.entity_type}`);
    console.log(`  Registry entity_id matches item_id: ${row.entity_id === row.id}`);
    console.log(`  Registry status: ${row.bc_status}`);

    // Check all barcodes for this item
    const allBc = await client.query(`
      SELECT barcode_value, entity_type, is_primary, status
      FROM barcodes
      WHERE entity_id = $1 AND entity_type = 'ITEM'
      ORDER BY is_primary DESC, created_at
    `, [row.id]);
    console.log(`\n  All barcodes for this item (${allBc.rows.length}):`);
    allBc.rows.forEach(b => console.log(`    ${b.barcode_value} primary=${b.is_primary} status=${b.status}`));
  }

  await client.end();
})();
