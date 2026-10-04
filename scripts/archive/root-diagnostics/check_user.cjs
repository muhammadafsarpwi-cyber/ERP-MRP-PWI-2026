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
  return c.query("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%user%' AND table_schema = 'public'");
}).then(r => {
  console.log('Tables:', r.rows);
  return c.end();
}).catch(e => console.error(e));