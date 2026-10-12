/* READ-ONLY: profile the 55 posted-but-flagless production entries. */
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

  log('=== G. The 55 flagless entries — what did they post? ===');
  TABLE(await q(`
    SELECT sl.transaction_type, sl.direction, COUNT(DISTINCT pe.id)::int AS entries, COUNT(*)::int AS rows,
           ROUND(SUM(sl.quantity)::numeric,2) AS qty
    FROM production_entries pe
    JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
    WHERE sl.transaction_type IN ('PRODUCTION_RECEIPT','PRODUCTION_CONSUMPTION')
      AND pe.inventory_reference_id IS NULL AND pe.deleted_at IS NULL
    GROUP BY 1,2 ORDER BY 1,2`));

  log('\n=== H. Split: flagless entries that DID post a RECEIPT (ghost risk) ===');
  TABLE(await q(`
    SELECT COUNT(DISTINCT pe.id)::int AS entries_with_receipt_no_flag
    FROM production_entries pe
    JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
    WHERE sl.transaction_type='PRODUCTION_RECEIPT' AND sl.direction='IN'
      AND pe.inventory_reference_id IS NULL AND pe.deleted_at IS NULL`));

  log('\n  -- sample of those (if any) --');
  TABLE(await q(`
    SELECT pe.entry_number, pe.entry_date::date, pe.is_active,
           ROUND(SUM(CASE WHEN sl.transaction_type='PRODUCTION_SCRAP' THEN 0
                          WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)::numeric,3) AS net_if_deleted_now
    FROM production_entries pe
    JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
    WHERE sl.transaction_type='PRODUCTION_RECEIPT' AND sl.direction='IN'
      AND pe.inventory_reference_id IS NULL AND pe.deleted_at IS NULL
    GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 15`));

  log('\n=== I. Orphan risk if the 55 were deleted today (net left in balances) ===');
  TABLE(await q(`
    SELECT w.warehouse_code, i.item_code,
           ROUND(SUM(CASE WHEN sl.transaction_type='PRODUCTION_SCRAP' THEN 0
                          WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)::numeric,2) AS stranded_qty
    FROM production_entries pe
    JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
    JOIN items i ON i.id=sl.item_id JOIN warehouses w ON w.id=sl.warehouse_id
    WHERE sl.transaction_type IN ('PRODUCTION_RECEIPT','PRODUCTION_CONSUMPTION')
      AND pe.inventory_reference_id IS NULL AND pe.deleted_at IS NULL
    GROUP BY 1,2
    HAVING ABS(SUM(CASE WHEN sl.transaction_type='PRODUCTION_SCRAP' THEN 0
                        WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)) > 0.0001
    ORDER BY ABS(SUM(CASE WHEN sl.transaction_type='PRODUCTION_SCRAP' THEN 0
                          WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)) DESC`));

  log('\n=== J. Are these entries post-restore? (ledger has REVERSAL rows for them) ===');
  TABLE(await q(`
    SELECT (sl.transaction_type='PRODUCTION_REVERSAL') AS has_reversal,
           COUNT(DISTINCT pe.id)::int AS entries
    FROM production_entries pe
    JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
    WHERE sl.transaction_type IN ('PRODUCTION_RECEIPT','PRODUCTION_CONSUMPTION')
      AND pe.inventory_reference_id IS NULL AND pe.deleted_at IS NULL
    GROUP BY 1`));

  await c.end(); log('\n[DONE - read-only]');
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
