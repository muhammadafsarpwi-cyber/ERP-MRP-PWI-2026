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
    SELECT item_code, name, item_type, weight, weight_per_piece, weight_per_meter, pieces_per_kg
    FROM items
    WHERE item_code IN ('RM-WIRE-011', 'WIP-ST-002', 'WIP-ST-005', 'WIP-SW-003', 'WIP-SW-004', 'WIP-SP-009', 'WIP-SP-010', 'WIP-SPL-009', 'WIP-SPL-010', 'SPI-FG-SPK-008')
    ORDER BY item_code
  `);
  console.log(JSON.stringify(res.rows, null, 2));
  await c.end();
})();
