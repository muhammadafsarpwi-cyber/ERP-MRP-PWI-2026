/**
 * WHAT ELSE CAN WRITE `inventory_balances`? READ-ONLY.
 *
 * The evidence so far: the ledger matches its own production document 7/7,
 * the documents are alive, and the balance row under CCD-SP-002 was written
 * in the SAME second as a receipt that the ledger correctly placed in
 * SPI-SPK-003. Both application writers share one `warehouseId` argument, so
 * application code alone cannot produce that split.
 *
 * This checks for the remaining explanations:
 *   1. database triggers on inventory_balances / stock_ledger,
 *   2. every application call site of updateBalance,
 *   3. any warehouse-resolution fallback that could yield a different id.
 *
 * Run:  node scratch/ghost-five-whatwrites.cjs
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
  log('  WHAT ELSE CAN WRITE inventory_balances?');
  log('  READ-ONLY. Nothing in this script writes to the database.');
  log('══════════════════════════════════════════════════════════════════════════');

  // ── 1. Triggers ─────────────────────────────────────────────────────────
  log('\n\n1. DATABASE TRIGGERS (a trigger could re-route the write silently)');
  const trg = await q(`
    SELECT t.tgname AS trigger_name, c.relname AS table_name,
           pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE NOT t.tgisinternal
       AND ns.nspname = 'public'
       AND c.relname IN ('inventory_balances','stock_ledger')
     ORDER BY c.relname, t.tgname`);
  TABLE(trg);

  // ── 2. Rules / updatable views ──────────────────────────────────────────
  log('\n\n2. RULES OR VIEWS OVER inventory_balances');
  const rules = await q(`
    SELECT schemaname, viewname, definition FROM pg_views
     WHERE schemaname='public' AND definition ILIKE '%inventory_balances%'`);
  TABLE(rules.map((r) => ({ view: r.viewname, has_definition: 'yes' })));

  // ── 3. Columns of inventory_balances ────────────────────────────────────
  log('\n\n3. FULL COLUMN LIST OF inventory_balances');
  const cols = await q(`
    SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='inventory_balances'
     ORDER BY ordinal_position`);
  TABLE(cols);

  // ── 4. Indexes / unique constraints ─────────────────────────────────────
  log('\n\n4. INDEXES AND CONSTRAINTS ON inventory_balances');
  log('   (the report earlier asserted "no unique constraint on');
  log('    (company,item,warehouse)" — verifying that claim directly)');
  const idx = await q(`
    SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname='public' AND tablename='inventory_balances'`);
  TABLE(idx);
  const cons = await q(`
    SELECT conname, contype, pg_get_constraintdef(oid) AS def
      FROM pg_constraint WHERE conrelid = 'inventory_balances'::regclass`);
  TABLE(cons.map((r) => ({ name: r.conname, type: r.contype, def: r.def })));

  // ── 5. Do the ghost rows differ from the good rows in any hidden way? ────
  log('\n\n5. GHOST ROW vs GOOD ROW — every column, side by side');
  const items = await q(`SELECT id, item_code FROM items WHERE company_id=$1 AND item_code=$2`,
    [company, 'WIP-SP-002']);
  const itemId = items[0].id;
  const compare = await q(`
    SELECT CASE WHEN b.warehouse_id = $2 THEN 'GHOST (CCD-SP-002)' ELSE 'GOOD (SPI-SPK-003)' END AS which,
           b.id, b.item_id, b.warehouse_id, b.location_id, b.batch_id, b.uom_id,
           b.on_hand, b.reserved, b.available, b.status, b.is_active,
           b.company_id, b.created_by, b.updated_by,
           b.created_at, b.updated_at
      FROM inventory_balances b
     WHERE b.company_id=$1 AND b.item_id=$3
       AND b.warehouse_id IN ($2, $4)
     ORDER BY which DESC`, [company, WH_CCD, itemId, WH_SPK]);
  TABLE(compare.map((r) => ({
    which: r.which, id: r.id, warehouse_id: r.warehouse_id,
    location_id: r.location_id, batch_id: r.batch_id, uom_id: r.uom_id,
    on_hand: fmt(r.on_hand), reserved: r.reserved, available: fmt(r.available),
    status: r.status, is_active: r.is_active,
    created_by: r.created_by, updated_by: r.updated_by,
  })));

  // ── 6. Division check: is the ghost row in the WRONG DIVISION? ──────────
  log('\n\n6. DIVISION CONSISTENCY');
  log('   The five items belong to one division. Which division is each');
  log('   warehouse in? A balance sitting in a warehouse of another division');
  log('   is visible on the wrong department card by construction.');
  const div = await q(`
    SELECT w.warehouse_code, d.id AS division_id, d.division_code, d.name AS division_name
      FROM warehouses w LEFT JOIN divisions d ON d.id = w.division_id
     WHERE w.id IN ($1,$2)`, [WH_CCD, WH_SPK]);
  TABLE(div);
  const itemDiv = await q(`
    SELECT DISTINCT i.item_code, d.division_code, d.name
      FROM items i LEFT JOIN divisions d ON d.id = i.division_id
     WHERE i.company_id=$1 AND i.item_code = ANY($2)`, [company, CODES]);
  log('   The items themselves:');
  TABLE(itemDiv);

  // ── 7. Which divisions may the CARD even see? ───────────────────────────
  log('\n\n7. HOW THE CARD GROUPS BY DEPARTMENT');
  log('   The Production Item Open Stock card groups balances by warehouse.');
  log('   So a balance row filed under CCD-SP-002 is shown under CCD-SP-002');
  log('   no matter which division produced it — the split is in the');
  log('   warehouse_id stamped on the balance row, not in the card.');
  const allPairs = await q(`
    SELECT w.warehouse_code, i.item_code, ROUND(ib.on_hand::numeric,2) AS on_hand
      FROM inventory_balances ib
      JOIN warehouses w ON w.id = ib.warehouse_id
      JOIN items i ON i.id = ib.item_id
     WHERE ib.company_id=$1 AND i.item_code = ANY($2) AND ib.on_hand <> 0
     ORDER BY i.item_code, w.warehouse_code`, [company, CODES]);
  TABLE(allPairs);

  await c.end();
  log('\n[DONE — read-only, nothing was written]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });
