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
  
  // Check production_order_operations columns
  console.log('\n===== Production order operations columns =====');
  const pooCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'production_order_operations' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(pooCols.rows, null, 2));
  
  // Check material_issue_lines and material_return_lines for target items
  console.log('\n===== Material issues for target items =====');
  const miItems = await c.query(`
    SELECT mi.issue_number, mi.division_id as mi_division_id, mi.status,
           mil.item_id, i.item_code, i.name as item_name, i.division_id as item_division_id,
           mil.quantity
    FROM material_issues mi
    JOIN material_issue_lines mil ON mil.issue_id = mi.id
    JOIN items i ON i.id = mil.item_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY mi.issue_number
  `);
  console.log(JSON.stringify(miItems.rows, null, 2));
  
  console.log('\n===== Material returns for target items =====');
  const mretItems = await c.query(`
    SELECT mret.return_number, mret.division_id as mret_division_id, mret.status,
           mretl.item_id, i.item_code, i.name as item_name, i.division_id as item_division_id,
           mretl.quantity
    FROM material_returns mret
    JOIN material_return_lines mretl ON mretl.return_id = mret.id
    JOIN items i ON i.id = mretl.item_id
    WHERE i.item_code IN ('SLD-0001', 'SLD-0002', 'SLD-0003', 'CCD-FGR-001')
    ORDER BY mret.return_number
  `);
  console.log(JSON.stringify(mretItems.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });