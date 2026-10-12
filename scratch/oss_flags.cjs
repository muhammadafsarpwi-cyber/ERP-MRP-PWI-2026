/* READ-ONLY: cross-tab the two delete flags vs unreversed postings. */
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

  log('=== K. CROSS-TAB: is_active x deleted_at x inventory_reference_id ===');
  TABLE(await q(`
    SELECT is_active, (deleted_at IS NOT NULL) AS has_deleted_at,
           (inventory_reference_id IS NOT NULL) AS has_ref,
           COUNT(*)::int AS entries
    FROM production_entries GROUP BY 1,2,3 ORDER BY 1,2,3`));

  log('\n=== L. INACTIVE-but-not-deleted entries STILL holding stock (THE BUG) ===');
  TABLE(await q(`
    SELECT pe.entry_number, pe.entry_date::date, pe.is_active, (pe.deleted_at IS NOT NULL) AS del,
           w.warehouse_code, i.item_code, sl.transaction_type, sl.direction, sl.quantity
    FROM production_entries pe
    JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
    JOIN items i ON i.id=sl.item_id JOIN warehouses w ON w.id=sl.warehouse_id
    WHERE pe.is_active = false AND pe.deleted_at IS NULL
      AND sl.transaction_type IN ('PRODUCTION_RECEIPT','PRODUCTION_CONSUMPTION')
    ORDER BY pe.entry_number LIMIT 40`));

  log('\n=== M. Stranded totals for inactive+undeleted entries ===');
  TABLE(await q(`
    SELECT COUNT(DISTINCT pe.id)::int AS entries,
           COUNT(*)::int AS ledger_rows,
           ROUND(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)::numeric,2) AS net_stranded
    FROM production_entries pe
    JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
    WHERE pe.is_active = false AND pe.deleted_at IS NULL
      AND sl.transaction_type IN ('PRODUCTION_RECEIPT','PRODUCTION_CONSUMPTION')`));

  log('\n=== N. And WITH the flag null (double jeopardy: delete() would skip reversal) ===');
  TABLE(await q(`
    SELECT COUNT(DISTINCT pe.id)::int AS entries,
           ROUND(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)::numeric,2) AS net
    FROM production_entries pe
    JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
    WHERE pe.is_active = false AND pe.deleted_at IS NULL
      AND pe.inventory_reference_id IS NULL
      AND sl.transaction_type IN ('PRODUCTION_RECEIPT','PRODUCTION_CONSUMPTION')`));

  log('\n=== O. Per-warehouse impact of inactive+undeleted (top 20) ===');
  TABLE(await q(`
    SELECT w.warehouse_code, i.item_code,
           ROUND(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)::numeric,2) AS stranded
    FROM production_entries pe
    JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
    JOIN items i ON i.id=sl.item_id JOIN warehouses w ON w.id=sl.warehouse_id
    WHERE pe.is_active = false AND pe.deleted_at IS NULL
      AND sl.transaction_type IN ('PRODUCTION_RECEIPT','PRODUCTION_CONSUMPTION')
    GROUP BY 1,2
    HAVING ABS(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)) > 0.0001
    ORDER BY ABS(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)) DESC LIMIT 20`));

  log('\n=== P. CCD-SP-002 items: are WIP-SP-002/005/010 balances from such entries? ===');
  TABLE(await q(`
    SELECT pe.entry_number, pe.entry_date::date, pe.is_active, (pe.deleted_at IS NOT NULL) AS del,
           pe.inventory_reference_id IS NULL AS ref_null,
           w.warehouse_code, i.item_code, sl.transaction_type, sl.direction, sl.quantity
    FROM production_entries pe
    JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
    JOIN items i ON i.id=sl.item_id JOIN warehouses w ON w.id=sl.warehouse_id
    WHERE i.item_code IN ('WIP-SP-002','WIP-SP-005','WIP-SP-010')
      AND w.warehouse_code='CCD-SP-002'
    ORDER BY pe.entry_number`));

  await c.end(); log('\n[DONE - read-only]');
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
