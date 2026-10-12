/**
 * XMIN PROOF — was the stock_ledger row MOVED after it was created?
 * READ-ONLY.
 *
 * Postgres `now()` = transaction_start, so `created_at` equality across tables
 * only proves the rows were born in the same transaction. It says nothing
 * about the CURRENT warehouse — an UPDATE does not touch created_at.
 *
 * `xmin` is the xid of the transaction that wrote the row's current version:
 *   - untouched row   -> xmin == the inserting transaction
 *   - UPDATEd row     -> xmin == the updating transaction (newer xid)
 *
 * So if a receipt row's xmin differs from its sibling balance row's xmin
 * (which was demonstrably written in the same transaction — identical
 * created_at to the microsecond), the receipt row was rewritten in place.
 *
 * Run:  node scratch/ghost-five-xmin.cjs > scratch/ghost-xmin.txt
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
const fmt = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 });

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
  log('  XMIN PROOF — was a stock_ledger row rewritten after birth?');
  log('  READ-ONLY. Nothing in this script writes to the database.');
  log('══════════════════════════════════════════════════════════════════════════');

  // ── 0. Server capability ────────────────────────────────────────────────
  log('\n\n0. SERVER CAPABILITY');
  try {
    const t = await q(`SHOW track_commit_timestamp`);
    log(`  track_commit_timestamp = ${t[0].setting}`);
  } catch (err) { log(`  track_commit_timestamp: ${err.message}`); }
  try {
    const v = await q(`SELECT version() AS v`);
    log(`  ${v[0].v}`);
  } catch (err) { log(`  version: ${err.message}`); }
  let commitTs = false;
  try {
    const r = await q(`SELECT pg_xact_commit_timestamp('0') AS t`);
    log(`  pg_xact_commit_timestamp available: ${r[0].t}`);
    commitTs = true;
  } catch (err) { log(`  pg_xact_commit_timestamp: UNAVAILABLE (${err.message.split('\n')[0]})`); }

  const codes = ['WIP-SP-002', 'WIP-SP-005', 'WIP-SP-010', 'WIP-SP-013', 'WIP-SP-014'];
  const items = await q(`SELECT id, item_code FROM items WHERE company_id=$1 AND item_code = ANY($2) ORDER BY item_code`,
    [company, codes]);
  const itemIds = items.map((r) => r.id);

  // ── 1. Per item: ledger rows vs balance rows, with xmin ─────────────────
  log('\n\n1. PER ITEM — stock_ledger rows vs inventory_balances rows (xmin = writer xid)');
  log('   Identical xmin => both rows still carry their ORIGINAL version.');
  log('   A NEWER xmin on the ledger row => that row was UPDATEd after birth.');
  for (const it of items) {
    log(`\n  ── ${it.item_code} ─────────────────────────────────────────────`);
    const led = await q(`
      SELECT sl.transaction_type AS kind, w.warehouse_code AS wh,
             sl.direction, ROUND(sl.quantity::numeric,2) AS qty,
             to_char(sl.created_at,'YYYY-MM-DD HH24:MI:SS.US') AS created_at,
             sl.xmin::text::bigint AS xmin, pe.entry_number
        FROM stock_ledger sl
        JOIN warehouses w ON w.id = sl.warehouse_id
        LEFT JOIN production_entries pe ON pe.id = sl.reference_id
       WHERE sl.company_id=$1 AND sl.item_id=$2
       ORDER BY sl.created_at`, [company, it.id]);
    TABLE(led.map((r) => ({ ...r, created_at: r.created_at.replace('T', ' ') })));

    const bal = await q(`
      SELECT w.warehouse_code AS wh, ROUND(ib.on_hand::numeric,2) AS on_hand,
             to_char(ib.created_at,'YYYY-MM-DD HH24:MI:SS.US') AS created_at,
             to_char(ib.updated_at,'YYYY-MM-DD HH24:MI:SS.US') AS updated_at,
             ib.xmin::text::bigint AS xmin, ib.created_by
        FROM inventory_balances ib
        JOIN warehouses w ON w.id = ib.warehouse_id
       WHERE ib.company_id=$1 AND ib.item_id=$2
       ORDER BY ib.created_at`, [company, it.id]);
    log('  -- inventory_balances --');
    TABLE(bal);

    // born-together pairs: balance created_at == ledger created_at (to the us)
    const pairs = [];
    for (const b of bal) {
      for (const l of led) {
        if (String(l.created_at) === String(b.created_at)) {
          pairs.push({
            born_together: `${l.kind}@${l.wh}`,
            ledger_xmin: l.xmin,
            balance_wh: b.wh,
            balance_xmin: b.xmin,
            same_xmin: String(l.xmin) === String(b.xmin) ? 'YES' : 'NO -> LEDGER REWRITTEN',
          });
        }
      }
    }
    log('  -- born-in-the-same-transaction pairs (identical created_at) --');
    TABLE(pairs);
  }

  // ── 2. The stranded reversals: proof of WHERE receipts lived on Oct 10 ──
  log('\n\n2. STRANDED REVERSALS — receipt vs its own reversal, with xmin');
  log('   The reversal writer copies m.warehouse_id from the row it reverses,');
  log('   so a reversal in CCD-SP-002 means the receipt was IN CCD-SP-002 then.');
  const stranded = await q(`
    SELECT pe.entry_number, pe.is_active,
           ew.warehouse_code AS doc_now,
           pe.created_at::text AS doc_created,
           pe.updated_at::text AS doc_updated,
           pe.xmin::text::bigint AS doc_xmin,
           sl.transaction_type AS kind, sl.direction,
           w.warehouse_code AS wh, ROUND(sl.quantity::numeric,2) AS qty,
           to_char(sl.created_at,'YYYY-MM-DD HH24:MI:SS.US') AS created_at,
           sl.xmin::text::bigint AS xmin
      FROM stock_ledger sl
      JOIN production_entries pe ON pe.id = sl.reference_id
      JOIN warehouses w ON w.id = sl.warehouse_id
      LEFT JOIN warehouses ew ON ew.id = pe.warehouse_id
     WHERE sl.company_id=$1
       AND sl.transaction_type IN ('PRODUCTION_RECEIPT','PRODUCTION_SCRAP','PRODUCTION_REVERSAL')
       AND pe.entry_number IN ('PE-2026-00308','PE-2026-00312')
     ORDER BY pe.entry_number, sl.created_at`, [company]);
  TABLE(stranded);

  // ── 3. Global: every entry whose receipt rows disagree with a reversal ──
  log('\n\n3. GLOBAL — receipts that sit in a DIFFERENT warehouse than their reversal');
  const both = await q(`
    WITH r AS (
      SELECT reference_id, warehouse_id, created_at, xmin FROM stock_ledger
       WHERE company_id=$1 AND transaction_type='PRODUCTION_RECEIPT'),
      v AS (
      SELECT reference_id, warehouse_id, created_at, xmin, notes FROM stock_ledger
       WHERE company_id=$1 AND transaction_type='PRODUCTION_REVERSAL'
         AND notes LIKE 'Reversal of PRODUCTION_RECEIPT%')
    SELECT pe.entry_number, rw.warehouse_code AS receipt_wh, vw.warehouse_code AS reversal_wh,
           to_char(r.created_at,'YYYY-MM-DD HH24:MI:SS.US') AS receipt_created,
           r.xmin::text::bigint AS receipt_xmin,
           to_char(v.created_at,'YYYY-MM-DD HH24:MI:SS.US') AS reversal_created,
           v.xmin::text::bigint AS reversal_xmin
      FROM r JOIN v ON v.reference_id = r.reference_id AND v.warehouse_id <> r.warehouse_id
      JOIN production_entries pe ON pe.id = r.reference_id
      JOIN warehouses rw ON rw.id = r.warehouse_id
      JOIN warehouses vw ON vw.id = v.warehouse_id
     ORDER BY pe.entry_number`, [company]);
  log(`  ${both.length} entrie(s):`);
  TABLE(both);

  // ── 4. What ran at 05:57:46.356Z (11 entries)? The actual documents ─────
  log('\n\n4. THE 11 ENTRIES TOUCHED IN ONE BULK STATEMENT @ 2026-10-11T05:57:46.356Z');
  const eleven = await q(`
    SELECT pe.entry_number, pe.machine_no,
           w.warehouse_code AS entry_wh, d.division_code AS entry_div,
           to_char(pe.created_at,'YYYY-MM-DD HH24:MI:SS.US') AS created,
           to_char(pe.updated_at,'YYYY-MM-DD HH24:MI:SS.US') AS updated,
           pe.xmin::text::bigint AS xmin, pe.is_active, pe.deleted_at IS NOT NULL AS deleted,
           pe.created_by::text AS by
      FROM production_entries pe
      LEFT JOIN warehouses w ON w.id = pe.warehouse_id
      LEFT JOIN divisions d ON d.id = pe.division_id
     WHERE pe.company_id=$1
       AND date_trunc('second', pe.updated_at) = '2026-10-11 05:57:46+00'
     ORDER BY pe.entry_number`, [company]);
  log(`  ${eleven.length} entries:`);
  TABLE(eleven);

  // and their ledger/balance footprint
  if (eleven.length) {
    const nums = eleven.map((r) => r.entry_number);
    const rows = await q(`
      SELECT pe.entry_number, sl.transaction_type AS kind, w.warehouse_code AS wh,
             i.item_code, ROUND(sl.quantity::numeric,2) AS qty,
             to_char(sl.created_at,'YYYY-MM-DD HH24:MI:SS.US') AS created,
             sl.xmin::text::bigint AS xmin
        FROM stock_ledger sl
        JOIN production_entries pe ON pe.id = sl.reference_id
        JOIN warehouses w ON w.id = sl.warehouse_id
        JOIN items i ON i.id = sl.item_id
       WHERE pe.company_id=$1 AND pe.entry_number = ANY($2)
       ORDER BY pe.entry_number, sl.created_at`, [company, nums]);
    log('\n  -- their stock_ledger footprint --');
    TABLE(rows);
  }

  // ── 5. Bulk spikes again, but on stock_ledger-owning entries ────────────
  log('\n\n5. BULK-STATEMENT SPIKES ON production_entries (for cross-reference)');
  const hist = await q(`
    SELECT to_char(date_trunc('second', updated_at),'YYYY-MM-DD HH24:MI:SS') AS at,
           COUNT(*) AS entries, MIN(xmin::text::bigint) AS xmin_min, MAX(xmin::text::bigint) AS xmin_max
      FROM production_entries
     WHERE company_id=$1
     GROUP BY 1 HAVING COUNT(*) > 3 ORDER BY entries DESC LIMIT 10`, [company]);
  TABLE(hist);

  // ── 6. Current net position: does ledger net match balance, per wh ──────
  log('\n\n6. THE FIVE ITEMS — ledger net vs balance, per warehouse (the drift)');
  const drift = await q(`
    SELECT i.item_code, w.warehouse_code AS wh,
           ROUND(COALESCE(led.net,0)::numeric,3) AS ledger_net,
           ROUND(COALESCE(ib.on_hand,0)::numeric,3) AS balance,
           ROUND((COALESCE(ib.on_hand,0) - COALESCE(led.net,0))::numeric,3) AS drift
      FROM items i
      CROSS JOIN warehouses w
      LEFT JOIN inventory_balances ib ON ib.item_id=i.id AND ib.warehouse_id=w.id AND ib.company_id=$1
      LEFT JOIN (SELECT item_id, warehouse_id, SUM(CASE WHEN direction='IN' THEN quantity ELSE -quantity END) AS net
                   FROM stock_ledger WHERE company_id=$1 GROUP BY 1,2) led
             ON led.item_id=i.id AND led.warehouse_id=w.id
     WHERE i.company_id=$1 AND i.item_code = ANY($2)
       AND w.id IN ('dc212cb0-364c-47ba-88db-1bde18f842de',
                    '29e71f41-713e-45dc-bd69-4a3ce05a3801')
       AND (ib.id IS NOT NULL OR COALESCE(led.net,0) <> 0)
     ORDER BY i.item_code, w.warehouse_code`, [company, codes]);
  TABLE(drift);

  await c.end();
  log('\n[DONE — read-only, nothing was written]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });
