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
  
  // Check tables with division_id
  console.log('\n===== Tables with division_id =====');
  const tablesWithDiv = await c.query(`
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'division_id'
    ORDER BY table_name
  `);
  console.log(JSON.stringify(tablesWithDiv.rows, null, 2));
  
  // Check if sales_orders table exists
  console.log('\n===== Check sales_orders table =====');
  const soExists = await c.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'sales_orders'
    ) as exists
  `);
  console.log(JSON.stringify(soExists.rows, null, 2));
  
  // Check for sales_invoice, sales_delivery, sales_return tables
  console.log('\n===== Sales-related tables =====');
  const salesTables = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (table_name ILIKE '%sales%' OR table_name ILIKE '%invoice%' OR table_name ILIKE '%delivery%' OR table_name ILIKE '%return%')
      AND table_name NOT ILIKE '%purchase%'
      AND table_name NOT ILIKE '%production%'
      AND table_name NOT ILIKE '%material%'
      AND table_name NOT ILIKE '%raw%'
      AND table_name NOT ILIKE '%maintenance%'
    ORDER BY table_name
  `);
  console.log(JSON.stringify(salesTables.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });