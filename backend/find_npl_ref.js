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

  const NPL_DEPT_ID = 'd3000000-0000-0000-0000-000000000007';

  // 1. Check sections
  const sec = await client.query(`SELECT * FROM sections WHERE id IN (SELECT section_id FROM departments WHERE id = $1)`, [NPL_DEPT_ID]);
  console.log('Sections of Nipple Plating:', sec.rows);

  // 2. Check item routings or BOM
  const bomCheck = await client.query(`
    SELECT b.id, b.item_id, it.item_code, b.name, b.department_id, b.status 
    FROM boms b
    JOIN items it ON it.id = b.item_id
    WHERE it.item_code = 'SPI-FG-SPK-004' OR b.department_id = $1
  `, [NPL_DEPT_ID]);
  console.log('BOM for SPI-FG-SPK-004 or NPL dept:', bomCheck.rows);

  // 3. Check BOM components
  const bomCompCheck = await client.query(`
    SELECT bc.id, bc.bom_id, bc.component_item_id, it.item_code, bc.quantity, bc.department_id
    FROM bom_components bc
    JOIN items it ON it.id = bc.component_item_id
    WHERE bc.bom_id = ANY($1::uuid[])
  `, [bomCheck.rows.map(b => b.id)]);
  console.log('BOM components:', bomCompCheck.rows);

  // 4. Check routings or operations
  const opCheck = await client.query(`
    SELECT ro.* FROM routing_operations ro
    WHERE ro.department_id = $1
  `, [NPL_DEPT_ID]);
  console.log('Routing operations in NPL dept:', opCheck.rows);

  // 5. Check item master routing / production_in
  const itLink = await client.query(`
    SELECT item_code, name, department_id, production_in_item_id, routing_code
    FROM items 
    WHERE item_code IN ('SPI-FG-SPK-004', 'FG-NP-004', 'WIP-SPL-005', 'WIP-SPL-006')
  `);
  console.log('Items link detail:', itLink.rows);

  await client.end();
}
main().catch(console.error);
