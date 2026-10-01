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
  
  // Check all tables in erp_sales schema
  console.log('\n===== All tables in erp_sales schema =====');
  const tables = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'erp_sales'
    ORDER BY table_name
  `);
  console.log(JSON.stringify(tables.rows, null, 2));
  
  // 13. Complete sales order evidence matrix
  console.log('\n===== Complete sales order evidence matrix =====');
  const soMatrix = await c.query(`
    SELECT so.id, so.order_number, so.customer_id, so.company_id, so.division_id, so.quotation_id, so.status, so.order_date,
           c.customer_code, c.name as customer_name,
           q.quotation_number,
           sd.delivery_number,
           si.invoice_no,
           sr.return_number
    FROM erp_sales.sales_orders so
    LEFT JOIN customers c ON c.id = so.customer_id
    LEFT JOIN erp_sales.quotations q ON q.id = so.quotation_id
    LEFT JOIN erp_sales.sales_deliveries sd ON sd.sales_order_id = so.id
    LEFT JOIN erp_sales.sales_invoices si ON si.sales_order_id = so.id
    LEFT JOIN erp_sales.sales_returns sr ON sr.sales_order_id = so.id
    ORDER BY so.order_number
  `);
  console.log(JSON.stringify(soMatrix.rows, null, 2));
  
  // 14. Check all SLD items with full details
  console.log('\n===== All SLD items with full details =====');
  const allSLD = await c.query(`
    SELECT id, item_code, name, division_id, company_id, status, item_type, category_id,
           production_in_item_id, production_out_item_id
    FROM items
    WHERE item_code LIKE 'SLD-%'
    ORDER BY item_code
  `);
  console.log(JSON.stringify(allSLD.rows, null, 2));
  
  // 15. All sales_orders with all columns
  console.log('\n===== All sales_orders with all columns =====');
  const allSO = await c.query(`
    SELECT *
    FROM erp_sales.sales_orders
    ORDER BY order_number
  `);
  console.log(JSON.stringify(allSO.rows, null, 2));
  
  // Check sales_invoice_lines table in public schema
  console.log('\n===== Check sales_invoice_items in public =====');
  const silPub = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name ILIKE '%sales%invoice%line%' OR table_name ILIKE '%sales%invoice%item%'
    ORDER BY table_name
  `);
  console.log(JSON.stringify(silPub.rows, null, 2));
  
  // Check sales_return_lines in public
  console.log('\n===== Check sales_return_lines in public =====');
  const srlPub = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name ILIKE '%sales%return%line%' OR table_name ILIKE '%sales%return%item%'
    ORDER BY table_name
  `);
  console.log(JSON.stringify(srlPub.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });