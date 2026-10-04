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
  
  // Find sales-related tables
  console.log('\n===== Sales-related tables =====');
  const tables = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (table_name LIKE '%sales%' OR table_name LIKE '%order%')
    ORDER BY table_name
  `);
  console.log(JSON.stringify(tables.rows, null, 2));
  
  // Find item-related tables
  console.log('\n===== Item-related tables =====');
  const itemTables = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (table_name LIKE '%item%' OR table_name LIKE '%product%')
    ORDER BY table_name
  `);
  console.log(JSON.stringify(itemTables.rows, null, 2));
  
  // Check companies columns
  console.log('\n===== companies columns =====');
  const compCols = await c.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'companies' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(compCols.rows, null, 2));
  
  // Check divisions columns
  console.log('\n===== divisions columns =====');
  const divCols = await c.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'divisions' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(divCols.rows, null, 2));
  
  // Check customers columns
  console.log('\n===== customers columns =====');
  const custCols = await c.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'customers' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(custCols.rows, null, 2));
  
  // Check items columns properly
  console.log('\n===== items columns =====');
  const itemCols = await c.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'items' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(itemCols.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });