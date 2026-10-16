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
  const res = await client.query("SELECT id, item_code, name, wire_size_mm, diameter_mm, department_id FROM items WHERE item_code IN ('WIP-SP-001', 'WIP-SP-002', 'WIP-SW-001')");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
