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
  const res = await client.query(`
    SELECT id, item_code, name, processes, production_in_item_id
    FROM items
    WHERE item_code IN ('WIP-SP-009', 'WIP-SP-003', 'WIP-SP-004', 'WIP-SP-002', 'WIP-SPL-001', 'WIP-SPL-002')
    ORDER BY item_code
  `);
  for (const row of res.rows) {
    console.log(`=== ${row.item_code} (${row.name}) ===`);
    console.log('processes:', JSON.stringify(row.processes, null, 2));
    console.log('production_in_item_id:', row.production_in_item_id);
  }
  await client.end();
}
main().catch(console.error);
