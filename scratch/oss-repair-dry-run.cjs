/**
 * DRY-RUN historical repair report — READ-ONLY, WRITES NOTHING.
 *
 * The forward-looking fixes are in the code now: deleting a production entry
 * reverses its postings, deleting a ledger row unwinds the balance, and the
 * recycle-bin purge reverses before it destroys. Those stop the rot.
 *
 * This script measures the damage that was already done BEFORE those fixes —
 * rows that were deleted without being reversed, ledger rows that were
 * hard-deleted while their balance stayed, entries that predate the recycle
 * bin entirely. It emits the exact statements a repair WOULD run, so the
 * correction can be reviewed and signed off rather than applied blind.
 *
 * WHY IT DOES NOT JUST FIX IT. Blind reconciliation in either direction is
 * unsafe here, and the numbers below show why: the two sides are wrong by
 * DIFFERENT amounts in DIFFERENT directions. Balances are overstated by stock
 * that was never reversed off them; the ledger is understated by rows that
 * were hard-deleted. Picking either side as "the truth" pushes warehouses
 * negative — 11 of them today. Any repair has to be deliberate, per pair,
 * with a human deciding what the correct figure actually is.
 *
 * Run:  node scratch/oss-repair-dry-run.cjs
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
  if (!rows.length) { log('  (none)'); return; }
  log('  ' + Object.keys(rows[0]).join(' | '));
  for (const r of rows) log('  ' + Object.values(r).map(String).join(' | '));
};
const n = (v) => Number(v || 0);
const fmt = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Scrap never moved the balance — see common/stock-movement.classifier.ts. */
const NET = `SUM(CASE
    WHEN sl.transaction_type = 'PRODUCTION_SCRAP' THEN 0
    WHEN sl.transaction_type = 'PRODUCTION_REVERSAL'
         AND COALESCE(sl.notes,'') ~ '^Reversal of PRODUCTION_SCRAP' THEN 0
    WHEN sl.direction = 'OUT' THEN -sl.quantity ELSE sl.quantity END)`;

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
  log('  PRODUCTION ITEM OPEN STOCK — HISTORICAL REPAIR REPORT (DRY RUN)');
  log('  Nothing in this script writes to the database.');
  log(`  Company: ${company}`);
  log(`  Generated: ${new Date().toISOString()}`);
  log('══════════════════════════════════════════════════════════════════════════');

  // ── A. Deleted entries that are still on the books ────────────────────────
  log('\n\nA. GHOST STOCK — entries that were DELETED but never reversed');
  log('   These documents are gone from the entry grid. The stock they put on');
  log('   the books is not. This is the "SYSTEM BOOK STOCK" nobody can explain.');

  const ghosts = await q(`
    WITH per AS (
      SELECT pe.id, pe.entry_number, pe.machine_no, pe.entry_date,
             (pe.deleted_at IS NOT NULL) AS in_bin,
             (pe.inventory_reference_id IS NULL) AS ref_null,
             ${NET} AS net
        FROM production_entries pe
        JOIN stock_ledger sl
          ON sl.reference_type = 'PRODUCTION_ENTRY' AND sl.reference_id = pe.id
       WHERE pe.company_id = $1 AND pe.is_active = false
       GROUP BY pe.id, pe.entry_number, pe.machine_no, pe.entry_date,
                pe.deleted_at, pe.inventory_reference_id)
    SELECT * FROM per WHERE ABS(net) > 0.0001
    ORDER BY ABS(net) DESC`, [company]);

  log(`\n   ${ghosts.length} deleted entry/entries still hold stock.`);
  const ghostTotal = ghosts.reduce((s, r) => s + n(r.net), 0);
  log(`   Net ghost quantity: ${fmt(ghostTotal)}`);
  log(`   Of these, ${ghosts.filter((r) => !r.ref_null).length} still carry a ledger reference`);
  log(`   (the old code skipped reversal when the flag was NULL — ${ghosts.filter((r) => r.ref_null).length} were caught by that).`);
  log(`   ${ghosts.filter((r) => !r.in_bin).length} predate the Recycle Bin: deleted with no deleted_at,`);
  log('   so they are invisible in BOTH the grid and the bin.');

  TABLE(ghosts.slice(0, 20).map((r) => ({
    entry: r.entry_number || r.id.slice(0, 8),
    machine: r.machine_no,
    date: String(r.entry_date).slice(0, 10),
    in_bin: r.in_bin,
    flag_null: r.ref_null,
    net: fmt(r.net),
  })));

  // ── A2. Per warehouse/item, the shape a repair would take ────────────────
  log('\n\nA2. GHOST STOCK BY WAREHOUSE / ITEM — what a repair would reverse');
  const ghostByItem = await q(`
    WITH rws AS (
      SELECT pe.id AS entry_id, sl.warehouse_id, sl.item_id,
             CASE WHEN sl.transaction_type='PRODUCTION_SCRAP' THEN 0
                  WHEN sl.transaction_type='PRODUCTION_REVERSAL'
                       AND COALESCE(sl.notes,'') ~ '^Reversal of PRODUCTION_SCRAP' THEN 0
                  WHEN sl.direction='OUT' THEN -sl.quantity ELSE sl.quantity END AS row_net
        FROM production_entries pe
        JOIN stock_ledger sl
          ON sl.reference_type='PRODUCTION_ENTRY' AND sl.reference_id=pe.id
       WHERE pe.company_id=$1 AND pe.is_active=false),
    net AS (SELECT entry_id, SUM(row_net) AS entry_net FROM rws GROUP BY entry_id)
    SELECT w.warehouse_code, i.item_code,
           ROUND(SUM(r.row_net)::numeric,2) AS ghost_qty,
           COUNT(DISTINCT r.entry_id)::int AS deleted_entries
      FROM rws r JOIN net n2 ON n2.entry_id = r.entry_id
      JOIN items i ON i.id = r.item_id
      JOIN warehouses w ON w.id = r.warehouse_id
     WHERE ABS(n2.entry_net) > 0.0001
     GROUP BY 1,2 HAVING ABS(SUM(r.row_net)) > 0.0001
     ORDER BY ABS(SUM(r.row_net)) DESC`, [company]);

  log(`\n   ${ghostByItem.length} warehouse/item pair(s) affected.`);
  TABLE(ghostByItem.slice(0, 25));

  log('\n   Statements a repair WOULD execute (one per pair, INSIDE a transaction):');
  log('   -- each reverses the ghost quantity without inventing a second');
  log('   -- balance row (inventory_balances has no unique constraint).');
  log('');
  ghostByItem.slice(0, 10).forEach((r) => {
    const dir = n(r.ghost_qty) > 0 ? 'OUT' : 'IN';
    log(`   -- ${r.warehouse_code} / ${r.item_code}: ${fmt(r.ghost_qty)} → ${dir} ${fmt(Math.abs(r.ghost_qty))}`);
  });
  if (ghostByItem.length > 10) log(`   -- … and ${ghostByItem.length - 10} more`);

  // ── B. Orphaned ledger rows ──────────────────────────────────────────────
  log('\n\nB. ORPHANED LEDGER ROWS — journal entries with no document behind them');
  log('   Left by recycle-bin purges and by hard deletes. They inflate every');
  log('   ledger-based report while explaining nothing.');

  const orphans = await q(`
    SELECT COALESCE(sl.reference_type,'(null)') AS ref_type, COUNT(*)::int AS rows,
           ROUND(SUM(CASE WHEN sl.transaction_type='PRODUCTION_SCRAP' THEN 0
                          WHEN sl.direction='OUT' THEN -sl.quantity ELSE sl.quantity END)::numeric,2) AS net_qty
      FROM stock_ledger sl
     WHERE sl.company_id=$1
       AND (sl.reference_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM production_entries pe WHERE pe.id = sl.reference_id))
     GROUP BY 1 ORDER BY 2 DESC`, [company]);
  TABLE(orphans);

  // ── C. Overall ledger vs balance drift ───────────────────────────────────
  log('\n\nC. LEDGER vs BALANCE DRIFT — the full picture');
  log('   Same computation as GET /production/open-stock/reconcile.');

  const drift = await q(`
    WITH led AS (
      SELECT sl.warehouse_id, sl.item_id, ${NET} AS ledger_net
        FROM stock_ledger sl JOIN items item ON item.id = sl.item_id
       WHERE sl.company_id=$1 GROUP BY sl.warehouse_id, sl.item_id),
    bal AS (
      SELECT ib.warehouse_id, ib.item_id, SUM(ib.on_hand) AS on_hand
        FROM inventory_balances ib JOIN items item ON item.id = ib.item_id
       WHERE ib.company_id=$1 GROUP BY ib.warehouse_id, ib.item_id)
    SELECT w.warehouse_code, i.item_code,
           ROUND(COALESCE(d.ledger_net,0)::numeric,2) AS ledger_net,
           ROUND(COALESCE(d.on_hand,0)::numeric,2) AS on_hand
      FROM (SELECT COALESCE(led.warehouse_id,bal.warehouse_id) AS wh,
                   COALESCE(led.item_id,bal.item_id) AS item,
                   led.ledger_net, bal.on_hand
              FROM led FULL OUTER JOIN bal
                ON bal.warehouse_id=led.warehouse_id AND bal.item_id=led.item_id) AS d
      JOIN warehouses w ON w.id=d.wh JOIN items i ON i.id=d.item
     WHERE ABS(COALESCE(d.on_hand,0) - COALESCE(d.ledger_net,0)) > 0.0001
     ORDER BY ABS(COALESCE(d.on_hand,0) - COALESCE(d.ledger_net,0)) DESC`, [company]);
  const driftTotal = drift.reduce((s, r) => s + (n(r.on_hand) - n(r.ledger_net)), 0);
  log(`\n   ${drift.length} pair(s) drift. Net (balance − ledger): ${fmt(driftTotal)}`);
  log(`   Balance ahead: ${drift.filter((r) => n(r.on_hand) > n(r.ledger_net)).length} pair(s)`);
  log(`   Ledger ahead:  ${drift.filter((r) => n(r.on_hand) < n(r.ledger_net)).length} pair(s)`);
  TABLE(drift.slice(0, 15).map((r) => ({
    warehouse: r.warehouse_code, item: r.item_code,
    ledger_net: r.ledger_net, on_hand: r.on_hand,
    drift: fmt(n(r.on_hand) - n(r.ledger_net)),
  })));

  // ── D. Why a blanket reconcile is unsafe ─────────────────────────────────
  log('\n\nD. WHY THIS IS REPORT-ONLY — what a blanket reconcile would do');
  // Forcing balance := ledger_net leaves the pair negative exactly when ledger_net < 0.
  const negatives = drift.filter((r) => n(r.ledger_net) < 0);
  log(`\n   Forcing every balance to match its ledger would drive ${negatives.length} pair(s) NEGATIVE:`);
  TABLE(negatives.slice(0, 15).map((r) => ({
    warehouse: r.warehouse_code, item: r.item_code,
    on_hand: r.on_hand, after: fmt(n(r.ledger_net)),
  })));
  log('\n   A negative on-hand is a real signal, not a rounding artefact — but');
  log('   it must be a decision, not a side effect of running a repair script.');

  // ── E. CCD-SP-002, the card that prompted this ───────────────────────────
  log('\n\nE. CCD-SP-002 — the specific card that started this investigation');
  const ccd = await q(`
    WITH led AS (
      SELECT sl.item_id, ${NET} AS ledger_net
        FROM stock_ledger sl WHERE sl.company_id=$1 AND sl.warehouse_id=$2
       GROUP BY sl.item_id),
    bal AS (
      SELECT ib.item_id, SUM(ib.on_hand) AS on_hand
        FROM inventory_balances ib WHERE ib.company_id=$1 AND ib.warehouse_id=$2 AND ib.status='ACTIVE'
       GROUP BY ib.item_id)
    SELECT COALESCE(i.item_code, '(unknown)') AS item,
           ROUND(COALESCE(led.ledger_net,0)::numeric,2) AS ledger_net,
           ROUND(COALESCE(bal.on_hand,0)::numeric,2) AS system_book_stock,
           ROUND((COALESCE(bal.on_hand,0) - COALESCE(led.ledger_net,0))::numeric,2) AS drift,
           (SELECT COUNT(*)::int FROM stock_ledger s2
             WHERE s2.company_id=$1 AND s2.warehouse_id=$2 AND s2.item_id=COALESCE(led.item_id,bal.item_id)) AS ledger_rows
      FROM led FULL OUTER JOIN bal ON bal.item_id=led.item_id
      LEFT JOIN items i ON i.id = COALESCE(led.item_id,bal.item_id)
     WHERE ABS(COALESCE(bal.on_hand,0) - COALESCE(led.ledger_net,0)) > 0.0001
     ORDER BY ABS(COALESCE(bal.on_hand,0) - COALESCE(led.ledger_net,0)) DESC`,
    [company, 'dc212cb0-364c-47ba-88db-1bde18f842de']);
  TABLE(ccd);

  // ── Summary ──────────────────────────────────────────────────────────────
  log('\n\n══════════════════════════════════════════════════════════════════════════');
  log('  SUMMARY');
  log('══════════════════════════════════════════════════════════════════════════');
  log(`  A. Deleted entries still on the books ...... ${ghosts.length} entries, net ${fmt(ghostTotal)}`);
  log(`  A2. Warehouse/item pairs to reverse ....... ${ghostByItem.length}`);
  log(`  B. Orphaned ledger rows .................... ${orphans.reduce((s, r) => s + n(r.rows), 0)}`);
  log(`  C. Pairs where ledger ≠ balance ........... ${drift.length}, net ${fmt(driftTotal)}`);
  log(`  D. Pairs a blanket reconcile would break .. ${negatives.length}`);
  log('');
  log('  NEXT STEPS');
  log('  1. Review A2 and confirm each ghost quantity is genuinely reversed');
  log('     stock, not a document that should be restored instead.');
  log('  2. Repair A2 per pair, in a transaction, using the balance row\'s OWN');
  log('     uom_id. Do NOT blanket-reconcile C — see D.');
  log('  3. Delete nothing from stock_ledger. It is append-only: reverse it.');
  log('  4. Re-run this script; A and A2 should report zero.');
  log('  5. Wire GET /production/open-stock/reconcile into monitoring so a NEW');
  log('     drift is caught in hours rather than whenever a user notices.');
  log('══════════════════════════════════════════════════════════════════════════');

  await c.end();
  log('\n[DONE — read-only, nothing was written]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });
