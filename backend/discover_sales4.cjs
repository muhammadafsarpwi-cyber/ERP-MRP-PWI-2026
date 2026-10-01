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
  
  // Check raw_material_receipts data
  console.log('\n===== raw_material_receipts data =====');
  const rmrData = await c.query(`
    SELECT id, receipt_code, company_id, division_id, receipt_date, status
    FROM raw_material_receipts
    ORDER BY receipt_date DESC
  `);
  console.log(JSON.stringify(rmrData.rows, null, 2));
  
  // Check dispatch_packages
  console.log('\n===== dispatch_packages columns =====');
  const dpCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'dispatch_packages' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(dpCols.rows, null, 2));
  
  console.log('\n===== dispatch_packages data =====');
  const dpData = await c.query(`
    SELECT id, package_no, company_id, division_id, package_date, status
    FROM dispatch_packages
    ORDER BY package_date DESC
  `);
  console.log(JSON.stringify(dpData.rows, null, 2));
  
  // Check items with division
  console.log('\n===== items with division =====');
  const itemsDiv = await c.query(`
    SELECT id, item_code, name, division_id, company_id, status
    FROM items
    ORDER BY item_code
  `);
  console.log(JSON.stringify(itemsDiv.rows, null, 2));
  
  // Check customers
  console.log('\n===== customers =====');
  const custs = await c.query(`
    SELECT id, customer_code, name, company_id, division_id, status
    FROM customers
    WHERE status = 'ACTIVE'
    ORDER BY customer_code
  `);
  console.log(JSON.stringify(custs.rows, null, 2));
  
  // Check raw_material_receipt_lines data
  console.log('\n===== raw_material_receipt_lines data =====');
  const rmrLinesData = await c.query(`
    SELECT id, receipt_id, item_id, quantity, unit_price, uom_id
    FROM raw_material_receipt_lines
    ORDER BY receipt_id
  `);
  console.log(JSON.stringify(rmrLinesData.rows, null, 2));
  
  // Check dispatch_package_units
  console.log('\n===== dispatch_package_units columns =====');
  const dpuCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'dispatch_package_units' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(dpuCols.rows, null, 2));
  
  console.log('\n===== dispatch_package_units data =====');
  const dpuData = await c.query(`
    SELECT id, package_id, production_unit_id, quantity
    FROM dispatch_package_units
  `);
  console.log(JSON.stringify(dpuData.rows, null, 2));
  
  // Check production_orders - might be the "sales orders" equivalent
  console.log('\n===== production_orders columns =====');
  const poCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'production_orders' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(poCols.rows, null, 2));
  
  console.log('\n===== production_orders data =====');
  const poData = await c.query(`
    SELECT id, order_number, company_id, division_id, order_date, status
    FROM production_orders
    ORDER BY order_date DESC
  `);
  console.log(JSON.stringify(poData.rows, null, 2));
  
  // Check material_issues
  console.log('\n===== material_issues columns =====');
  const miCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'material_issues' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(miCols.rows, null, 2));
  
  console.log('\n===== material_issues data =====');
  const miData = await c.query(`
    SELECT id, issue_code, company_id, division_id, issue_date, status
    FROM material_issues
    ORDER BY issue_date DESC
  `);
  console.log(JSON.stringify(miData.rows, null, 2));
  
  // Check material_requests
  console.log('\n===== material_requests columns =====');
  const mrCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'material_requests' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(mrCols.rows, null, 2));
  
  console.log('\n===== material_requests data =====');
  const mrData = await c.query(`
    SELECT id, request_code, company_id, division_id, request_date, status
    FROM material_requests
    ORDER BY request_date DESC
  `);
  console.log(JSON.stringify(mrData.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });