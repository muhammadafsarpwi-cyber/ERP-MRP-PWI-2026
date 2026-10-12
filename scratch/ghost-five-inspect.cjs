/**
 * Exact row shapes needed by the migration: balance rows and the stranded
 * reversal rows. READ-ONLY — this never writes.
 *
 * Run:  node scratch/ghost-five-inspect.cjs > scratch/ghost-inspect.txt
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

const CCD = 'dc212cb0-364c-47ba-88db-1bde18f842de';
const SPK = '29e71f41-713e-45dc-bd69-4a3ce05a3801';

(async () => {
  const e = loadEnv();
  const c = new Client({
    host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME,
    password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;
  const company = (await q(`SELECT id FROM companies ORDER BY created_at LIMIT 1`))[0].id;

  const codes = ['WIP-SP-002', 'WIP-SP-005', 'WIP-SP-010', 'WIP-SP-013', 'WIP-SP-014'];
  const items = await q(
    `SELECT id, item_code FROM items WHERE company_id=$1 AND item_code = ANY($2) ORDER BY item_code`,
    [company, codes],
  );
  const itemIds = items.map((r) => r.id);

  log('════════════════════════════════════════════════════════════════════');
  log('  INSPECT — exact rows the migration will touch (READ-ONLY)');
  log('════════════════════════════════════════════════════════════════════');

  log('\n\n0. inventory_balances COLUMN LIST');
  TABLE(await q(`
    SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
     WHERE table_name='inventory_balances' ORDER BY ordinal_position`));

  log('\n\n0b. UOM TABLE COLUMNS');
  TABLE(await q(`
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_name LIKE '%uom%' ORDER BY table_name, ordinal_position`));

  log('\n\n1. TARGET BALANCE ROWS (CCD-SP-002 source + SPI-SPK-003 destination)');
  const bal = await q(`
    SELECT ib.id, i.item_code, w.warehouse_code AS wh,
           ROUND(ib.on_hand::numeric,3) AS on_hand, ROUND(ib.available::numeric,3) AS available,
           ib.uom_id, u.code, ib.location_id, ib.batch_id,
           ib.created_by::text AS created_by,
           to_char(ib.created_at,'YYYY-MM-DD HH24:MI:SS.US') AS created_at,
           to_char(ib.updated_at,'YYYY-MM-DD HH24:MI:SS.US') AS updated_at,
           ib.xmin::text::bigint AS xmin
      FROM inventory_balances ib
      JOIN items i ON i.id = ib.item_id
      JOIN warehouses w ON w.id = ib.warehouse_id
      LEFT JOIN uoms u ON u.id = ib.uom_id
     WHERE ib.company_id=$1 AND ib.item_id = ANY($2)
       AND ib.warehouse_id IN ($3, $4)
     ORDER BY i.item_code, w.warehouse_code`, [company, itemIds, CCD, SPK]);
  TABLE(bal);

  log('\n\n1b. UOM MISMATCH CHECK — does the CCD row use the same uom as the SPK row?');
  const um = await q(`
    SELECT i.item_code,
           u1.code AS ccd_uom, u2.code AS spk_uom,
           CASE WHEN b1.uom_id = b2.uom_id THEN 'MATCH' ELSE 'DIFFERENT UOM' END AS verdict
      FROM items i
      LEFT JOIN inventory_balances b1 ON b1.item_id=i.id AND b1.warehouse_id=$2 AND b1.company_id=$1
      LEFT JOIN inventory_balances b2 ON b2.item_id=i.id AND b2.warehouse_id=$3 AND b2.company_id=$1
      LEFT JOIN uoms u1 ON u1.id = b1.uom_id
      LEFT JOIN uoms u2 ON u2.id = b2.uom_id
     WHERE i.company_id=$1 AND i.id = ANY($4)
     ORDER BY i.item_code`, [company, CCD, SPK, itemIds]);
  TABLE(um);

  log('\n\n2. STRANDED PRODUCTION_REVERSAL ROWS IN CCD-SP-002');
  log('   (their receipts were moved to SPI-SPK-003 by the 10-11 script)');
  const rev = await q(`
    SELECT sl.id, i.item_code, w.warehouse_code AS wh, pe.entry_number,
           sl.transaction_type, sl.direction, ROUND(sl.quantity::numeric,3) AS qty,
           sl.uom_id, u.code, sl.reference_type, sl.reference_id, sl.reference_number,
           to_char(sl.created_at,'YYYY-MM-DD HH24:MI:SS.US') AS created_at,
           sl.xmin::text::bigint AS xmin
      FROM stock_ledger sl
      JOIN items i ON i.id = sl.item_id
      JOIN warehouses w ON w.id = sl.warehouse_id
      LEFT JOIN uoms u ON u.id = sl.uom_id
      LEFT JOIN production_entries pe ON pe.id = sl.reference_id
     WHERE sl.company_id=$1 AND sl.item_id = ANY($2)
       AND sl.transaction_type='PRODUCTION_REVERSAL'
       AND sl.warehouse_id=$3
     ORDER BY i.item_code, sl.created_at`, [company, itemIds, CCD]);
  TABLE(rev);

  log('\n\n3. stock_ledger COLUMN LIST (for the append-only guard)');
  TABLE(await q(`
    SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name='stock_ledger' ORDER BY ordinal_position`));

  log('\n\n4. EXISTING TRIGGERS on stock_ledger / inventory_balances');
  TABLE(await q(`
    SELECT event_object_table AS tbl, trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
     WHERE event_object_table IN ('stock_ledger','inventory_balances')
     ORDER BY 1,2`));

  log('\n\n5. INDEXES on stock_ledger / inventory_balances (migration must respect them)');
  TABLE(await q(`
    SELECT tablename, indexname, indexdef FROM pg_indexes
     WHERE tablename IN ('stock_ledger','inventory_balances')
     ORDER BY tablename, indexname`));

  await c.end();
  log('\n[DONE — read-only, nothing was written]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });
