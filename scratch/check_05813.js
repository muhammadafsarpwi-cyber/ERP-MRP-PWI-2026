const fs = require('fs');
const path = require('path');
const { Client } = require(path.resolve(__dirname, '../backend/node_modules/pg'));
const envContent = fs.readFileSync(path.resolve(__dirname, '../backend/.env'), 'utf8');
const env = {};
envContent.split('\n').forEach(l => {
  const p = l.split('=');
  if (p.length >= 2 && !p[0].startsWith('#')) env[p[0].trim()] = p.slice(1).join('=').trim();
});

async function run() {
  const c = new Client({ host: env.DB_HOST, port: env.DB_PORT, user: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_DATABASE, ssl: { rejectUnauthorized: false } });
  await c.connect();

  console.log('--- PRODUCTION ENTRIES FOR 05813 ---');
  const res = await c.query("SELECT id, remarks, actual_quantity, created_at, is_active FROM production_entries WHERE remarks ILIKE $1", ["%05813%"]);
  console.log(res.rows);

  console.log('--- PRODUCTION ENTRY ITEMS FOR 05813 ---');
  const res2 = await c.query(`
    SELECT pei.id, pei.item_id, pei.actual_quantity, i.item_code, i.name, pe.remarks
    FROM production_entry_items pei
    JOIN production_entries pe ON pe.id = pei.production_entry_id
    JOIN items i ON i.id = pei.item_id
    WHERE pe.remarks ILIKE $1
  `, ["%05813%"]);
  console.log(res2.rows);

  console.log('--- ALL OPEN STOCK RECORDS ---');
  const res3 = await c.query(`
    SELECT sl.id, sl.transaction_type, sl.quantity, sl.reference_type, sl.reference_id, sl.created_at, i.item_code
    FROM stock_ledger sl
    JOIN items i ON i.id = sl.item_id
    WHERE sl.reference_type = 'OPENING_STOCK' OR sl.transaction_type = 'OPENING_BALANCE'
    ORDER BY sl.created_at DESC LIMIT 10
  `);
  console.log(res3.rows);

  console.log('--- SALES ORDER 05813 ITEMS ---');
  const res4 = await c.query(`
    SELECT soi.id, soi.sales_order_id, soi.item_id, soi.quantity, soi.package_quantity, i.item_code, i.name
    FROM erp_sales.sales_order_items soi
    JOIN items i ON i.id = soi.item_id
    JOIN erp_sales.sales_orders so ON so.id = soi.sales_order_id
    WHERE so.order_number ILIKE '%05813%'
  `);
  console.log(res4.rows);

  await c.end();
}

run().catch(console.error);
