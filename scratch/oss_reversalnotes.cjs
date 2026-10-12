/* READ-ONLY: can every PRODUCTION_REVERSAL note be parsed by readPostedMovements? */
const fs = require('fs'); const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));
function loadEnv() { const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env'); const o = {};
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim()); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); } return o; }
(async () => {
  const e = loadEnv();
  const c = new Client({ host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME, password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const rows = (await c.query(
    `SELECT COALESCE(substring(notes from '^Reversal of ([A-Z_]+)'), '(UNPARSEABLE)') AS family,
            direction, COUNT(*)::int AS n
     FROM stock_ledger WHERE transaction_type='PRODUCTION_REVERSAL'
     GROUP BY 1,2 ORDER BY 3 DESC`)).rows;
  console.log('Family parsed from reversal notes:');
  rows.forEach((r) => console.log(`  ${r.family.padEnd(26)} ${r.direction}  n=${r.n}`));
  const bad = rows.filter((r) => r.family === '(UNPARSEABLE)');
  console.log(`\nUNPARSEABLE rows: ${bad.reduce((a, b) => a + b.n, 0)}`);
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
