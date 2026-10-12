/**
 * PRE-FLIGHT for the ghost migration. READ-ONLY.
 *
 * Answers: (1) every PRODUCTION_REVERSAL row in CCD-SP-002, so we know the
 * full stranded set including WIP-SP-006; (2) does anything reference
 * inventory_balances.id (we want to delete the zeroed source rows); (3) the
 * unique constraint we must respect when merging; (4) does a WIP-SP-006
 * balance row exist in SPI-SPK-003.
 *
 * Run:  node scratch/ghost-five-preflight.cjs > scratch/ghost-preflight.txt
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

  log('════════════════════════════════════════════════════════════════════');
  log('  PRE-FLIGHT (READ-ONLY)');
  log('════════════════════════════════════════════════════════════════════');

  log('\n\n1. EVERY PRODUCTION_REVERSAL ROW IN CCD-SP-002 — the full stranded set');
  const rev = await q(`
    SELECT sl.id, i.item_code, pe.entry_number, pe.is_active,
           sl.direction, ROUND(sl.quantity::numeric,3) AS qty,
           to_char(sl.created_at,'YYYY-MM-DD HH24:MI:SS.US') AS created_at,
           sl.xmin::text::bigint AS xmin
      FROM stock_ledger sl
      JOIN items i ON i.id = sl.item_id
      LEFT JOIN production_entries pe ON pe.id = sl.reference_id
     WHERE sl.company_id=$1 AND sl.transaction_type='PRODUCTION_REVERSAL'
       AND sl.warehouse_id=$2
     ORDER BY i.item_code, sl.created_at`, [company, CCD]);
  TABLE(rev);

  log(`\n  --> ${rev.length} stranded reversal row(s), items: ${[...new Set(rev.map((r) => r.item_code))].join(', ')}`);

  log('\n\n1b. NET OF THOSE ROWS, PER ITEM (what moving them does to SPI-SPK-003 ledger)');
  const net = await q(`
    SELECT i.item_code,
           ROUND(SUM(CASE WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END)::numeric,3) AS net,
           COUNT(*) AS rows_moved
      FROM stock_ledger sl JOIN items i ON i.id = sl.item_id
     WHERE sl.company_id=$1 AND sl.transaction_type='PRODUCTION_REVERSAL' AND sl.warehouse_id=$2
     GROUP BY 1 ORDER BY 1`, [company, CCD]);
  TABLE(net);

  log('\n\n2. DO THE RECEIPTS OF THOSE ENTRIES SIT IN SPI-SPK-003? (they must, to pair up)');
  const pair = await q(`
    SELECT pe.entry_number, i.item_code, w.warehouse_code AS receipt_wh,
           ROUND(sl.quantity::numeric,3) AS qty, sl.xmin::text::bigint AS xmin
      FROM stock_ledger sl
      JOIN production_entries pe ON pe.id = sl.reference_id
      JOIN items i ON i.id = sl.item_id
      JOIN warehouses w ON w.id = sl.warehouse_id
     WHERE sl.company_id=$1 AND sl.transaction_type='PRODUCTION_RECEIPT'
       AND pe.entry_number IN ('PE-2026-00308','PE-2026-00312')
     ORDER BY pe.entry_number, i.item_code`, [company]);
  TABLE(pair);

  log('\n\n3. WIP-SP-006 BALANCE ROWS (CCD source is 0; does SPI-SPK-003 have one?)');
  TABLE(await q(`
    SELECT ib.id, i.item_code, w.warehouse_code AS wh, ROUND(ib.on_hand::numeric,3) AS on_hand,
           ib.uom_id, ib.location_id, ib.batch_id
      FROM inventory_balances ib
      JOIN items i ON i.id = ib.item_id
      JOIN warehouses w ON w.id = ib.warehouse_id
     WHERE ib.company_id=$1 AND i.item_code='WIP-SP-006'
     ORDER BY w.warehouse_code`, [company]));

  log('\n\n4. FOREIGN KEYS referencing inventory_balances (can we DELETE the zeroed rows?)');
  TABLE(await q(`
    SELECT tc.table_name AS from_table, kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_col
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
     WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='inventory_balances'
     ORDER BY 1`));

  log('\n\n5. UNIQUE / PRIMARY CONSTRAINTS on inventory_balances and stock_ledger');
  TABLE(await q(`
    SELECT tc.table_name, tc.constraint_type, tc.constraint_name,
           string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS cols
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
     WHERE tc.table_name IN ('inventory_balances','stock_ledger')
       AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE')
     GROUP BY 1,2,3 ORDER BY 1,2`));

  log('\n\n6. STOCK_LEDGER TRIGGERS / RULES (append-only guard already present?)');
  TABLE(await q(`
    SELECT tgname, pg_get_triggerdef(oid) AS def FROM pg_trigger
     WHERE tgrelid = 'stock_ledger'::regclass AND NOT tgisinternal`));
  TABLE(await q(`
    SELECT rulename, definition FROM pg_rules WHERE tablename='stock_ledger'`));

  log('\n\n6b. UNIQUE INDEXES on inventory_balances / stock_ledger (index, not constraint)');
  TABLE(await q(`
    SELECT tablename, indexname, indexdef FROM pg_indexes
     WHERE tablename IN ('inventory_balances','stock_ledger')
       AND indexdef LIKE '%UNIQUE%' ORDER BY 1,2`));

  log('\n\n7. CAN THIS ROLE CREATE TRIGGERS? (needed for the DB guard)');
  TABLE(await q(`
    SELECT current_user AS role, has_table_privilege(current_user,'stock_ledger','INSERT') AS can_insert,
           has_table_privilege(current_user,'stock_ledger','UPDATE') AS can_update,
           has_column_privilege(current_user,'stock_ledger','warehouse_id','UPDATE') AS can_update_wh`));

  log('\n\n8. PRE-MIGRATION SNAPSHOT — the five items + WIP-SP-006, both warehouses');
  const snap = await q(`
    SELECT i.item_code, w.warehouse_code AS wh,
           ROUND(COALESCE(ib.on_hand,0)::numeric,3) AS balance,
           ROUND(COALESCE(led.net,0)::numeric,3) AS ledger_net,
           ROUND((COALESCE(ib.on_hand,0) - COALESCE(led.net,0))::numeric,3) AS drift
      FROM items i
      CROSS JOIN warehouses w
      LEFT JOIN inventory_balances ib ON ib.item_id=i.id AND ib.warehouse_id=w.id AND ib.company_id=$1
      LEFT JOIN (SELECT item_id, warehouse_id, SUM(CASE WHEN direction='IN' THEN quantity ELSE -quantity END) AS net
                   FROM stock_ledger WHERE company_id=$1 GROUP BY 1,2) led
             ON led.item_id=i.id AND led.warehouse_id=w.id
     WHERE i.company_id=$1 AND i.item_code IN ('WIP-SP-002','WIP-SP-005','WIP-SP-006','WIP-SP-010','WIP-SP-013','WIP-SP-014')
       AND w.id IN ($2,$3)
     ORDER BY i.item_code, w.warehouse_code`, [company, CCD, SPK]);
  TABLE(snap);
  log('\n  -- totals per warehouse --');
  TABLE(await q(`
    SELECT w.warehouse_code AS wh,
           ROUND(SUM(COALESCE(ib.on_hand,0))::numeric,3) AS balance,
           ROUND(SUM(COALESCE(led.net,0))::numeric,3) AS ledger_net
      FROM warehouses w
      LEFT JOIN items i ON i.company_id=$1 AND i.item_code IN ('WIP-SP-002','WIP-SP-005','WIP-SP-006','WIP-SP-010','WIP-SP-013','WIP-SP-014')
      LEFT JOIN inventory_balances ib ON ib.warehouse_id=w.id AND ib.item_id=i.id AND ib.company_id=$1
      LEFT JOIN (SELECT item_id, warehouse_id, SUM(CASE WHEN direction='IN' THEN quantity ELSE -quantity END) AS net
                   FROM stock_ledger WHERE company_id=$1 GROUP BY 1,2) led
             ON led.item_id=i.id AND led.warehouse_id=w.id
     WHERE w.id IN ($2,$3)
     GROUP BY 1 ORDER BY 1`, [company, CCD, SPK]));

  await c.end();
  log('\n[DONE — read-only, nothing was written]');
})().catch((err) => { console.error('ERR:', err.message); process.exit(1); });
