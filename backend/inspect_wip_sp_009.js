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

  console.log('=== Balances for WIP-SP-009 ===');
  const bal = await client.query(`
    SELECT ib.id, ib.warehouse_id, w.warehouse_code, ib.on_hand, ib.available
    FROM inventory_balances ib
    LEFT JOIN warehouses w ON w.id = ib.warehouse_id
    WHERE ib.item_id = 'c1000000-0000-0000-0000-000000000012'
  `);
  console.table(bal.rows);

  console.log('=== Stock ledger for WIP-SP-009 ===');
  const ledger = await client.query(`
    SELECT sl.id, sl.created_at, sl.transaction_type, sl.direction, sl.quantity, sl.reference_number, w.warehouse_code
    FROM stock_ledger sl
    LEFT JOIN warehouses w ON w.id = sl.warehouse_id
    WHERE sl.item_id = 'c1000000-0000-0000-0000-000000000012'
  `);
  console.table(ledger.rows);

  await client.end();
}

run().catch(console.error);
