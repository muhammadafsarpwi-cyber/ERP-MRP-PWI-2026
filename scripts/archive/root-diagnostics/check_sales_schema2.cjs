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
  
  // Check sales_order_items data
  console.log('\n===== sales_order_items data in erp_sales =====');
  const soiData = await c.query(`
    SELECT id, sales_order_id, item_id, quantity, unit_price, uom_id
    FROM erp_sales.sales_order_items
    ORDER BY sales_order_id
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
  
  // Check raw_material_receipts with item division
  console.log('\n===== raw_material_receipt_lines with item division =====');
  const rmrLinesWithDiv = await c.query(`
    SELECT rml.id, rml.receipt_id, rml.item_id, rml.received_quantity,
           i.item_code, i.name as item_name, i.division_id as item_division_id,
           rmr.division_id as receipt_division_id
    FROM raw_material_receipt_lines rml
    JOIN items i ON i.id = rml.item_id
    JOIN raw_material_receipts rmr ON rmr.id = rml.receipt_id
    ORDER BY rml.receipt_id
  `);
  console.log(JSON.stringify(rmrLinesWithDiv.rows, null, 2));
  
  // Check divisions
  console.log('\n===== divisions =====');
  const divs = await c.query(`
    SELECT id, division_code, name, company_id, status
    FROM divisions
    WHERE status = 'ACTIVE'
    ORDER BY division_code
  `);
  console.log(JSON.stringify(divs.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });