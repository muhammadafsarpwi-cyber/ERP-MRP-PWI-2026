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
c.connect().then(() => {
  return c.query("SELECT id, store_code, store_name, division_id, company_id, status FROM stores WHERE company_id = '7725aa04-a270-4314-9e82-90949cbe7791'");
}).then(r => {
  console.log('Stores:', JSON.stringify(r.rows, null, 2));
  return c.end();
}).catch(e => console.error(e));