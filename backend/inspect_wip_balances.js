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
  const itemsRes = await client.query("SELECT id, item_code, name FROM items WHERE item_code IN ('WIP-ST-001', 'WIP-ST-010', 'WIP-ST-011')");
  console.log('Items:', itemsRes.rows);
  const ids = itemsRes.rows.map(r => r.id);
  if (ids.length > 0) {
    const balances = await client.query("SELECT * FROM inventory_balances WHERE item_id = ANY($1)", [ids]);
    console.log('Balances:', balances.rows.map(b => ({ item_id: b.item_id, warehouse_id: b.warehouse_id, on_hand: b.on_hand, allocated: b.allocated })));
    const ledgers = await client.query("SELECT id, item_id, warehouse_id, transaction_type, reference_type, reference_number, quantity, notes, created_at FROM stock_ledgers WHERE item_id = ANY($1) ORDER BY created_at DESC LIMIT 20", [ids]);
    console.log('Ledgers:', ledgers.rows);
  }
  await client.end();
}
run().catch(console.error);
