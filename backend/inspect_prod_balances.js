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
    SELECT id, warehouse_code, name, is_active
    FROM warehouses
    WHERE warehouse_code ILIKE '%ST%' OR warehouse_code ILIKE '%PROD%' OR warehouse_code ILIKE '%SPI%'
  `);
  console.log('Production Warehouses:', whRes.rows);

  const whIds = whRes.rows.map(w => w.id);
  const balRes = await client.query(`
    SELECT ib.id, ib.warehouse_id, w.warehouse_code, w.name as warehouse_name, ib.item_id, i.item_code, i.name as item_name, ib.on_hand
    FROM inventory_balances ib
    JOIN warehouses w ON w.id = ib.warehouse_id
    JOIN items i ON i.id = ib.item_id
    WHERE ib.warehouse_id = ANY($1) AND ib.on_hand > 0
  `, [whIds]);
  console.log('Current non-zero balances on production warehouses:', balRes.rows);

  const slRes = await client.query(`
    SELECT sl.id, sl.reference_type, sl.reference_number, sl.quantity, sl.notes, sl.created_at
    FROM stock_ledger sl
    WHERE sl.warehouse_id = ANY($1)
    ORDER BY sl.created_at DESC
  `, [whIds]);
  console.log('Total stock ledger entries on production warehouses:', slRes.rows.length);
  console.log('Sample stock ledger entries:', slRes.rows.slice(0, 10));

  await client.end();
}
run().catch(console.error);
