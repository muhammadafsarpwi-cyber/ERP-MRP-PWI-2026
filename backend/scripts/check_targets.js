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
  const res = await client.query("SELECT * FROM machine_targets WHERE item_id IN ('678b514c-444c-4263-9c11-0d3eb6497d23', '4dc93195-3e44-4428-9b57-a20eb47953f5')");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
