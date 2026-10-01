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
  
  // Check material_requests columns
  console.log('\n===== Material requests columns =====');
  const mrCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'material_requests' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(mrCols.rows, null, 2));
  
  // Check material_issues columns
  console.log('\n===== Material issues columns =====');
  const miCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'material_issues' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(miCols.rows, null, 2));
  
  // Check material_returns columns
  console.log('\n===== Material returns columns =====');
  const mretCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'material_returns' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(mretCols.rows, null, 2));
  
  // Check stock_ledger columns
  console.log('\n===== Stock ledger columns =====');
  const slCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'stock_ledger' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(slCols.rows, null, 2));
  
  // Check purchase_orders columns
  console.log('\n===== Purchase orders columns =====');
  const poCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(poCols.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });