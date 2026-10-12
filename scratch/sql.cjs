/** Ad-hoc SQL helper: node scratch/sql.cjs "SELECT ..." */
const path = require('path');
const fs = require('fs');
const { Client } = require(
  path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'),
);

const o = {};
for (const l of fs
  .readFileSync(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env'), 'utf8')
  .split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim());
  if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

(async () => {
  const c = new Client({
    host: o.DB_HOST,
    port: Number(o.DB_PORT),
    user: o.DB_USERNAME,
    password: o.DB_PASSWORD,
    database: o.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const sql = process.argv[2];
  const r = await c.query(sql);
  console.log(Object.keys(r.rows[0] || {}).join(' | '));
  for (const row of r.rows) {
    console.log(
      Object.values(row)
        .map((v) => (v === null ? 'null' : String(v)))
        .join(' | '),
    );
  }
  await c.end();
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
