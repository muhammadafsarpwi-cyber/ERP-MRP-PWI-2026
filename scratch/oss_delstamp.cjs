/* READ-ONLY: does remove() actually stamp deleted_at? */
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

  log('=== Q. The 3 that DO have deleted_at ===');
  TABLE(await q(`SELECT entry_number, entry_date::date, is_active, deleted_at::timestamp(0), deleted_by IS NOT NULL AS has_delby, inventory_reference_id IS NOT NULL AS has_ref
                 FROM production_entries WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`));

  log('\n=== R. Inactive+NOT-deleted: when were they last touched? ===');
  TABLE(await q(`
    SELECT DATE_TRUNC('month', updated_at)::date AS updated_month, COUNT(*)::int AS n,
           MIN(updated_at)::date AS min_upd, MAX(updated_at)::date AS max_upd
    FROM production_entries WHERE is_active=false AND deleted_at IS NULL
    GROUP BY 1 ORDER BY 1`));

  log('\n=== S. Recent inactive+NOT-deleted (updated in last 3 days) — the live symptom ===');
  TABLE(await q(`
    SELECT entry_number, entry_date::date, updated_at::timestamp(0),
           inventory_reference_id IS NULL AS ref_null
    FROM production_entries
    WHERE is_active=false AND deleted_at IS NULL AND updated_at > NOW() - INTERVAL '3 days'
    ORDER BY updated_at DESC LIMIT 25`));

  log('\n=== T. Do GRIDS filter on is_active or deleted_at? (count comparison) ===');
  TABLE(await q(`
    SELECT (is_active=false) AS inactive, (deleted_at IS NOT NULL) AS in_bin, COUNT(*)::int AS n
    FROM production_entries GROUP BY 1,2 ORDER BY 1,2`));

  log('\n=== U. Is WIP-SP-013 314942 balance explainable? ledger vs balance in CCD-SP-002 ===');
  TABLE(await q(`
    SELECT i.item_code, b.on_hand,
      (SELECT COALESCE(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END),0)
         FROM stock_ledger sl WHERE sl.warehouse_id=b.warehouse_id AND sl.item_id=b.item_id) AS ledger_net
    FROM inventory_balances b JOIN items i ON i.id=b.item_id
    WHERE b.warehouse_id='dc212cb0-364c-47ba-88db-1bde18f842de' AND b.on_hand>0 ORDER BY i.item_code`));

  await c.end(); log('\n[DONE - read-only]');
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
