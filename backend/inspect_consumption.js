const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });
const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME }
});
async function main() {
  await client.connect();

  const itemsRes = await client.query(`
    SELECT id, item_code, name 
    FROM items 
    WHERE item_code IN ('WIP-SP-010', 'WIP-SP-014', 'WIP-SPL-010', 'WIP-SPL-014')
  `);
  const idMap = new Map(itemsRes.rows.map(r => [r.item_code, r.id]));
  const sp10Id = idMap.get('WIP-SP-010');
  const sp14Id = idMap.get('WIP-SP-014');
  const spl10Id = idMap.get('WIP-SPL-010');

  console.log('=== 1. Stock Ledger for WIP-SP-010 ===');
  const sp10Ledger = await client.query(`
    SELECT transaction_date, transaction_type, direction, quantity, reference_type, reference_number, notes
    FROM stock_ledger
    WHERE item_id = $1
    ORDER BY transaction_date
  `, [sp10Id]);
  console.log(sp10Ledger.rows);

  console.log('\n=== 2. Stock Ledger for WIP-SPL-010 ===');
  const spl10Ledger = await client.query(`
    SELECT transaction_date, transaction_type, direction, quantity, reference_type, reference_number, notes
    FROM stock_ledger
    WHERE item_id = $1
    ORDER BY transaction_date
  `, [spl10Id]);
  console.log(spl10Ledger.rows);

  console.log('\n=== 3. Stock Ledger for WIP-SP-014 (OUT only) ===');
  const sp14Ledger = await client.query(`
    SELECT transaction_date, transaction_type, direction, quantity, reference_type, reference_number, notes
    FROM stock_ledger
    WHERE item_id = $1 AND direction = 'OUT'
    ORDER BY transaction_date
  `, [sp14Id]);
  console.log(sp14Ledger.rows);

  // Check daily production entries producing WIP-SPL-010
  console.log('\n=== 4. Daily Production Entries producing WIP-SPL-010 ===');
  const peRes = await client.query(`
    SELECT id, entry_date, entry_number, output_item_id, produced_qty, rejected_qty, raw_material_item_id, raw_material_consumed_qty, notes
    FROM daily_production_entries
    WHERE output_item_id = $1
  `, [spl10Id]);
  console.log(peRes.rows);

  await client.end();
}
main().catch(console.error);
