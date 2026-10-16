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
  const routings = await client.query(`
    SELECT r.id, r.routing_code, r.product_id, ro.id as op_id, ro.operation_name
    FROM production_routings r
    LEFT JOIN routing_operations ro ON ro.routing_id = r.id
    WHERE r.product_id IN ('678b514c-444c-4263-9c11-0d3eb6497d23', '4dc93195-3e44-4428-9b57-a20eb47953f5', 'e72d30e1-e0da-447c-af1e-6a57d9aad0af')
  `);
  console.log('Routings:', routings.rows);

  const inputs = await client.query(`
    SELECT roi.*, i.item_code, i.name, i.wire_size_mm, i.diameter_mm
    FROM routing_operation_inputs roi
    LEFT JOIN items i ON i.id = roi.item_id
    WHERE roi.operation_id IN (SELECT ro.id FROM routing_operations ro WHERE ro.routing_id IN (SELECT r.id FROM production_routings r WHERE r.product_id IN ('678b514c-444c-4263-9c11-0d3eb6497d23', '4dc93195-3e44-4428-9b57-a20eb47953f5', 'e72d30e1-e0da-447c-af1e-6a57d9aad0af')))
  `);
  console.log('Routing inputs:', inputs.rows);

  await client.end();
}
main().catch(err => { console.error(err); process.exit(1); });
