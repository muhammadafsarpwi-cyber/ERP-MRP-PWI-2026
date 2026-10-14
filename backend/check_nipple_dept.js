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

  const itemCheck = await client.query(`
    SELECT i.id, i.item_code, i.name, i.department_id, d.name as dept_name, d.status as dept_status, i.item_type 
    FROM items i
    LEFT JOIN departments d ON d.id = i.department_id
    WHERE i.department_id = 'd3000000-0000-0000-0000-000000000007'
       OR i.item_code IN ('SPI-FG-SPK-004', 'FG-NP-004', 'WIP-SPL-005', 'WIP-SPL-006')
  `);
  console.log('Items related to Nipple Plating or in this FG:');
  console.table(itemCheck.rows);

  await client.end();
}
main().catch(console.error);
