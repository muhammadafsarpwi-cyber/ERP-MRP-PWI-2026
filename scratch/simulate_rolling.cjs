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

  // Test opening balances calculation for 2026-10-01, 2026-10-03, 2026-10-05
  // using the exact SQL from production-inventory-report.service.ts
  const dates = ['2026-10-01', '2026-10-03', '2026-10-05'];
  for (const d of dates) {
    const res = await c.query(`
      SELECT i.item_code,
        COALESCE(SUM(CASE WHEN sl.direction = 'IN' AND sl.transaction_type <> 'PRODUCTION_SCRAP' AND sl.transaction_date < $1 THEN sl.quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN sl.direction = 'OUT' AND sl.transaction_type <> 'PRODUCTION_SCRAP' AND sl.transaction_date < $1 THEN sl.quantity ELSE 0 END), 0) AS opening_balance
      FROM items i
      LEFT JOIN stock_ledger sl ON sl.item_id = i.id
      WHERE i.item_code IN ('RM-WIRE-011', 'WIP-ST-002', 'WIP-ST-005', 'WIP-SW-003', 'WIP-SW-004')
      GROUP BY i.item_code
      ORDER BY i.item_code
    `, [d]);
    console.log(`Date < ${d}:`, res.rows);
  }

  await c.end();
})();
