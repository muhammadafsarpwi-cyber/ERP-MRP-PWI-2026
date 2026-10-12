/* READ-ONLY: provenance of CCD-SP-002 balances that have NO ledger rows. */
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
  for (const r of rows) log('  ' + Object.values(r).map(String).join(' | '));
};
(async () => {
  const e = loadEnv();
  const c = new Client({ host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME,
    password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;

  log('=== A. inventory_balances columns ===');
  TABLE(await q(`SELECT column_name, data_type FROM information_schema.columns
                 WHERE table_name='inventory_balances' ORDER BY ordinal_position`));

  log('\n=== B. balance row provenance @ CCD-SP-002 ===');
  TABLE(await q(`
    SELECT i.item_code, b.on_hand, b.created_at::timestamp(0), b.updated_at::timestamp(0), b.status
    FROM inventory_balances b JOIN items i ON i.id=b.item_id
    WHERE b.warehouse_id='dc212cb0-364c-47ba-88db-1bde18f842de' ORDER BY i.item_code`));

  log('\n=== C. ANY stock_ledger rows for these 3 items (all warehouses, all types) ===');
  TABLE(await q(`
    SELECT i.item_code, w.warehouse_code, sl.reference_type, sl.transaction_type, sl.direction,
           COUNT(*)::int AS n, SUM(sl.quantity)::numeric AS qty, MIN(sl.created_at)::date AS first
    FROM stock_ledger sl JOIN items i ON i.id=sl.item_id LEFT JOIN warehouses w ON w.id=sl.warehouse_id
    WHERE i.item_code IN ('WIP-SP-002','WIP-SP-005','WIP-SP-010')
    GROUP BY 1,2,3,4,5 ORDER BY 1,2`));

  log('\n=== D. ledger rows for CCD-SP-002 — EVERY row ===');
  TABLE(await q(`
    SELECT i.item_code, sl.transaction_type, sl.reference_type, sl.direction, sl.quantity,
           sl.reference_number, sl.created_at::timestamp(0)
    FROM stock_ledger sl JOIN items i ON i.id=sl.item_id
    WHERE sl.warehouse_id='dc212cb0-364c-47ba-88db-1bde18f842de'
    ORDER BY sl.created_at`));

  log('\n=== E. which modules post reference_type values (whole DB) ===');
  TABLE(await q(`
    SELECT reference_type, COUNT(*)::int AS n, MAX(created_at)::date AS latest
    FROM stock_ledger GROUP BY 1 ORDER BY 2 DESC`));

  log('\n=== F. production_entries referencing CCD-SP-002 items, with posting flag ===');
  TABLE(await q(`
    SELECT pe.entry_number, pe.entry_date::date, i.item_code,
           pe.inventory_reference_id IS NULL AS ref_null,
           pe.deleted_at IS NOT NULL AS deleted, pe.is_active
    FROM production_entries pe JOIN items i ON i.id=pe.item_id
    WHERE i.item_code IN ('WIP-SP-002','WIP-SP-005','WIP-SP-010','WIP-SP-013','WIP-SP-014')
    ORDER BY pe.entry_date DESC LIMIT 30`));

  await c.end();
  log('\n[DONE - read-only]');
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
