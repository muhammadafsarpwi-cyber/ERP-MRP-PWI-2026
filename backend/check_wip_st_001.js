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

  console.log('--- All stock ledger rows for WIP-ST-001 (c1000000-0000-0000-0000-000000000001) ---');
  const sl = await client.query(`
    SELECT sl.id, sl.reference_number, sl.transaction_type, sl.reference_type, sl.quantity, sl.direction, sl.warehouse_id, sl.created_at
    FROM stock_ledger sl
    WHERE sl.item_id = 'c1000000-0000-0000-0000-000000000001'
    ORDER BY sl.created_at DESC
  `);
  console.log(sl.rows);

  console.log('--- Checking balance row directly ---');
  const bal = await client.query(`
    SELECT * FROM inventory_balances
    WHERE item_id = 'c1000000-0000-0000-0000-000000000001' AND warehouse_id = '2ec20775-616c-4c6e-818e-1f76912d6dfa'
  `);
  console.log(bal.rows);

  await client.end();
}

run().catch(console.error);
