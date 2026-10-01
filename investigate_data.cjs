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
  
  // 1. Check quotations linked to sales_orders
  console.log('\n===== 1. Quotations linked to sales_orders =====');
  const qLinked = await c.query(`
    SELECT q.id, q.quotation_number, q.customer_id, q.company_id, q.status, q.quotation_date,
           so.id as so_id, so.order_number, so.quotation_id as so_quotation_id
    FROM erp_sales.quotations q
    LEFT JOIN erp_sales.sales_orders so ON so.quotation_id = q.id
    ORDER BY q.quotation_date DESC
  `);
  console.log(JSON.stringify(qLinked.rows, null, 2));
  
  // 2. Check quotation items with division
  console.log('\n===== 2. Quotation items with item division =====');
  const qiDiv = await c.query(`
    SELECT qi.id, qi.quotation_id, qi.line_number, qi.item_id, qi.quantity,
           q.quotation_number, q.customer_id, q.company_id, q.status,
           i.item_code, i.name as item_name, i.division_id as item_division_id
    FROM erp_sales.quotation_items qi
    JOIN erp_sales.quotations q ON q.id = qi.quotation_id
    LEFT JOIN items i ON i.id = qi.item_id
    ORDER BY qi.quotation_id, qi.line_number
  `);
  console.log(JSON.stringify(qiDiv.rows, null, 2));
  
  // 3. Check sales_deliveries linked to sales_orders
  console.log('\n===== 3. Sales deliveries linked to sales_orders =====');
  const sdLinked = await c.query(`
    SELECT sd.id, sd.delivery_number, sd.sales_order_id, sd.customer_id, sd.company_id,
           sd.status, sd.delivery_date, sd.warehouse_id,
           so.order_number
    FROM erp_sales.sales_deliveries sd
    LEFT JOIN erp_sales.sales_orders so ON so.id = sd.sales_order_id
    ORDER BY sd.delivery_date DESC
  `);
  console.log(JSON.stringify(sdLinked.rows, null, 2));
  
  // 4. Check sales_invoices linked to sales_orders
  console.log('\n===== 4. Sales invoices linked to sales_orders =====');
  const siLinked = await c.query(`
    SELECT si.id, si.invoice_no, si.sales_order_id, si.customer_id, si.company_id,
           si.status, si.invoice_date,
           so.order_number
    FROM erp_sales.sales_invoices si
    LEFT JOIN erp_sales.sales_orders so ON so.id = si.sales_order_id
    ORDER BY si.invoice_date DESC
  `);
  console.log(JSON.stringify(siLinked.rows, null, 2));
  
  // 5. Check sales_returns linked to sales_orders
  console.log('\n===== 5. Sales returns linked to sales_orders =====');
  const srLinked = await c.query(`
    SELECT sr.id, sr.return_number, sr.sales_order_id, sr.customer_id, sr.company_id,
           sr.status, sr.return_date, sr.warehouse_id,
           so.order_number
    FROM erp_sales.sales_returns sr
    LEFT JOIN erp_sales.sales_orders so ON so.id = sr.sales_order_id
    ORDER BY sr.return_date DESC
  `);
  console.log(JSON.stringify(srLinked.rows, null, 2));
  
  // 6. Check production_orders linked to sales_orders (if any)
  console.log('\n===== 6. Production orders =====');
  const poData = await c.query(`
    SELECT id, order_number, company_id, division_id, order_date, status, sales_order_id
    FROM production_orders
    WHERE sales_order_id IS NOT NULL
    ORDER BY order_date DESC
  `);
  console.log(JSON.stringify(poData.rows, null, 2));
  
  // 7. Check warehouses and their divisions
  console.log('\n===== 7. Warehouses =====');
  const whData = await c.query(`
    SELECT id, warehouse_code, name, company_id, division_id, status
    FROM warehouses
    WHERE status = 'ACTIVE'
    ORDER BY warehouse_code
  `);
  console.log(JSON.stringify(whData.rows, null, 2));
  
  // 8. Check stores and their divisions
  console.log('\n===== 8. Stores =====');
  const stData = await c.query(`
    SELECT id, store_code, store_name, company_id, division_id, status
    FROM stores
    WHERE status = 'ACTIVE'
    ORDER BY store_code
  `);
  console.log(JSON.stringify(stData.rows, null, 2));
  
  // 9. Check customers with full details
  console.log('\n===== 9. Customers =====');
  const custData = await c.query(`
    SELECT id, customer_code, name, company_id, status, customer_category, customer_group
    FROM customers
    WHERE status = 'ACTIVE'
    ORDER BY customer_code
  `);
  console.log(JSON.stringify(custData.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });