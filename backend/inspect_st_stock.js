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
  const res = await client.query(`
    SELECT sl.id, sl.item_id, i.item_code, sl.quantity, sl.reference_type, sl.reference_number, sl.notes, sl.created_at
    FROM stock_ledger sl
    JOIN items i ON i.id = sl.item_id
    WHERE sl.warehouse_id = '2ec20775-616c-4c6e-818e-1f76912d6dfa'
    ORDER BY sl.created_at DESC
  `);
  console.log('Stock ledger entries for ST Production Department:', res.rows);

  const balRes = await client.query(`
    SELECT ib.id, ib.item_id, i.item_code, i.name, ib.on_hand
    FROM inventory_balances ib
    JOIN items i ON i.id = ib.item_id
    WHERE ib.warehouse_id = '2ec20775-616c-4c6e-818e-1f76912d6dfa'
  `);
  console.log('Inventory balances for ST Production Department:', balRes.rows);

  await client.end();
}
run().catch(console.error);
