const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'backend', '.env');
const out = {};
for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
  if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const c = new Client({
  host: out.DB_HOST, port: Number(out.DB_PORT), user: out.DB_USERNAME,
  password: out.DB_PASSWORD, database: out.DB_DATABASE, ssl: { rejectUnauthorized: false },
});

async function run() {
  await c.connect();

  console.log('=== Checking Sales Orders in erp_sales.sales_orders ===');
  const orders = await c.query(`
    SELECT id, order_number, order_date, created_at, status, total_amount, customer_id
    FROM erp_sales.sales_orders
    ORDER BY created_at ASC
  `);
  console.log(`Total orders found: ${orders.rows.length}`);
  orders.rows.forEach(r => {
    console.log(`ID: ${r.id} | Order#: ${r.order_number} | Date: ${r.order_date} | Created: ${r.created_at} | Status: ${r.status}`);
  });

  console.log('=== Checking FK references to sales_orders ===');
  const refs = await c.query(`
    SELECT
      tc.table_schema,
      tc.table_name,
      kcu.column_name,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE ccu.table_schema = 'erp_sales' AND ccu.table_name = 'sales_orders';
  `);
  console.log('Tables referencing sales_orders:', refs.rows);

  await c.end();
}

run().catch(console.error);
