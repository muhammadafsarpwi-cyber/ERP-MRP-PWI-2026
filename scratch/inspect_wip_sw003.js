const { Client } = require('pg');
require('dotenv').config({ path: 'd:/ERP-MRP-PWI-2026/backend/.env' });
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  await client.connect();
  const itemRes = await client.query("SELECT id, item_code, name FROM items WHERE item_code = 'WIP-SW-003'");
  const item = itemRes.rows[0];
  console.log('Item:', item);
  const ledgerRes = await client.query(
    "SELECT id, transaction_type, reference_type, reference_id, reference_number, quantity, direction, transaction_date, created_at FROM stock_ledger WHERE item_id = $1 ORDER BY transaction_date ASC, created_at ASC",
    [item.id]
  );
  console.log('Stock Ledger Rows (' + ledgerRes.rows.length + '):');
  console.table(ledgerRes.rows);

  // Also check what production_item_open_stock or inventory_balances has
  const balRes = await client.query("SELECT * FROM inventory_balances WHERE item_id = $1", [item.id]);
  console.log('Inventory Balance:');
  console.table(balRes.rows);

  const openRes = await client.query("SELECT * FROM production_item_open_stocks WHERE item_id = $1", [item.id]);
  console.log('Production Item Open Stock:');
  console.table(openRes.rows);

  await client.end();
}

run().catch(console.error);
