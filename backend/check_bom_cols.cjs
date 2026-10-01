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
  
  // Check BOM table columns
  console.log('\n===== BOM table columns =====');
  const bomCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'bill_of_materials' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(bomCols.rows, null, 2));
  
  // Check BOM lines table columns
  console.log('\n===== BOM lines table columns =====');
  const bomLineCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'bom_lines' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(bomLineCols.rows, null, 2));
  
  // Check routing tables
  console.log('\n===== Production routings columns =====');
  const rtCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'production_routings' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(rtCols.rows, null, 2));
  
  console.log('\n===== Routing operations columns =====');
  const roCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'routing_operations' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(roCols.rows, null, 2));
  
  console.log('\n===== Routing operation inputs columns =====');
  const roiCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'routing_operation_inputs' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(roiCols.rows, null, 2));
  
  console.log('\n===== Routing operation outputs columns =====');
  const rooCols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'routing_operation_outputs' AND table_schema = 'public'
    ORDER BY ordinal_position
  `);
  console.log(JSON.stringify(rooCols.rows, null, 2));
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });