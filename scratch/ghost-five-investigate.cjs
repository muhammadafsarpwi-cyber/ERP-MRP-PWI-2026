/**
 * FORENSIC DRY-RUN — the five "ghost under CCD-SP-002" rows. READ-ONLY.
 *
 * Reports SYSTEM BOOK STOCK under warehouse CCD-SP-002 for items whose
 * numbers match the five rows the user sees on the Production Item Open Stock
 * card. For each one we establish:
 *
 *   1. which table actually holds the number (balance snapshot vs ledger),
 *   2. the row's primary key + timestamps + who created it,
 *   3. whether ANY ledger row ever existed in CCD-SP-002 for that item,
 *   4. what the SAME item looks like in SPI-SPK-003, the department the user
 *      says it belongs to,
 *   5. whether a production entry ever referenced the pair.
 *
 * Run:  node scratch/ghost-five-investigate.cjs
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
  for (const r of rows) log('  ' + Object.values(r).map((v) => String(v)).join(' | '));
};
const n = (v) => Number(v || 0);
const fmt = (v) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Same net formula the reconcile endpoint and repair report use. */
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
  log('  THE FIVE GHOST ROWS UNDER CCD-SP-002 — WHERE DO THEY ACTUALLY LIVE?');
  log('  READ-ONLY. Nothing in this script writes to the database.');
  log(`  Company: ${company}`);
  log(`  Generated: ${new Date().toISOString()}`);
  log('══════════════════════════════════════════════════════════════════════════');

  // ── 0. Identify the two warehouses and the candidate items ───────────────
  log('\n\n0. THE PLAYERS');
  const whs = await q(`
    SELECT id, warehouse_code, name, division_id, warehouse_type, status
      FROM warehouses
     WHERE company_id=$1
       AND warehouse_code IN ('CCD-SP-002','SPI-SPK-003')
     ORDER BY warehouse_code`, [company]);
  TABLE(whs);

  const whCcd = whs.find((w) => w.warehouse_code === 'CCD-SP-002');
  const whSpk = whs.find((w) => w.warehouse_code === 'SPI-SPK-003');

  // The user names; match on the descriptive text the card renders.
  const NAMES = [
    'CD-250*17 Outer Butted',        // 77,651
    '250*17 Inner Straight',         // 42,700
    '125-300*17 Outer Butted',       // 72,000
    '125-300*17 Inner Straight',     // 114,942
    '125-300*17 Outer Straight',     // 3,000
  ];

  log('\n   Items matching the five descriptions (any warehouse):');
  const items = await q(`
    SELECT id, item_code, name, short_name, item_type, track_inventory, status, division_id
      FROM items
     WHERE company_id=$1
       AND ( ${NAMES.map((_, i) => `LOWER(COALESCE(name,'')) LIKE LOWER($${i + 2})`).join(' OR ')} )
     ORDER BY item_code`,
    [company, ...NAMES.map((s) => `%${s.replace(/\*/g, '\\*')}%`)]);
  TABLE(items);

  const itemIds = items.map((i) => i.id);

  // ── 1. The number on the card: what does inventory_balances say? ─────────
  log('\n\n1. WHERE THE NUMBER ON THE CARD COMES FROM');
  log('   `inventory_balances` is a SNAPSHOT column (`on_hand`), not a view.');
  log('   It is only correct if every writer that touches the ledger also');
  log('   touches it. These are the rows the card is reading:');
  const bals = await q(`
    SELECT ib.id AS balance_row_id,
           w.warehouse_code, i.item_code, i.name,
           ib.on_hand, ib.reserved, ib.available, ib.status,
           ib.location_id, ib.batch_id, ib.uom_id,
           ib.created_at, ib.updated_at, ib.created_by,
           (SELECT COUNT(*) FROM inventory_balances d
             WHERE d.company_id=ib.company_id AND d.item_id=ib.item_id
               AND d.warehouse_id=ib.warehouse_id AND d.id<>ib.id) AS duplicate_rows
      FROM inventory_balances ib
      JOIN warehouses w ON w.id = ib.warehouse_id
      JOIN items    i ON i.id  = ib.item_id
     WHERE ib.company_id=$1
       AND ib.warehouse_id = ANY($2)
       AND ib.item_id = ANY($3)
     ORDER BY w.warehouse_code, i.item_code`,
    [company, [whCcd?.id, whSpk?.id].filter(Boolean), itemIds]);
  TABLE(bals);

  // ── 2. Is there any ledger behind the CCD-SP-002 balances? ───────────────
  log('\n\n2. IS THERE A JOURNAL BEHIND THE CCD-SP-002 NUMBERS?');
  log('   `stock_ledger` is append-only and IS the journal. If a balance exists');
  log('   with no ledger rows, the number was written directly to the snapshot');
  log('   and no delete/edit path can ever find it again.');
  const ledCcd = await q(`
    SELECT w.warehouse_code, i.item_code,
           COUNT(*) AS ledger_rows,
           ${NET} AS ledger_net,
           MIN(sl.created_at) AS first_posted,
           MAX(sl.created_at) AS last_posted,
           STRING_AGG(DISTINCT sl.reference_type, ', ') AS reference_types
      FROM stock_ledger sl
      JOIN warehouses w ON w.id = sl.warehouse_id
      JOIN items    i ON i.id  = sl.item_id
     WHERE sl.company_id=$1
       AND sl.warehouse_id = $2
       AND sl.item_id = ANY($3)
     GROUP BY 1,2 ORDER BY 2`, [company, whCcd?.id, itemIds]);
  log('   --- CCD-SP-002 (where the card shows them) ---');
  TABLE(ledCcd);

  // ── 3. The same items in SPI-SPK-003, the department they belong to ──────
  log('\n\n3. THE SAME ITEMS IN SPI-SPK-003, WHERE THEY BELONG');
  const ledSpk = await q(`
    SELECT w.warehouse_code, i.item_code,
           COUNT(*) AS ledger_rows,
           ${NET} AS ledger_net
      FROM stock_ledger sl
      JOIN warehouses w ON w.id = sl.warehouse_id
      JOIN items    i ON i.id  = sl.item_id
     WHERE sl.company_id=$1
       AND sl.warehouse_id = $2
       AND sl.item_id = ANY($3)
     GROUP BY 1,2 ORDER BY 2`, [company, whSpk?.id, itemIds]);
  TABLE(ledSpk);

  // ── 4. Every ledger row for these items, everywhere, with its document ───
  log('\n\n4. THE FULL JOURNAL FOR THESE ITEMS — EVERY WAREHOUSE, EVERY ROW');
  const all = await q(`
    SELECT sl.id AS ledger_row_id,
           w.warehouse_code, i.item_code,
           sl.transaction_type, sl.direction, sl.quantity,
           ROUND((CASE
             WHEN sl.transaction_type = 'PRODUCTION_SCRAP' THEN 0
             WHEN sl.transaction_type = 'PRODUCTION_REVERSAL'
                  AND COALESCE(sl.notes,'') ~ '^Reversal of PRODUCTION_SCRAP' THEN 0
             WHEN sl.direction = 'OUT' THEN -sl.quantity ELSE sl.quantity END)::numeric, 2)
             AS this_row_net,
           sl.reference_type, sl.reference_id, sl.reference_number,
           sl.created_at, sl.created_by,
           sl.notes
      FROM stock_ledger sl
      JOIN warehouses w ON w.id = sl.warehouse_id
      JOIN items    i ON i.id  = sl.item_id
     WHERE sl.company_id=$1
       AND sl.item_id = ANY($2)
     ORDER BY i.item_code, sl.created_at`,
    [company, itemIds]);
  log(`   ${all.length} ledger row(s) for these five items across ALL warehouses:`);
  TABLE(all.map((r) => ({
    ...r,
    notes: r.notes ? String(r.notes).slice(0, 70) : null,
  })));

  // ── 5. Do any production entries reference these pairs? ──────────────────
  log('\n\n5. DO ANY LIVE PRODUCTION ENTRIES REFERENCE THESE PAIRS?');
  const pe = await q(`
    SELECT pe.id AS entry_id, pe.entry_number, pe.entry_date, pe.status,
           w.warehouse_code, i.item_code,
           pe.quantity, pe.created_at, pe.updated_at, pe.deleted_at, pe.is_active
      FROM production_entries pe
      JOIN warehouses w ON w.id = pe.warehouse_id
      JOIN items    i ON i.id  = pe.item_id
     WHERE pe.company_id=$1
       AND pe.item_id = ANY($2)
     ORDER BY pe.created_at`, [company, itemIds]);
  TABLE(pe);

  // ── 6. Orphaned open-stock ledger rows (their document is gone) ──────────
  log('\n\n6. ORPHANED PRODUCTION_ITEM_OPEN_STOCK ROWS FOR THESE ITEMS');
  log('   reference_id points at a document that no longer exists — these are');
  log('   the rows left behind by the hard-delete path.');
  const orph = await q(`
    SELECT sl.id AS ledger_row_id, w.warehouse_code, i.item_code,
           sl.direction, sl.quantity, sl.reference_type, sl.reference_id,
           sl.reference_number, sl.created_at, sl.created_by, sl.notes
      FROM stock_ledger sl
      JOIN warehouses w ON w.id = sl.warehouse_id
      JOIN items    i ON i.id  = sl.item_id
     WHERE sl.company_id=$1
       AND sl.reference_type = 'PRODUCTION_ITEM_OPEN_STOCK'
       AND sl.item_id = ANY($2)
     ORDER BY w.warehouse_code, sl.created_at`, [company, itemIds]);
  TABLE(orph);

  // ── 7. Side-by-side: the ledger says X, the snapshot says Y ──────────────
  log('\n\n7. SIDE BY SIDE — WHAT THE JOURNAL SAYS vs WHAT THE CARD SHOWS');
  const side = await q(`
    WITH led AS (
      SELECT sl.warehouse_id, sl.item_id, ${NET} AS ledger_net, COUNT(*) AS rows
        FROM stock_ledger sl
       WHERE sl.company_id=$1 AND sl.item_id = ANY($2)
       GROUP BY 1,2),
    bal AS (
      SELECT ib.warehouse_id, ib.item_id, SUM(ib.on_hand) AS on_hand, COUNT(*) AS rows
        FROM inventory_balances ib
       WHERE ib.company_id=$1 AND ib.item_id = ANY($2)
       GROUP BY 1,2)
    SELECT w.warehouse_code, i.item_code,
           COALESCE(led.rows,0)      AS ledger_rows,
           ROUND(COALESCE(led.ledger_net,0)::numeric,2) AS journal_says,
           COALESCE(bal.rows,0)      AS balance_rows,
           ROUND(COALESCE(bal.on_hand,0)::numeric,2)   AS card_shows,
           ROUND((COALESCE(bal.on_hand,0) - COALESCE(led.ledger_net,0))::numeric,2) AS gap
      FROM (SELECT DISTINCT warehouse_id, item_id
              FROM (SELECT warehouse_id, item_id FROM led
                    UNION SELECT warehouse_id, item_id FROM bal) u) p
      JOIN warehouses w ON w.id = p.warehouse_id
      JOIN items    i ON i.id  = p.item_id
      LEFT JOIN led ON led.warehouse_id = p.warehouse_id AND led.item_id = p.item_id
      LEFT JOIN bal ON bal.warehouse_id = p.warehouse_id AND bal.item_id = p.item_id
     ORDER BY i.item_code, w.warehouse_code`, [company, itemIds]);
  TABLE(side);

  const ccdGap = side.filter((r) => r.warehouse_code === 'CCD-SP-002')
    .reduce((s, r) => s + n(r.gap), 0);
  log(`\n   Net gap sitting under CCD-SP-002 (card − journal): ${fmt(ccdGap)}`);

  await c.end();
  log('\n[DONE — read-only, nothing was written]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });
