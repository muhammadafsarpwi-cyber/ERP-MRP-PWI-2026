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
    SELECT pe.id, pe.entry_date, pe.actual_quantity, i.item_code
    FROM production_entries pe
    JOIN items i ON i.id = pe.item_id
    WHERE i.item_code IN ('WIP-ST-002', 'RM-WIRE-011', 'SPI-FG-SPK-008')
  `);
  console.log('Production entries:', res.rows);

  const res2 = await c.query(`
    SELECT sl.transaction_date, sl.direction, sl.transaction_type, sl.quantity, i.item_code
    FROM stock_ledger sl
    JOIN items i ON i.id = sl.item_id
    WHERE i.item_code IN ('WIP-ST-002', 'RM-WIRE-011') AND sl.transaction_date >= '2026-10-01' AND sl.transaction_date <= '2026-10-06'
  `);
  console.log('Stock ledger 10-01 to 10-06:', res2.rows);

  await c.end();
})();
