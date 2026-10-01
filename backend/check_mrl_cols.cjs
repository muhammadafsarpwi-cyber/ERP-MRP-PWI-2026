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
  
  // Check material_request_lines columns
  console.log('\n===== Material request lines columns =====');
  const mrlCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'material_request_lines' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(mrlCols.rows, null, 2));
  
  // Check material_issue_lines columns
  console.log('\n===== Material issue lines columns =====');
  const milCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'material_issue_lines' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(milCols.rows, null, 2));
  
  // Check material_return_lines columns
  console.log('\n===== Material return lines columns =====');
  const mretlCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'material_return_lines' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(mretlCols.rows, null, 2));
  
  // Check store_items columns
  console.log('\n===== Store items columns =====');
  const siCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'store_items' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(siCols.rows, null, 2));
  
  // Check raw_material_receipt_lines columns
  console.log('\n===== Raw material receipt lines columns =====');
  const rmlCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'raw_material_receipt_lines' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(rmlCols.rows, null, 2));
  
  // Check purchase_order_lines columns
  console.log('\n===== Purchase order lines columns =====');
  const polCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'purchase_order_lines' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(polCols.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });