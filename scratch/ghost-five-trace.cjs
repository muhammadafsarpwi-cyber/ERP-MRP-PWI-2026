/**
 * TRACE two decisive documents end-to-end. READ-ONLY.
 *
 * PE-2026-00308 is decisive because it is the ONLY document with journal rows
 * inside CCD-SP-002 — four PRODUCTION_REVERSAL rows — yet section 2 of the
 * origin trace found NO production receipt ever landed in CCD-SP-002. If the
 * reversals are there but the receipts are not, the receipts were removed
 * without the balance following them.
 *
 * PE-2026-00298 is the receipt that coincides exactly with the CCD-SP-002
 * balance row for WIP-SP-002 being created.
 *
 * Run:  node scratch/ghost-five-trace.cjs
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
const iso = (v) => (v ? new Date(v).toISOString() : '(null)');

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
  log('  TRACE — PE-2026-00308 and PE-2026-00298, every row, every warehouse');
  log('  READ-ONLY. Nothing in this script writes to the database.');
  log('══════════════════════════════════════════════════════════════════════════');

  const docs = ['PE-2026-00308', 'PE-2026-00298'];

  for (const d of docs) {
    log(`\n\n──── ${d} ────────────────────────────────────────────────────────────`);

    const pe = await q(`
      SELECT pe.id, pe.entry_number, pe.entry_date, pe.machine_no,
             pe.actual_quantity, pe.is_active, pe.deleted_at,
             pe.inventory_reference_id,
             w.warehouse_code AS doc_warehouse,
             pe.raw_material_warehouse_id,
             pe.created_at, pe.updated_at
        FROM production_entries pe
        LEFT JOIN warehouses w ON w.id = pe.warehouse_id
       WHERE pe.company_id=$1 AND pe.entry_number=$2`, [company, d]);
    if (!pe.length) { log('  document not found'); continue; }
    const p0 = pe[0];
    log(`  entry id            : ${p0.id}`);
    log(`  entry warehouse     : ${p0.doc_warehouse}`);
    log(`  inventory_reference : ${p0.inventory_reference_id ?? 'NULL'}`);
    log(`  is_active           : ${p0.is_active}   deleted_at: ${iso(p0.deleted_at)}`);
    log(`  created             : ${iso(p0.created_at)}`);
    log(`  updated             : ${iso(p0.updated_at)}   <-- entry edited?`);

    const rows = await q(`
      SELECT sl.id, w.warehouse_code, i.item_code, sl.transaction_type,
             sl.direction, sl.quantity, sl.reference_id,
             sl.created_at, sl.notes
        FROM stock_ledger sl
        JOIN warehouses w ON w.id = sl.warehouse_id
        JOIN items i ON i.id = sl.item_id
       WHERE sl.company_id=$1 AND sl.reference_type='PRODUCTION_ENTRY'
         AND sl.reference_id=$2
       ORDER BY sl.created_at, sl.id`, [company, p0.id]);
    log(`\n  ${rows.length} ledger row(s) still referencing this document:`);
    TABLE(rows.map((r) => ({
      ledger_row: r.id, wh: r.warehouse_code, item: r.item_code,
      type: r.transaction_type, dir: r.direction, qty: fmt(r.quantity),
      created: iso(r.created_at),
      notes: r.notes ? String(r.notes).slice(0, 48) : null,
    })));

    // Any row whose reference_id still points here but which the grid would
    // filter out (deleted parent). Already covered above. Now: rows that USED
    // to belong to this entry — detectable by notes carrying the same machine
    // and date but a null/different reference_id.
    log(`\n  Rows whose notes mention this entry's machine (${p0.machine_no}) and`);
    log(`  entry date (${p0.entry_date}) but are NOT linked to it:`);
    const orphan = await q(`
      SELECT sl.id, w.warehouse_code, i.item_code, sl.transaction_type,
             sl.direction, sl.quantity, sl.reference_type, sl.reference_number,
             sl.reference_id, sl.created_at, sl.notes
        FROM stock_ledger sl
        JOIN warehouses w ON w.id = sl.warehouse_id
        JOIN items i ON i.id = sl.item_id
       WHERE sl.company_id=$1
         AND sl.notes LIKE '%' || $2::text || '%' || $3::text || '%'
       ORDER BY sl.created_at`, [company, p0.machine_no, String(p0.entry_date).slice(0, 10)]);
    TABLE(orphan.map((r) => ({
      ledger_row: r.id, wh: r.warehouse_code, item: r.item_code,
      type: r.transaction_type, dir: r.direction, qty: fmt(r.quantity),
      ref_type: r.reference_type, ref_num: r.reference_number,
      linked_to: r.reference_id ?? 'NULL (no document)',
      created: iso(r.created_at),
    })));
  }

  // ── Does stock_ledger even have an updated_at that could betray a move? ──
  log('\n\n──── stock_ledger columns ───────────────────────────────────────────');
  const cols = await q(`
    SELECT column_name, data_type, column_default
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='stock_ledger'
     ORDER BY ordinal_position`);
  TABLE(cols);

  await c.end();
  log('\n[DONE — read-only, nothing was written]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });
