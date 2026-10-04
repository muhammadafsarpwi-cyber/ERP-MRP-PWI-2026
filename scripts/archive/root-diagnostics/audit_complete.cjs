const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env');
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
  console.log('Connected to database');
  
  // Get ALL sales_order_items with item division
  console.log('\n===== ALL sales_order_items with item division =====');
  const soiWithDiv = await c.query(`
    SELECT soi.id, soi.sales_order_id, soi.line_number, soi.item_id, soi.quantity, soi.unit_price,
           i.item_code, i.name as item_name, i.division_id as item_division_id,
           so.order_number, so.customer_id, so.company_id, so.division_id as so_division_id, so.status,
           c.customer_code, c.name as customer_name
    FROM erp_sales.sales_order_items soi
    JOIN erp_sales.sales_orders so ON so.id = soi.sales_order_id
    LEFT JOIN items i ON i.id = soi.item_id
    LEFT JOIN customers c ON c.id = so.customer_id
    ORDER BY so.order_number, soi.line_number
  `);
  console.log(JSON.stringify(soiWithDiv.rows, null, 2));
  
  // Summary by sales order
  console.log('\n===== Summary by Sales Order =====');
  const summary = await c.query(`
    SELECT so.id, so.order_number, so.customer_id, so.company_id, so.division_id, so.status, so.order_date,
           COUNT(soi.id) as line_count,
           STRING_AGG(i.item_code, ', ' ORDER BY soi.line_number) as item_codes,
           STRING_AGG(COALESCE(i.division_id::text, 'NULL'), ', ' ORDER BY soi.line_number) as item_divisions,
           STRING_AGG(i.name, ', ' ORDER BY soi.line_number) as item_names
    FROM erp_sales.sales_orders so
    LEFT JOIN erp_sales.sales_order_items soi ON soi.sales_order_id = so.id
    LEFT JOIN items i ON i.id = soi.item_id
    GROUP BY so.id, so.order_number, so.customer_id, so.company_id, so.division_id, so.status, so.order_date
    ORDER BY so.order_number
  `);
  console.log(JSON.stringify(summary.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });