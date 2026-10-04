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
  
  // Check if erp_sales schema exists
  console.log('\n===== Schemas =====');
  const schemas = await c.query(`
    SELECT schema_name
    FROM information_schema.schemata
    ORDER BY schema_name
  `);
  console.log(JSON.stringify(schemas.rows, null, 2));
  
  // Check tables in erp_sales schema
  console.log('\n===== Tables in erp_sales schema =====');
  const erpSalesTables = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'erp_sales'
    ORDER BY table_name
  `);
  console.log(JSON.stringify(erpSalesTables.rows, null, 2));
  
  // Check sales_orders in erp_sales schema
  console.log('\n===== sales_orders columns in erp_sales =====');
  const soCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'erp_sales' AND table_name = 'sales_orders'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(soCols.rows, null, 2));
  
  // Check sales_orders data
  console.log('\n===== sales_orders data in erp_sales =====');
  const soData = await c.query(`
    SELECT id, order_number, customer_id, company_id, division_id, order_date, status, total_amount
    FROM erp_sales.sales_orders
    ORDER BY order_date DESC
  `);
  console.log(JSON.stringify(soData.rows, null, 2));
  
  // Check sales_order_items in erp_sales schema
  console.log('\n===== sales_order_items columns in erp_sales =====');
  const soiCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'erp_sales' AND table_name = 'sales_order_items'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(soiCols.rows, null, 2));
  
  console.log('\n===== sales_order_items data in erp_sales =====');
  const soiData = await c.query(`
    SELECT id, order_id, item_id, quantity, unit_price, uom_id
    FROM erp_sales.sales_order_items
    ORDER BY order_id
  `);
  console.log(JSON.stringify(soiData.rows, null, 2));
  
  // Check items with division_id
  console.log('\n===== items with division_id =====');
  const itemsDiv = await c.query(`
    SELECT id, item_code, name, division_id, company_id, status
    FROM items
    ORDER BY item_code
  `);
  console.log(JSON.stringify(itemsDiv.rows, null, 2));
  
  // Check customers
  console.log('\n===== customers =====');
  const custs = await c.query(`
    SELECT id, customer_code, name, company_id, status
    FROM customers
    WHERE status = 'ACTIVE'
    ORDER BY customer_code
  `);
  console.log(JSON.stringify(custs.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });