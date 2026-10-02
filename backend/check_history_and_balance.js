const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  ssl: {
    rejectUnauthorized: false,
    servername: process.env.DB_SSL_SERVERNAME,
  },
});

async function run() {
  await client.connect();

  console.log('--- 1. Searching stock_ledger for POS ---');
  const sl = await client.query(`
    SELECT sl.id, sl.reference_number, sl.reference_type, sl.transaction_type, sl.quantity, sl.notes, sl.created_at,
           i.item_code, i.name as item_name, w.warehouse_code, w.name as warehouse_name
    FROM stock_ledger sl
    LEFT JOIN items i ON i.id = sl.item_id
    LEFT JOIN warehouses w ON w.id = sl.warehouse_id
    WHERE sl.reference_number ILIKE '%POS%' OR sl.reference_type = 'PRODUCTION_ITEM_OPEN_STOCK'
    ORDER BY sl.created_at DESC
    LIMIT 20
  `);
  console.log('POS / PRODUCTION_ITEM_OPEN_STOCK records found:', sl.rows.length);
  console.log(JSON.stringify(sl.rows, null, 2));

  console.log('\n--- 2. Checking inventory_balances for ST department items (WIP-ST-001, WIP-ST-005, WIP-ST-003, WIP-ST-004) ---');
  const bal = await client.query(`
    SELECT ib.id, ib.warehouse_id, w.warehouse_code, w.name as warehouse_name, i.item_code, i.name as item_name, ib.on_hand
    FROM inventory_balances ib
    JOIN items i ON i.id = ib.item_id
    JOIN warehouses w ON w.id = ib.warehouse_id
    WHERE i.item_code IN ('WIP-ST-001', 'WIP-ST-003', 'WIP-ST-004', 'WIP-ST-005')
  `);
  console.log(JSON.stringify(bal.rows, null, 2));

  console.log('\n--- 3. Checking recent 10 stock_ledger entries overall ---');
  const recent = await client.query(`
    SELECT sl.id, sl.reference_number, sl.reference_type, sl.transaction_type, sl.quantity, sl.created_at,
           i.item_code, w.warehouse_code
    FROM stock_ledger sl
    LEFT JOIN items i ON i.id = sl.item_id
    LEFT JOIN warehouses w ON w.id = sl.warehouse_id
    ORDER BY sl.created_at DESC
    LIMIT 10
  `);
  console.log(JSON.stringify(recent.rows, null, 2));

  await client.end();
}

run().catch(console.error);
