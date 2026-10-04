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
  
  // 1. sales_orders columns
  console.log('\n===== sales_orders columns =====');
  const soCols = await c.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'sales_orders' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(soCols.rows, null, 2));
  
  // 2. sales_order_items columns
  console.log('\n===== sales_order_items columns =====');
  const soiCols = await c.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'sales_order_items' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(soiCols.rows, null, 2));
  
  // 3. items columns (especially division_id)
  console.log('\n===== items columns (division-related) =====');
  const itemCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'items' AND table_schema = 'public'
      AND column_name LIKE '%division%' OR column_name IN ('id', 'item_code', 'name', 'company_id')
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(itemCols.rows, null, 2));
  
  // 4. divisions master
  console.log('\n===== divisions master =====');
  const divs = await c.query(`
    SELECT id, division_code, name, company_id, status
    FROM divisions
    WHERE status = 'ACTIVE'
    ORDER BY division_code
  `);
  console.log(JSON.stringify(divs.rows, null, 2));
  
  // 5. companies
  console.log('\n===== companies =====');
  const comps = await c.query(`
    SELECT id, company_code, name, status
    FROM companies
    ORDER BY company_code
  `);
  console.log(JSON.stringify(comps.rows, null, 2));
  
  // 6. customers
  console.log('\n===== customers columns =====');
  const custCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'customers' AND table_schema = 'public'
      AND column_name IN ('id', 'customer_code', 'name', 'company_id', 'division_id')
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(custCols.rows, null, 2));
  
  // 7. sales_orders sample data
  console.log('\n===== sales_orders sample (all) =====');
  const soData = await c.query(`
    SELECT id, order_number, customer_id, company_id, division_id, order_date, status, total_amount
    FROM sales_orders
    ORDER BY order_date DESC
  `);
  console.log(JSON.stringify(soData.rows, null, 2));
  
  // 8. sales_order_items sample
  console.log('\n===== sales_order_items sample =====');
  const soiData = await c.query(`
    SELECT id, sales_order_id, item_id, quantity, unit_price, uom_id
    FROM sales_order_items
    ORDER BY sales_order_id
  `);
  console.log(JSON.stringify(soiData.rows, null, 2));
  
  // 9. items with division_id
  console.log('\n===== items with division_id =====');
  const itemDivs = await c.query(`
    SELECT id, item_code, name, division_id, company_id, status
    FROM items
    WHERE division_id IS NOT NULL
    ORDER BY item_code
  `);
  console.log(JSON.stringify(itemDivs.rows, null, 2));
  
  // 10. items without division_id
  console.log('\n===== items WITHOUT division_id =====');
  const itemNoDivs = await c.query(`
    SELECT id, item_code, name, division_id, company_id, status
    FROM items
    WHERE division_id IS NULL
    ORDER BY item_code
  `);
  console.log(JSON.stringify(itemNoDivs.rows, null, 2));
  
  // 11. customer data
  console.log('\n===== customers =====');
  const custData = await c.query(`
    SELECT id, customer_code, name, company_id, division_id, status
    FROM customers
    WHERE status = 'ACTIVE'
    ORDER BY customer_code
  `);
  console.log(JSON.stringify(custData.rows, null, 2));
  
  // 12. Check sales_order_items with item division info
  console.log('\n===== sales_order_items with item division =====');
  const soiWithDiv = await c.query(`
    SELECT soi.id, soi.sales_order_id, soi.item_id, soi.quantity,
           i.item_code, i.name as item_name, i.division_id as item_division_id,
           i.company_id as item_company_id
    FROM sales_order_items soi
    JOIN items i ON i.id = soi.item_id
    ORDER BY soi.sales_order_id
  `);
  console.log(JSON.stringify(soiWithDiv.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });