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

  // Run the produced query from production-inventory-report.service.ts for 2026-10-01
  const res = await c.query(`
    SELECT pe.item_id, i.item_code, i.name,
           COALESCE(SUM(pe.actual_quantity), 0) AS produced,
           COUNT(*) AS entry_count
    FROM production_entries pe
    JOIN items i ON i.id = pe.item_id
    WHERE pe.is_active = true
      AND pe.entry_date >= '2026-10-01' AND pe.entry_date <= '2026-10-01T23:59:59.999Z'
    GROUP BY pe.item_id, i.item_code, i.name
    ORDER BY i.item_code
  `);
  console.log('Produced on 2026-10-01 (UTC range):', res.rows);

  const resPKT = await c.query(`
    SELECT pe.item_id, i.item_code, i.name, pe.entry_date, pe.actual_quantity
    FROM production_entries pe
    JOIN items i ON i.id = pe.item_id
    WHERE pe.is_active = true
      AND pe.entry_date >= '2026-09-30T19:00:00Z' AND pe.entry_date <= '2026-10-01T19:00:00Z'
    ORDER BY i.item_code
  `);
  console.log('Produced on 2026-10-01 (PKT range):', resPKT.rows.length);

  await c.end();
})();
