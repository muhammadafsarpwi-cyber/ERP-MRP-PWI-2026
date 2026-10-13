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
async function test() {
  await client.connect();
  const nipplePackingDeptId = 'fd474329-e796-4343-831b-f95a9add41f0';
  const spokePlatingDeptId = 'd3000000-0000-0000-0000-000000000006';

  const sql = `
    SELECT count(*), item_type, status
    FROM items
    WHERE department_id = $1
    GROUP BY item_type, status
  `;
  const sp = await client.query(sql, [spokePlatingDeptId]);
  console.log('Spoke Plating by type and status:');
  console.table(sp.rows);

  const sample = await client.query('SELECT id, item_code, name, item_type, processes, production_in_item_id, production_in_item_id_2, production_in_item_id_3, production_out_item_id, created_at, updated_at FROM items WHERE id = $1', ['e72d30e1-e0da-447c-af1e-6a57d9aad0af']);
  console.log('WIP-SPL-001 details:');
  console.log(JSON.stringify(sample.rows[0], null, 2));

  await client.end();
}
test().catch(console.error);
