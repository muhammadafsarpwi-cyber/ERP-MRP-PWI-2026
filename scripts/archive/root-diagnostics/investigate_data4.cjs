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
  
  // 7. Check warehouses columns
  console.log('\n===== 7. Warehouses columns =====');
  const whCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'warehouses' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(whCols.rows, null, 2));
  
  console.log('\n===== 7b. Warehouses =====');
  const whData = await c.query(`
    SELECT id, warehouse_code, name, company_id, status
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
  
  // 11. Check delivery warehouse division (warehouses don't have division_id)
  console.log('\n===== 11. Delivery warehouse info =====');
  const dlvWhDiv = await c.query(`
    SELECT sd.id, sd.delivery_number, sd.sales_order_id, sd.warehouse_id,
           w.warehouse_code
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
  
  // 13. Complete sales order evidence matrix
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
  
  // 14. Check all items with their division_id for the SLD items specifically
  console.log('\n===== 14. All SLD items with full details =====');
  const allSLD = await c.query(`
    SELECT id, item_code, name, division_id, company_id, status, item_type, category_id,
           production_in_item_id, production_out_item_id
    FROM items
    WHERE item_code LIKE 'SLD-%'
    ORDER BY item_code
  `);
  console.log(JSON.stringify(allSLD.rows, null, 2));
  
  // 15. Check if any sales_order has a division_id set through a trigger or something
  console.log('\n===== 15. All sales_orders with all columns =====');
  const allSO = await c.query(`
    SELECT *
    FROM erp_sales.sales_orders
    ORDER BY order_number
  `);
  console.log(JSON.stringify(allSO.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });