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
  
  // Check all tables with "order" in name
  console.log('\n===== Tables with "order" in name =====');
  const orderTables = await c.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name ILIKE '%order%'
    ORDER BY table_name
  `);
  console.log(JSON.stringify(orderTables.rows, null, 2));
  
  // Check sales module entity files
  console.log('\n===== Check sales entities in backend code =====');
  const fs = require('fs');
  const salesEntitiesPath = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'src', 'modules', 'sales');
  const walk = (dir) => {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(walk(filePath));
      } else if (file.endsWith('.entity.ts')) {
        results.push(filePath);
      }
    });
    return results;
  };
  const entities = walk(salesEntitiesPath);
  console.log('Sales entities:', entities);
  
  // Read one entity to see table name
  if (entities.length > 0) {
    for (const entity of entities.slice(0, 5)) {
      const content = fs.readFileSync(entity, 'utf8');
      const tableMatch = content.match(/@Table\(['"](\w+)['"]\)/);
      const entityNameMatch = content.match(/export class (\w+)/);
      console.log(`\nEntity: ${entityNameMatch ? entityNameMatch[1] : 'unknown'} in ${entity}`);
      if (tableMatch) {
        console.log(`Table: ${tableMatch[1]}`);
      } else {
        console.log('No @Table decorator found');
      }
    }
  }
  
  await c.end();
}

run().catch(e => { console.error(e); process.exit(1); });