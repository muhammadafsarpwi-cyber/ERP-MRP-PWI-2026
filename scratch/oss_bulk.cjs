/* READ-ONLY: identify the bulk timestamp that deactivated 138 entries. */
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

  log('=== V. Bulk updated_at timestamps (>=5 rows) ===');
  TABLE(await q(`
    SELECT updated_at::timestamp(0) AS upd, COUNT(*)::int AS n,
           COUNT(*) FILTER (WHERE is_active=false)::int AS inactive,
           COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS in_bin
    FROM production_entries GROUP BY 1 HAVING COUNT(*)>=5 ORDER BY 2 DESC LIMIT 15`));

  log('\n=== W. Inactive+not-deleted by CREATED month (were they born dead?) ===');
  TABLE(await q(`
    SELECT DATE_TRUNC('month', created_at)::date AS created_month, COUNT(*)::int AS n
    FROM production_entries WHERE is_active=false AND deleted_at IS NULL
    GROUP BY 1 ORDER BY 1`));

  log('\n=== X. Sample inactive+not-deleted: created vs updated ===');
  TABLE(await q(`
    SELECT entry_number, created_at::timestamp(0), updated_at::timestamp(0), entry_date::date, is_active
    FROM production_entries WHERE is_active=false AND deleted_at IS NULL
    ORDER BY updated_at DESC LIMIT 12`));

  log('\n=== Y. Which entries were updated at the 05:35:52 bulk instant? ===');
  TABLE(await q(`
    SELECT is_active, (deleted_at IS NOT NULL) AS in_bin, COUNT(*)::int AS n
    FROM production_entries
    WHERE updated_at >= '2026-10-11 05:35:50' AND updated_at < '2026-10-11 05:35:55'
    GROUP BY 1,2`));

  log('\n=== Z. Do those bulk-touched rows share a warehouse backfill? ===');
  TABLE(await q(`
    SELECT (warehouse_id IS NULL) AS wh_null, (raw_material_warehouse_id IS NULL) AS rm_wh_null, COUNT(*)::int AS n
    FROM production_entries
    WHERE updated_at >= '2026-10-11 05:35:50' AND updated_at < '2026-10-11 05:35:55'
    GROUP BY 1,2`));

  await c.end(); log('\n[DONE - read-only]');
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
