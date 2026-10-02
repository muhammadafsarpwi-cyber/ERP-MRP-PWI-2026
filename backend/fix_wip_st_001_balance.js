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

  const updateRes = await client.query(`
    UPDATE inventory_balances
    SET on_hand = 6481.0000, available = 6481.0000, updated_at = NOW()
    WHERE item_id = 'c1000000-0000-0000-0000-000000000001'
      AND warehouse_id = '2ec20775-616c-4c6e-818e-1f76912d6dfa'
  `);
  console.log(`Updated ${updateRes.rowCount} balance record.`);

  const verify = await client.query(`
    SELECT ib.id, i.item_code, i.name, ib.on_hand
    FROM inventory_balances ib
    JOIN items i ON i.id = ib.item_id
    WHERE ib.warehouse_id = '2ec20775-616c-4c6e-818e-1f76912d6dfa' AND ib.on_hand > 0
    ORDER BY i.item_code ASC
  `);
  console.log('ST Production Department non-zero balances:', verify.rows);

  await client.end();
}

run().catch(console.error);
