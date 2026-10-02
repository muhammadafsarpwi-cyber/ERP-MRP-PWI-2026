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

  const whRes = await client.query(`
    SELECT id, warehouse_code, name
    FROM warehouses
    WHERE warehouse_code ILIKE 'SPI-%' OR warehouse_code ILIKE '%PROD%' OR name ILIKE '%Production Department%'
  `);
  console.log('Production floor warehouses:', whRes.rows);
  const whIds = whRes.rows.map(w => w.id);

  // 1. Reset on_hand, reserved, available to 0 for all balances in production floor warehouses
  const resetBal = await client.query(`
    UPDATE inventory_balances
    SET on_hand = 0, reserved = 0, available = 0, updated_at = NOW()
    WHERE warehouse_id = ANY($1)
  `, [whIds]);
  console.log(`Reset ${resetBal.rowCount} inventory balances to 0 for production floor warehouses.`);

  // Verify
  const verifyRes = await client.query(`
    SELECT ib.id, w.warehouse_code, i.item_code, ib.on_hand
    FROM inventory_balances ib
    JOIN warehouses w ON w.id = ib.warehouse_id
    JOIN items i ON i.id = ib.item_id
    WHERE ib.warehouse_id = ANY($1) AND ib.on_hand > 0
  `, [whIds]);
  console.log('Remaining non-zero balances on production floors:', verifyRes.rows.length);

  await client.end();
  console.log('Done!');
}

run().catch(console.error);
