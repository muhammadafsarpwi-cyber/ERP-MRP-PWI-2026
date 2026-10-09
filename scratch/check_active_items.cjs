const fs = require('fs');
const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));

function loadEnv() {
  const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env');
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

(async () => {
  const e = loadEnv();
  const c = new Client({
    host: e.DB_HOST,
    port: Number(e.DB_PORT),
    user: e.DB_USERNAME,
    password: e.DB_PASSWORD,
    database: e.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const res = await c.query(`
    SELECT item_code, name, status, weight_per_piece
    FROM items
    WHERE status = 'ACTIVE'
    ORDER BY item_code
  `);
  console.log('Total active items:', res.rows.length);
  const sample = res.rows.filter(r => r.item_code.startsWith('WIP-') || r.item_code.startsWith('RM-') || r.item_code.startsWith('SPI-FG-'));
  console.log('Sample matching items:', sample.map(s => ({ code: s.item_code, name: s.name, wpp: s.weight_per_piece })));
  await c.end();
})();
