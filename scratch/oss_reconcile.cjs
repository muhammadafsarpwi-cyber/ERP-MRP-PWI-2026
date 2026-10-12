/* READ-ONLY: reconcile inventory_balances vs stock_ledger and find
   deletion-sync failures behind the Production Item Open Stock screen. */
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
const log = (s) => console.log(s);
const TABLE = (rows) => {
  if (!rows.length) { log('  (none)'); return; }
  log('  ' + Object.keys(rows[0]).join(' | '));
  log('  ' + '-'.repeat(Math.min(160, Object.keys(rows[0]).join(' | ').length)));
  for (const r of rows) log('  ' + Object.values(r).map((v) => String(v)).join(' | '));
};

(async () => {
  const e = loadEnv();
  const c = new Client({
    host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME,
    password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const q = async (sql, params = []) => (await c.query(sql, params)).rows;

  // ── 1. What the SCREEN reads: inventory_balances for CCD-SP-002 ──────────
  log('=== 1. SCREEN SOURCE: inventory_balances @ CCD-SP-002 ===');
  TABLE(await q(`
    SELECT i.item_code, b.on_hand, b.available, b.status, b.updated_at::date
    FROM inventory_balances b JOIN items i ON i.id=b.item_id
    WHERE b.warehouse_id='dc212cb0-364c-47ba-88db-1bde18f842de'
      AND b.status='ACTIVE' AND b.on_hand>0 ORDER BY i.item_code`));

  // ── 2. What the LEDGER says for the same warehouse ───────────────────────
  log('\n=== 2. LEDGER TRUTH: stock_ledger net per item @ CCD-SP-002 ===');
  TABLE(await q(`
    SELECT i.item_code,
           ROUND(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)::numeric,4) AS ledger_net,
           STRING_AGG(DISTINCT sl.reference_type, ',') AS ref_types
    FROM stock_ledger sl JOIN items i ON i.id=sl.item_id
    WHERE sl.warehouse_id='dc212cb0-364c-47ba-88db-1bde18f842de'
    GROUP BY 1 ORDER BY 1`));

  // ── 3. Global balance vs ledger reconciliation ───────────────────────────
  log('\n=== 3. GLOBAL MISMATCH: balances not backed by ledger (top 25) ===');
  TABLE(await q(`
    WITH led AS (
      SELECT warehouse_id, item_id,
             SUM(CASE WHEN direction='IN' THEN quantity ELSE -quantity END) AS net
      FROM stock_ledger GROUP BY 1,2)
    SELECT w.warehouse_code, i.item_code, b.on_hand AS balance,
           ROUND(COALESCE(led.net,0)::numeric,3) AS ledger_net,
           ROUND((b.on_hand - COALESCE(led.net,0))::numeric,3) AS drift
    FROM inventory_balances b
    JOIN items i ON i.id=b.item_id JOIN warehouses w ON w.id=b.warehouse_id
    LEFT JOIN led ON led.warehouse_id=b.warehouse_id AND led.item_id=b.item_id
    WHERE b.status='ACTIVE'
      AND ABS(b.on_hand - COALESCE(led.net,0)) > 0.0001
    ORDER BY ABS(b.on_hand - COALESCE(led.net,0)) DESC LIMIT 25`));

  log('\n  -- drift summary --');
  TABLE(await q(`
    WITH led AS (
      SELECT warehouse_id, item_id,
             SUM(CASE WHEN direction='IN' THEN quantity ELSE -quantity END) AS net
      FROM stock_ledger GROUP BY 1,2)
    SELECT COUNT(*)::int AS mismatched_balances,
           ROUND(SUM(b.on_hand)::numeric,2) AS total_balance,
           ROUND(SUM(COALESCE(led.net,0))::numeric,2) AS total_ledger,
           ROUND(SUM(b.on_hand - COALESCE(led.net,0))::numeric,2) AS total_drift
    FROM inventory_balances b
    LEFT JOIN led ON led.warehouse_id=b.warehouse_id AND led.item_id=b.item_id
    WHERE b.status='ACTIVE'
      AND ABS(b.on_hand - COALESCE(led.net,0)) > 0.0001`));

  // ── 4. THE CORE BUG: soft-deleted entries whose stock was NEVER reversed ─
  log('\n=== 4. SOFT-DELETED entries still holding unreversed stock (net != 0) ===');
  TABLE(await q(`
    SELECT pe.entry_number, pe.entry_date::date, pe.deleted_at::date AS deleted,
           i.item_code, w.warehouse_code,
           ROUND(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)::numeric,4) AS net_qty,
           pe.inventory_reference_id IS NULL AS ref_id_null
    FROM production_entries pe
    JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
    JOIN items i ON i.id=sl.item_id JOIN warehouses w ON w.id=sl.warehouse_id
    WHERE pe.deleted_at IS NOT NULL
      AND sl.transaction_type <> 'PRODUCTION_SCRAP'
    GROUP BY 1,2,3,4,5,7
    HAVING ABS(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)) > 0.0001
    ORDER BY ABS(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)) DESC`));

  log('\n  -- count summary --');
  TABLE(await q(`
    SELECT COUNT(DISTINCT pe.id)::int AS deleted_entries_still_posted,
           ROUND(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)::numeric,2) AS net_left_behind
    FROM production_entries pe
    JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
    WHERE pe.deleted_at IS NOT NULL AND sl.transaction_type <> 'PRODUCTION_SCRAP'`));

  // ── 5. THE GATE: entries with postings but inventory_reference_id IS NULL ─
  log('\n=== 5. GATE DEFECT: posted entries where inventory_reference_id IS NULL ===');
  log('    (remove() skips reverseInventoryPostings when this flag is null)');
  TABLE(await q(`
    SELECT COUNT(DISTINCT pe.id)::int AS entries,
           pe.deleted_at IS NOT NULL AS already_deleted
    FROM production_entries pe
    JOIN stock_ledger sl ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
    WHERE sl.transaction_type IN ('PRODUCTION_RECEIPT','PRODUCTION_CONSUMPTION')
      AND pe.inventory_reference_id IS NULL
    GROUP BY 2`));

  // ── 6. TRUE ORPHANS: reference_id points at hard-purged entries ──────────
  log('\n=== 6. TRUE ORPHANS: ledger -> hard-purged production_entries (net != 0) ===');
  TABLE(await q(`
    SELECT w.warehouse_code, i.item_code, sl.transaction_type,
           COUNT(*)::int AS rows,
           ROUND(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)::numeric,4) AS net_qty
    FROM stock_ledger sl
    LEFT JOIN production_entries pe ON pe.id=sl.reference_id
    JOIN items i ON i.id=sl.item_id JOIN warehouses w ON w.id=sl.warehouse_id
    WHERE sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id IS NOT NULL
      AND pe.id IS NULL AND sl.transaction_type <> 'PRODUCTION_SCRAP'
    GROUP BY 1,2,3
    HAVING ABS(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)) > 0.0001
    ORDER BY ABS(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)) DESC`));

  // ── 7. Division label: warehouse division vs item division ────────────────
  log('\n=== 7. DIVISION LABELING: CCD-SP-002 warehouse division vs its items ===');
  TABLE(await q(`
    SELECT w.warehouse_code, wd.division_code AS warehouse_div,
           i.item_code, idv.division_code AS item_div
    FROM inventory_balances b
    JOIN warehouses w ON w.id=b.warehouse_id
    JOIN items i ON i.id=b.item_id
    LEFT JOIN divisions wd ON wd.id=w.division_id
    LEFT JOIN divisions idv ON idv.id=i.division_id
    WHERE b.warehouse_id='dc212cb0-364c-47ba-88db-1bde18f842de' AND b.on_hand>0
    ORDER BY 1,3`));

  // ── 8. Manual adjustments masking the drift ───────────────────────────────
  log('\n=== 8. Manual adjustments (PRODUCTION_STOCK_ADJUSTMENT) in CCD-SP-002 ===');
  TABLE(await q(`
    SELECT sl.reference_number, sl.transaction_date::date, i.item_code,
           sl.direction, sl.quantity, sl.notes, sl.created_at::timestamp(0)
    FROM stock_ledger sl JOIN items i ON i.id=sl.item_id
    WHERE sl.warehouse_id='dc212cb0-364c-47ba-88db-1bde18f842de'
      AND sl.transaction_type='PRODUCTION_STOCK_ADJUSTMENT'
    ORDER BY sl.created_at DESC`));

  await c.end();
  log('\n[DONE - read-only, nothing written]');
})().catch((err) => { console.error('ERR:', err.message, err.stack); process.exit(1); });
