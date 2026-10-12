/* READ-ONLY: transaction types under PRODUCTION_ENTRY + atomicity check. */
const fs = require('fs'); const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));
function loadEnv() { const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env'); const o = {};
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim()); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); } return o; }
const log = (s) => console.log(s);
const TABLE = (rows) => { if (!rows.length) { log('  (none)'); return; }
  log('  ' + Object.keys(rows[0]).join(' | '));
  for (const r of rows) log('  ' + Object.values(r).map(String).join(' | ')); };
(async () => {
  const e = loadEnv();
  const c = new Client({ host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME, password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;

  log('=== AF. All transaction_types under reference_type = PRODUCTION_ENTRY ===');
  TABLE(await q(`SELECT transaction_type, direction, COUNT(*)::int AS n FROM stock_ledger
                 WHERE reference_type='PRODUCTION_ENTRY' GROUP BY 1,2 ORDER BY 1,2`));

  log('\n=== AG. If we post balancing reversals for DELETED entries, per (warehouse,item) net ===');
  TABLE(await q(`
    WITH rws AS (
      SELECT pe.id AS eid, sl.warehouse_id, sl.item_id,
             CASE WHEN sl.transaction_type='PRODUCTION_SCRAP' THEN 0
                  WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END AS row_net
      FROM production_entries pe
      JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
      WHERE pe.is_active = false),
    net AS (SELECT eid, SUM(row_net) AS e FROM rws GROUP BY eid),
    target AS (
      SELECT r.warehouse_id, r.item_id, SUM(r.row_net) AS need
      FROM rws r JOIN net n ON n.eid=r.eid
      WHERE ABS(n.e) > 0.0001 GROUP BY 1,2)
    SELECT w.warehouse_code, i.item_code,
           ROUND(need::numeric,2) AS net_to_reverse,
           ROUND(COALESCE(b.on_hand,0)::numeric,2) AS current_balance,
           ROUND((COALESCE(b.on_hand,0) - need)::numeric,2) AS balance_after_repair
    FROM target t
    JOIN items i ON i.id=t.item_id JOIN warehouses w ON w.id=t.warehouse_id
    LEFT JOIN inventory_balances b ON b.warehouse_id=t.warehouse_id AND b.item_id=t.item_id
    WHERE ABS(t.need) > 0.0001
    ORDER BY ABS(t.need) DESC LIMIT 15`));

  log('\n=== AH. Repair impact summary ===');
  TABLE(await q(`
    WITH rws AS (
      SELECT pe.id AS eid, sl.warehouse_id, sl.item_id,
             CASE WHEN sl.transaction_type='PRODUCTION_SCRAP' THEN 0
                  WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END AS row_net
      FROM production_entries pe
      JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
      WHERE pe.is_active = false),
    net AS (SELECT eid, SUM(row_net) AS e FROM rws GROUP BY eid),
    target AS (SELECT r.warehouse_id, r.item_id, SUM(r.row_net) AS need
               FROM rws r JOIN net n ON n.eid=r.eid
               WHERE ABS(n.e) > 0.0001 GROUP BY 1,2)
    SELECT COUNT(*)::int AS balance_rows_to_adjust,
           ROUND(SUM(ABS(need))::numeric,2) AS total_absolute_movement,
           ROUND(SUM(need)::numeric,2) AS net_movement
    FROM target WHERE ABS(need) > 0.0001`));

  await c.end(); log('\n[DONE - read-only]');
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
