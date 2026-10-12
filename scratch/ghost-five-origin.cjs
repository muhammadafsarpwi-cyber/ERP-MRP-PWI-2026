/**
 * ORIGIN TRACE for the five CCD-SP-002 ghost balances. READ-ONLY.
 *
 * For each ghost row, the receipts whose timestamps coincide are PE-2026-002xx
 * documents. This traces each of those documents back to its production_entries
 * row and asks the decisive question:
 *
 *     what warehouse did the DOCUMENT itself claim?
 *
 * If the document says SPI-SPK-003 and the ledger says SPI-SPK-003, then the
 * LEDGER is right and the BALANCE row under CCD-SP-002 was written by something
 * else. If the document says CCD-SP-002, the balance is right and the ledger
 * row is the anomaly.
 *
 * Run:  node scratch/ghost-five-origin.cjs
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
const n = (v) => Number(v || 0);
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

  const WH_CCD = 'dc212cb0-364c-47ba-88db-1bde18f842de';
  const WH_SPK = '29e71f41-713e-45dc-bd69-4a3ce05a3801';
  const CODES = ['WIP-SP-002', 'WIP-SP-005', 'WIP-SP-010', 'WIP-SP-013', 'WIP-SP-014'];

  log('══════════════════════════════════════════════════════════════════════════');
  log('  ORIGIN TRACE — what did the DOCUMENT itself claim?');
  log('  READ-ONLY. Nothing in this script writes to the database.');
  log('══════════════════════════════════════════════════════════════════════════');

  const items = await q(`SELECT id, item_code FROM items WHERE company_id=$1 AND item_code = ANY($2)`,
    [company, CODES]);
  const itemIds = items.map((r) => r.id);

  // ── 1. The receipts that coincide with the ghost rows, joined to their doc ─
  log('\n\n1. THE COINCIDENT RECEIPTS, JOINED BACK TO THEIR PRODUCTION ENTRY');
  const joined = await q(`
    SELECT sl.reference_number AS doc,
           sl.id AS ledger_row, w.warehouse_code AS ledger_wh,
           i.item_code, sl.quantity,
           sl.created_at AS ledger_written_at,
           EXTRACT(EPOCH FROM (sl.created_at - b.created_at)) AS created_delta_s,
           EXTRACT(EPOCH FROM (sl.created_at - b.updated_at)) AS updated_delta_s,
           cw.warehouse_code AS doc_claims_wh,
           pe.warehouse_id AS doc_wh_id,
           pe.raw_material_warehouse_id AS doc_rm_wh_id,
           pe.entry_date, pe.machine_no,
           pe.actual_quantity AS doc_actual_qty,
           pe.is_active AS doc_is_active,
           pe.deleted_at AS doc_deleted_at
      FROM stock_ledger sl
      JOIN items i ON i.id = sl.item_id
      JOIN warehouses w ON w.id = sl.warehouse_id
      JOIN inventory_balances b
        ON b.company_id = sl.company_id AND b.item_id = sl.item_id
       AND b.warehouse_id = $2
      LEFT JOIN production_entries pe ON pe.id = sl.reference_id
      LEFT JOIN warehouses cw ON cw.id = pe.warehouse_id
     WHERE sl.company_id = $1
       AND sl.transaction_type = 'PRODUCTION_RECEIPT'
       AND sl.item_id = ANY($3)
       AND (ABS(EXTRACT(EPOCH FROM (sl.created_at - b.created_at))) <= 2
            OR ABS(EXTRACT(EPOCH FROM (sl.created_at - b.updated_at))) <= 2)
     ORDER BY i.item_code, sl.created_at`,
    [company, WH_CCD, itemIds]);
  log('   Each row: a receipt ledger row that was written within 2 seconds of a');
  log('   ghost balance row being created/updated. `doc_claims_wh` is the');
  log('   warehouse stored on the production entry document itself.');
  TABLE(joined.map((r) => ({
    item: r.item_code, doc: r.doc, qty: fmt(r.quantity),
    ledger_in: r.ledger_wh, document_claims: r.doc_claims_wh ?? '(entry gone)',
    d_created_s: r.created_delta_s == null ? '' : Number(r.created_delta_s).toFixed(3),
    d_updated_s: r.updated_delta_s == null ? '' : Number(r.updated_delta_s).toFixed(3),
    doc_deleted: r.doc_deleted_at,
  })));

  const agree = joined.filter((r) => r.ledger_wh === r.doc_claims_wh).length;
  log(`\n   ${agree}/${joined.length} receipts agree with their own document's warehouse.`);
  if (joined.length && agree === joined.length) {
    log('   → The LEDGER matches the DOCUMENT. The balance row is the odd one out.');
  }

  // ── 2. Did ANY receipt ever land in CCD-SP-002 for these items? ──────────
  log('\n\n2. DID ANY RECEIPT EVER LAND IN CCD-SP-002 FOR THESE ITEMS?');
  const ccdReceipts = await q(`
    SELECT sl.id, i.item_code, sl.quantity, sl.reference_number, sl.created_at
      FROM stock_ledger sl
      JOIN items i ON i.id = sl.item_id
     WHERE sl.company_id=$1 AND sl.warehouse_id=$2
       AND sl.transaction_type='PRODUCTION_RECEIPT' AND sl.item_id = ANY($3)
     ORDER BY i.item_code, sl.created_at`, [company, WH_CCD, itemIds]);
  log('   If empty: the ledger NEVER put a single unit of these items in CCD-SP-002.');
  TABLE(ccdReceipts.map((r) => ({ ...r, created_at: r.created_at.toISOString() })));

  // ── 3. Every ledger row that DID touch CCD-SP-002 for these items ────────
  log('\n\n3. THE ONLY CCD-SP-002 JOURNAL ACTIVITY FOR THESE ITEMS');
  const ccdAll = await q(`
    SELECT sl.id AS ledger_row, i.item_code, sl.transaction_type, sl.direction,
           sl.quantity, sl.reference_type, sl.reference_number, sl.created_at
      FROM stock_ledger sl
      JOIN items i ON i.id = sl.item_id
     WHERE sl.company_id=$1 AND sl.warehouse_id=$2 AND sl.item_id = ANY($3)
     ORDER BY i.item_code, sl.created_at`, [company, WH_CCD, itemIds]);
  TABLE(ccdAll.map((r) => ({ ...r, created_at: r.created_at.toISOString() })));

  // ── 4. Is the document still alive? (the "no live entries" claim) ────────
  log('\n\n4. ARE THE OWNING DOCUMENTS STILL ALIVE?');
  const docs = await q(`
    SELECT DISTINCT sl.reference_id
      FROM stock_ledger sl
     WHERE sl.company_id=$1 AND sl.item_id = ANY($2)
       AND sl.transaction_type='PRODUCTION_RECEIPT' AND sl.warehouse_id=$3`,
    [company, itemIds, WH_SPK]);
  const docIds = docs.map((d) => d.reference_id).filter(Boolean);
  const alive = await q(`
    SELECT pe.id, pe.entry_number, pe.entry_date, pe.machine_no,
           pe.actual_quantity, pe.is_active, pe.deleted_at,
           w.warehouse_code AS doc_claims_wh, pe.inventory_reference_id
      FROM production_entries pe
      LEFT JOIN warehouses w ON w.id = pe.warehouse_id
     WHERE pe.company_id=$1 AND pe.id = ANY($2)
     ORDER BY pe.entry_date`, [company, docIds]);
  const deleted = alive.filter((r) => r.deleted_at || !r.is_active);
  log(`   ${alive.length} owning document(s); ${alive.length - deleted.length} still live, ${deleted.length} deleted/inactive.`);
  log('   (The user reported "no live entries" — this checks whether the');
  log('    documents are truly gone or simply filtered out of the grid.)');
  TABLE(alive.map((r) => ({
    doc: r.entry_number, date: r.entry_date, machine: r.machine_no,
    qty: fmt(r.actual_quantity), doc_wh: r.doc_claims_wh,
    active: r.is_active, deleted_at: r.deleted_at ? 'YES' : 'no',
    inv_ref: r.inventory_reference_id ? 'set' : 'NULL',
  })));

  // ── 5. Sum check per item ────────────────────────────────────────────────
  log('\n\n5. PER-ITEM SUM CHECK');
  log('   ghost = balance under CCD-SP-002;  receipts = PRODUCTION_RECEIPT IN');
  log('   rows in SPI-SPK-003 written within 2s of that balance row being');
  log('   created or updated.');
  const sums = await q(`
    SELECT i.item_code,
           ROUND(b.on_hand::numeric,2) AS ghost_balance,
           b.created_at, b.updated_at,
           ROUND(COALESCE(SUM(CASE WHEN sl.id IS NOT NULL THEN sl.quantity END),0)::numeric,2) AS coincident_receipts
      FROM inventory_balances b
      JOIN items i ON i.id = b.item_id
      LEFT JOIN stock_ledger sl
        ON sl.company_id = b.company_id AND sl.item_id = b.item_id
       AND sl.warehouse_id = $3
       AND sl.transaction_type = 'PRODUCTION_RECEIPT'
       AND (ABS(EXTRACT(EPOCH FROM (sl.created_at - b.created_at))) <= 2
            OR ABS(EXTRACT(EPOCH FROM (sl.created_at - b.updated_at))) <= 2)
     WHERE b.company_id=$1 AND b.warehouse_id=$2 AND b.item_id = ANY($4)
     GROUP BY i.item_code, b.on_hand, b.created_at, b.updated_at
     ORDER BY i.item_code`, [company, WH_CCD, WH_SPK, itemIds]);
  let g = 0, r2 = 0;
  TABLE(sums.map((s) => {
    g += n(s.ghost_balance); r2 += n(s.coincident_receipts);
    return {
      item: s.item_code, ghost: fmt(s.ghost_balance),
      coincident_receipts: fmt(s.coincident_receipts),
      unexplained: fmt(n(s.ghost_balance) - n(s.coincident_receipts)),
    };
  }));
  log(`\n   TOTAL ghost ${fmt(g)}   explained by coincident receipts ${fmt(r2)}   unexplained ${fmt(g - r2)}`);

  await c.end();
  log('\n[DONE — read-only, nothing was written]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });
