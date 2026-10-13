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
  const res = await client.query(`
    SELECT 
      i.item_code,
      i.name as item_name,
      COALESCE(SUM(CASE WHEN sl.reference_type = 'PRODUCTION_ITEM_OPEN_STOCK' OR sl.transaction_type = 'OPENING' THEN sl.quantity ELSE 0 END), 0) as opening,
      COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND sl.transaction_type <> 'OPENING' AND sl.reference_type <> 'PRODUCTION_ITEM_OPEN_STOCK' THEN sl.quantity ELSE 0 END), 0) as total_in,
      COALESCE(SUM(CASE WHEN sl.direction = 'OUT' THEN sl.quantity ELSE 0 END), 0) as total_out,
      COALESCE(SUM(CASE WHEN sl.direction = 'IN' THEN sl.quantity ELSE -sl.quantity END), 0) as closing
    FROM items i
    LEFT JOIN stock_ledger sl ON sl.item_id = i.id
    WHERE i.item_code = 'WIP-SW-003'
    GROUP BY i.item_code, i.name
  `);
  console.log('Production Inventory Report summary for WIP-SW-003:');
  console.table(res.rows);
  await client.end();
}

run();
