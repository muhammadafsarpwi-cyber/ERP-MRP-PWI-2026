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
  
  // 6. Check production_orders linked to sales_orders (if any)
  console.log('\n===== 6. Production orders columns =====');
  const poCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'production_orders' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(poCols.rows, null, 2));
  
  console.log('\n===== 6b. Production orders =====');
  const poData = await c.query(`
    SELECT id, order_number, company_id, division_id, created_at, status, sales_order_id
    FROM production_orders
    WHERE sales_order_id IS NOT NULL
    ORDER BY created_at DESC
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
  
  // 10. Check SLD items details
  console.log('\n===== 10. SLD items details =====');
  const sldItems = await c.query(`
    SELECT id, item_code, name, division_id, company_id, status, item_type, category_id
    FROM items
    WHERE item_code LIKE 'SLD-%'
    ORDER BY item_code
  `);
  console.log(JSON.stringify(sldItems.rows, null, 2));
  
  // 11. Check delivery warehouse division
  console.log('\n===== 11. Delivery warehouse divisions =====');
  const dlvWhDiv = await c.query(`
    SELECT sd.id, sd.delivery_number, sd.sales_order_id, sd.warehouse_id,
           w.warehouse_code, w.division_id as wh_division_id
    FROM erp_sales.sales_deliveries sd
    LEFT JOIN warehouses w ON w.id = sd.warehouse_id
    ORDER BY sd.delivery_date DESC
  `);
  console.log(JSON.stringify(dlvWhDiv.rows, null, 2));
  
  // 12. Check invoice lines
  console.log('\n===== 12. Sales invoice lines =====');
  const silData = await c.query(`
    SELECT sil.id, sil.invoice_id, sil.item_id, sil.quantity, sil.unit_price,
           si.invoice_no, si.sales_order_id, si.customer_id,
           i.item_code, i.name as item_name, i.division_id as item_division_id
    FROM erp_sales.sales_invoice_lines sil
    JOIN erp_sales.sales_invoices si ON si.id = sil.invoice_id
    LEFT JOIN items i ON i.id = sil.item_id
    ORDER BY si.invoice_no, sil.id
  `);
  console.log(JSON.stringify(silData.rows, null, 2));
  
  // 13. Check if sales_orders have a division_id from any source
  console.log('\n===== 13. Complete sales order evidence matrix =====');
  const soMatrix = await c.query(`
    SELECT so.id, so.order_number, so.customer_id, so.company_id, so.division_id, so.quotation_id, so.status, so.order_date,
           c.customer_code, c.name as customer_name,
           q.quotation_number,
           sd.delivery_number,
           si.invoice_no,
           sr.return_number,
           w.division_id as delivery_wh_division_id,
           w.warehouse_code
    FROM erp_sales.sales_orders so
    LEFT JOIN customers c ON c.id = so.customer_id
    LEFT JOIN erp_sales.quotations q ON q.id = so.quotation_id
    LEFT JOIN erp_sales.sales_deliveries sd ON sd.sales_order_id = so.id
    LEFT JOIN warehouses w ON w.id = sd.warehouse_id
    LEFT JOIN erp_sales.sales_invoices si ON si.sales_order_id = so.id
    LEFT JOIN erp_sales.sales_returns sr ON sr.sales_order_id = so.id
    ORDER BY so.order_number
  `);
  console.log(JSON.stringify(soMatrix.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });