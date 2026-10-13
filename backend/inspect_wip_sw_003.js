const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false, servername: process.env.DB_SSL_SERVERNAME },
});

async function run() {
  await client.connect();

  const items = await client.query(`
    SELECT id, item_code, name, department_id, division_id FROM items 
    WHERE item_code IN ('WIP-SW-003', 'WIP-SP-009') OR name ILIKE '%125-300*17 Inner Butted%'
  `);
  console.log('Items matching:');
  console.table(items.rows);

  console.log('Row c66e6e30-7785-48bd-a44e-c23aea33f0ff item details:');
  const row = await client.query(`
    SELECT sl.*, i.item_code, i.name as item_name 
    FROM stock_ledger sl 
    JOIN items i ON i.id = sl.item_id 
    WHERE sl.id = 'c66e6e30-7785-48bd-a44e-c23aea33f0ff'
  `);
  console.table(row.rows);

  await client.end();
}

run().catch(console.error);
