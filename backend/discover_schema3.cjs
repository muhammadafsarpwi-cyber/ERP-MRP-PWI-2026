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
  
  // Search for all tables with "sales" or "quotation" or "invoice" or "delivery"
  console.log('\n===== All sales-related tables =====');
  const tables = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (table_name ILIKE '%sales%' 
        OR table_name ILIKE '%invoice%' 
        OR table_name ILIKE '%delivery%' 
        OR table_name ILIKE '%quotation%'
        OR table_name ILIKE '%return%'
        OR table_name ILIKE '%credit%')
    ORDER BY table_name
  `);
  console.log(JSON.stringify(tables.rows, null, 2));
  
  // Check all tables in public schema
  console.log('\n===== All tables =====');
  const allTables = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log(allTables.rows.map(r => r.table_name).join(', '));
  
  // Check companies data
  console.log('\n===== companies data =====');
  const comps = await c.query(`
    SELECT id, company_code, legal_name, trade_name, status
    FROM companies
    ORDER BY company_code
  `);
  console.log(JSON.stringify(comps.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });