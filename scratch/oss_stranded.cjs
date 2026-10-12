/* READ-ONLY: TRUE stranded stock = inactive entries whose ledger net != 0. */
const fs = require('fs'); const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));
function loadEnv() { const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env'); const o = {};
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim()); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); } return o; }
const log = (s) => console.log(s);
const TABLE = (rows) => { if (!rows.length) { log('  (none)'); return; }
  log('  ' + Object.keys(rows[0]).join(' | '));
  for (const r of rows) log('  ' + Object.values(r).map(String).join(' | ')); };

// Net over ALL rows for an entry, SCRAP excluded (audit-only, never moved balance).
const NET = `SUM(CASE WHEN sl.transaction_type='PRODUCTION_SCRAP' THEN 0
                       WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)`;

(async () => {
  const e = loadEnv();
  const c = new Client({ host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME, password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;

  log('=== AA. TRUE stranded: entries that are DELETED (is_active=false) but still on the books ===');
  TABLE(await q(`
    SELECT (pe.deleted_at IS NOT NULL) AS in_bin, (pe.inventory_reference_id IS NULL) AS ref_null,
           COUNT(*)::int AS entries
    FROM production_entries pe
    WHERE pe.is_active = false
      AND EXISTS (SELECT 1 FROM stock_ledger sl
                  WHERE sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id)
    GROUP BY 1,2 ORDER BY 1,2`));

  log('\n=== AB. Stranded total (deleted entries, net != 0) — the ghost stock ===');
  TABLE(await q(`
    WITH per AS (
      SELECT pe.id, pe.entry_number, pe.inventory_reference_id IS NULL AS ref_null, ${NET} AS net
      FROM production_entries pe
      JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
      WHERE pe.is_active = false
      GROUP BY pe.id, pe.entry_number, pe.inventory_reference_id)
    SELECT COUNT(*)::int AS deleted_entries_still_on_books,
           ROUND(SUM(net)::numeric,2) AS net_ghost_stock
    FROM per WHERE ABS(net) > 0.0001`));

  log('\n=== AC. Same for LIVE entries (control group — these SHOULD be non-zero) ===');
  TABLE(await q(`
    WITH per AS (
      SELECT pe.id, ${NET} AS net
      FROM production_entries pe
      JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
      WHERE pe.is_active = true AND pe.deleted_at IS NULL
      GROUP BY pe.id)
    SELECT COUNT(*)::int AS live_entries, COUNT(*) FILTER (WHERE ABS(net)>0.0001)::int AS with_stock,
           COUNT(*) FILTER (WHERE ABS(net)<=0.0001)::int AS net_zero
    FROM per`));

  log('\n=== AD. Top 20 GHOST rows by warehouse/item (deleted but still counted) ===');
  TABLE(await q(`
    WITH rws AS (
      SELECT pe.id AS entry_id, sl.warehouse_id, sl.item_id,
             CASE WHEN sl.transaction_type='PRODUCTION_SCRAP' THEN 0
                  WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END AS row_net
      FROM production_entries pe
      JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
      WHERE pe.is_active = false),
    net AS (SELECT entry_id, SUM(row_net) AS entry_net FROM rws GROUP BY entry_id)
    SELECT w.warehouse_code, i.item_code,
           ROUND(SUM(r.row_net)::numeric,2) AS ghost_qty,
           COUNT(DISTINCT r.entry_id)::int AS deleted_entries
    FROM rws r JOIN net n ON n.entry_id = r.entry_id
    JOIN items i ON i.id=r.item_id JOIN warehouses w ON w.id=r.warehouse_id
    WHERE ABS(n.entry_net) > 0.0001
    GROUP BY 1,2
    HAVING ABS(SUM(r.row_net)) > 0.0001
    ORDER BY ABS(SUM(r.row_net)) DESC LIMIT 25`));

  log('\n=== AD2. Ghost rows inside CCD-SP-002 specifically ===');
  TABLE(await q(`
    WITH rws AS (
      SELECT pe.id AS entry_id, pe.entry_number, sl.warehouse_id, sl.item_id,
             CASE WHEN sl.transaction_type='PRODUCTION_SCRAP' THEN 0
                  WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END AS row_net
      FROM production_entries pe
      JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
      WHERE pe.is_active = false),
    net AS (SELECT entry_id, SUM(row_net) AS entry_net FROM rws GROUP BY entry_id)
    SELECT r.entry_number, i.item_code, ROUND(SUM(r.row_net)::numeric,2) AS ghost_qty
    FROM rws r JOIN net n ON n.entry_id = r.entry_id
    JOIN items i ON i.id=r.item_id
    WHERE r.warehouse_id='dc212cb0-364c-47ba-88db-1bde18f842de' AND ABS(n.entry_net) > 0.0001
    GROUP BY 1,2 ORDER BY 3 DESC`));

  log('\n=== AE. HAND PACKING: how are packing entries flagged? ===');
  TABLE(await q(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name='production_entries' AND (column_name ILIKE '%pack%' OR column_name ILIKE '%mode%' OR column_name ILIKE '%source%')`));

  await c.end(); log('\n[DONE - read-only]');
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
