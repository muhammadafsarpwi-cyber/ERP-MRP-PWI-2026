const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });
const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME }
});
async function main() {
  await client.connect();

  // Check items table directly
  const items = await client.query("SELECT id, item_code, name, wire_size_mm, diameter_mm FROM items WHERE item_code IN ('WIP-SP-001', 'WIP-SP-002')");
  console.log('Items table:', items.rows);

  // Check machine_targets joined with items
  const targets = await client.query(`
    SELECT mt.id, mt.machine_id, mt.item_id, i.item_code, i.name, i.wire_size_mm, i.diameter_mm
    FROM machine_targets mt
    LEFT JOIN items i ON i.id = mt.item_id
    WHERE i.item_code IN ('WIP-SP-001', 'WIP-SP-002')
  `);
  console.log('Targets joined with items:', targets.rows.slice(0, 5));

  // Check if there is an item with 2.87
  const with287 = await client.query("SELECT id, item_code, name, wire_size_mm, diameter_mm FROM items WHERE wire_size_mm = 2.87 OR diameter_mm = 2.87");
  console.log('Items with 2.87:', with287.rows);

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
