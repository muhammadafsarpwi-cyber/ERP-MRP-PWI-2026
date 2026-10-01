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
  
  // Check quotations data
  console.log('\n===== quotations data =====');
  const qData = await c.query(`
    SELECT id, quotation_code, rfq_id, supplier_id, company_id, quotation_date, status, total_amount
    FROM quotations
    ORDER BY quotation_date DESC
  `);
  console.log(JSON.stringify(qData.rows, null, 2));
  
  // Check raw_material_receipts columns
  console.log('\n===== raw_material_receipts columns =====');
  const rmrCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'raw_material_receipts' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(rmrCols.rows, null, 2));
  
  console.log('\n===== raw_material_receipts data =====');
  const rmrData = await c.query(`
    SELECT id, receipt_code, company_id, division_id, receipt_date, status, total_amount
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
  
  // Check quotation_lines data
  console.log('\n===== quotation_lines data =====');
  const qlData = await c.query(`
    SELECT id, quotation_id, item_id, quantity, unit_price, uom_id
    FROM quotation_lines
    ORDER BY quotation_id
  `);
  console.log(JSON.stringify(qlData.rows, null, 2));
  
  // Check raw_material_receipt_lines
  console.log('\n===== raw_material_receipt_lines columns =====');
  const rmrLinesCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'raw_material_receipt_lines' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(rmrLinesCols.rows, null, 2));
  
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
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });