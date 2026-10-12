/**
 * MOVEMENT HYPOTHESIS — was the warehouse REASSIGNED after the fact?
 * READ-ONLY.
 *
 * The transaction footprint proves entry + receipt + balance were all written
 * in ONE transaction. They now disagree: entry and receipt say SPI-SPK-003,
 * the balance says CCD-SP-002. Since nothing in any revision passes two
 * different warehouses to the paired writers, the only remaining explanation
 * is that a later UPDATE moved the document and the ledger but not the
 * balance.
 *
 * Evidence to look for:
 *   1. a uniform `updated_at` across many production_entries (bulk UPDATE),
 *   2. entries whose ledger rows sit in a DIFFERENT warehouse than the entry,
 *   3. reversal rows stranded in the warehouse the receipts used to occupy,
 *   4. how many (item, warehouse) balance rows are left behind by that move.
 *
 * Run:  node scratch/ghost-five-move.cjs
 */
const fs = require('fs');
const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));

function loadEnv() {
  const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env');
  const o = {};
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim());
    if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return o;
}

const log = (s = '') => console.log(s);
const TABLE = (rows) => {
  if (!rows || !rows.length) { log('  (none)'); return; }
  log('  ' + Object.keys(rows[0]).join(' | '));
  for (const r of rows) log('  ' + Object.values(r).map(String).join(' | '));
};
const fmt = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });

(async () => {
  const e = loadEnv();
  const c = new Client({
    host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME,
    password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const company = (await q(`SELECT id FROM companies ORDER BY created_at LIMIT 1`))[0].id;

  log('══════════════════════════════════════════════════════════════════════════');
  log('  MOVEMENT HYPOTHESIS — was the warehouse reassigned after the fact?');
  log('  READ-ONLY. Nothing in this script writes to the database.');
  log('══════════════════════════════════════════════════════════════════════════');

  // ── 1. Bulk-update signature on production_entries ──────────────────────
  log('\n\n1. production_entries.updated_at HISTOGRAM (bulk UPDATE shows as a spike)');
  const hist = await q(`
    SELECT date_trunc('second', updated_at) AS second, COUNT(*) AS entries,
           MIN(created_at) AS earliest_created
      FROM production_entries
     WHERE company_id=$1
     GROUP BY 1 HAVING COUNT(*) > 3
     ORDER BY entries DESC LIMIT 12`, [company]);
  TABLE(hist.map((h) => ({
    second: new Date(h.second).toISOString(),
    entries: h.entries,
    earliest_created: new Date(h.earliest_created).toISOString(),
  })));

  // ── 2. Entries whose ledger disagrees with the entry's own warehouse ────
  log('\n\n2. ENTRIES WHOSE LEDGER ROWS SIT IN A DIFFERENT WAREHOUSE THAN THE ENTRY');
  log('   If the document and its journal disagree, one of them was reassigned.');
  const disagree = await q(`
    SELECT pe.entry_number,
           ew.warehouse_code AS entry_says,
           lw.warehouse_code AS ledger_says,
           COUNT(*) AS ledger_rows,
           pe.created_at, pe.updated_at, pe.is_active, pe.deleted_at
      FROM production_entries pe
      JOIN stock_ledger sl
        ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id = pe.id
      JOIN warehouses lw ON lw.id = sl.warehouse_id
      LEFT JOIN warehouses ew ON ew.id = pe.warehouse_id
     WHERE pe.company_id=$1
       AND pe.warehouse_id IS NOT NULL
       AND sl.warehouse_id <> pe.warehouse_id
     GROUP BY 1,2,3,5,6,7,8
     ORDER BY pe.entry_number`, [company]);
  log(`  ${disagree.length} entry document(s) have ledger rows in another warehouse:`);
  TABLE(disagree.map((d) => ({
    doc: d.entry_number, entry_says: d.entry_says, ledger_says: d.ledger_says,
    ledger_rows: d.ledger_rows,
    created: new Date(d.created_at).toISOString(),
    updated: new Date(d.updated_at).toISOString(),
    active: d.is_active, deleted: d.deleted_at ? 'YES' : 'no',
  })));

  // ── 3. Are the ghosts' receipts all from reassigned documents? ─────────
  log('\n\n3. THE FIVE GHOST ITEMS — receipts grouped by owning document warehouse');
  const codes = ['WIP-SP-002', 'WIP-SP-005', 'WIP-SP-010', 'WIP-SP-013', 'WIP-SP-014'];
  const items = await q(`SELECT id, item_code FROM items WHERE company_id=$1 AND item_code = ANY($2)`,
    [company, codes]);
  const itemIds = items.map((r) => r.id);
  const perDoc = await q(`
    SELECT lw.warehouse_code AS ledger_wh,
           ew.warehouse_code AS doc_wh,
           COUNT(*) AS receipt_rows,
           ROUND(SUM(sl.quantity)::numeric,2) AS qty
      FROM stock_ledger sl
      JOIN warehouses lw ON lw.id = sl.warehouse_id
      LEFT JOIN production_entries pe ON pe.id = sl.reference_id
      LEFT JOIN warehouses ew ON ew.id = pe.warehouse_id
     WHERE sl.company_id=$1 AND sl.item_id = ANY($2)
       AND sl.transaction_type='PRODUCTION_RECEIPT'
     GROUP BY 1,2 ORDER BY 1,2`, [company, itemIds]);
  TABLE(perDoc.map((r) => ({
    ledger_in: r.ledger_wh, doc_says: r.doc_wh ?? '(no doc)',
    receipts: r.receipt_rows, qty: fmt(r.qty),
    agree: r.ledger_wh === r.doc_wh ? 'yes' : 'NO',
  })));

  // ── 4. Reversals stranded in the pre-move warehouse ─────────────────────
  log('\n\n4. REVERSAL ROWS WHOSE WAREHOUSE DIFFERS FROM THEIR OWN DOCUMENT');
  log('   A reversal written BEFORE a reassignment stays where the original was;');
  log('   the original, moved later, no longer matches it.');
  const stranded = await q(`
    SELECT pe.entry_number, lw.warehouse_code AS reversal_wh,
           ew.warehouse_code AS doc_now, sl.transaction_type,
           ROUND(sl.quantity::numeric,2) AS qty, sl.created_at, sl.notes
      FROM stock_ledger sl
      JOIN production_entries pe ON pe.id = sl.reference_id
      JOIN warehouses lw ON lw.id = sl.warehouse_id
      LEFT JOIN warehouses ew ON ew.id = pe.warehouse_id
     WHERE sl.company_id=$1
       AND sl.transaction_type = 'PRODUCTION_REVERSAL'
       AND pe.warehouse_id IS NOT NULL
       AND sl.warehouse_id <> pe.warehouse_id
     ORDER BY sl.created_at`, [company]);
  log(`  ${stranded.length} stranded reversal row(s):`);
  TABLE(stranded.map((s) => ({
    doc: s.entry_number, reversal_in: s.reversal_wh, doc_now: s.doc_now,
    type: s.transaction_type, qty: fmt(s.qty),
    at: new Date(s.created_at).toISOString(),
    notes: s.notes ? String(s.notes).slice(0, 52) : null,
  })));

  // ── 5. Scale: how many balance rows sit in a warehouse with no journal ──
  log('\n\n5. SCALE — balance rows with NO journal in their warehouse (company-wide)');
  const orphan = await q(`
    WITH led AS (
      SELECT warehouse_id, item_id, COUNT(*) AS n
        FROM stock_ledger WHERE company_id=$1 GROUP BY 1,2)
    SELECT w.warehouse_code, d.division_code,
           COUNT(*) AS balance_rows,
           ROUND(SUM(ib.on_hand)::numeric,2) AS total_on_hand
      FROM inventory_balances ib
      JOIN warehouses w ON w.id = ib.warehouse_id
      LEFT JOIN divisions d ON d.id = w.division_id
      LEFT JOIN led ON led.warehouse_id = ib.warehouse_id AND led.item_id = ib.item_id
     WHERE ib.company_id=$1 AND led.n IS NULL AND ib.on_hand <> 0
     GROUP BY 1,2 ORDER BY total_on_hand DESC`, [company]);
  TABLE(orphan.map((o) => ({
    warehouse: o.warehouse_code, division: o.division_code ?? '(none)',
    balance_rows: o.balance_rows, total_on_hand: fmt(o.total_on_hand),
  })));

  await c.end();
  log('\n[DONE — read-only, nothing was written]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });
