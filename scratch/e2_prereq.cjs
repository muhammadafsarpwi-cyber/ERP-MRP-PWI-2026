/* READ-ONLY: pre-reqs for EDIT 2 (deleteLedgerRow balance sync). */
const fs = require('fs'); const path = require('path');
const { Client } = require(path.join('D:', 'ERP-MRP-PWI-2026', 'backend', 'node_modules', 'pg'));
function loadEnv() { const p = path.join('D:', 'ERP-MRP-PWI-2026', 'backend', '.env'); const o = {};
  for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(l.trim()); if (m) o[m[1]] = m[2].replace(/^["']|["']$/g, ''); } return o; }
const log = (s) => console.log(s);
const TABLE = (rows) => { if (!rows.length) { log('  (none)'); return; }
  log('  ' + Object.keys(rows[0]).join(' | '));
  for (const r of rows) log('  ' + Object.values(r).map(String).join(' | ')); };

(async () => {
  const e = loadEnv();
  const c = new Client({ host: e.DB_HOST, port: Number(e.DB_PORT), user: e.DB_USERNAME, password: e.DB_PASSWORD, database: e.DB_DATABASE, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const q = async (sql, p = []) => (await c.query(sql, p)).rows;

  log('=== 1. stock_ledger rows with NULL/zero uom_id or quantity ===');
  TABLE(await q(`SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE uom_id IS NULL)::int AS null_uom,
                        COUNT(*) FILTER (WHERE quantity IS NULL)::int AS null_qty,
                        COUNT(*) FILTER (WHERE quantity <= 0)::int AS nonpos_qty,
                        COUNT(*) FILTER (WHERE item_id IS NULL OR warehouse_id IS NULL)::int AS null_key
                 FROM stock_ledger`));

  log('\n=== 2. transaction_type distribution (whole ledger) ===');
  TABLE(await q(`SELECT transaction_type, COUNT(*)::int AS rows,
                        COUNT(*) FILTER (WHERE uom_id IS NULL)::int AS null_uom
                 FROM stock_ledger GROUP BY 1 ORDER BY 2 DESC`));

  log('\n=== 3. PRODUCTION_REVERSAL notes that do NOT parse "Reversal of X" ===');
  TABLE(await q(`SELECT id, LEFT(COALESCE(notes,''),70) AS notes FROM stock_ledger
                 WHERE transaction_type='PRODUCTION_REVERSAL'
                   AND notes !~ '^Reversal of [A-Z_]+' LIMIT 10`));

  log('\n=== 4. Reversal families ===');
  TABLE(await q(`SELECT substring(notes FROM '^Reversal of ([A-Z_]+)') AS family, COUNT(*)::int AS rows
                 FROM stock_ledger WHERE transaction_type='PRODUCTION_REVERSAL' GROUP BY 1 ORDER BY 2 DESC`));

  log('\n=== 5. Dummy rows currently targeted by deleteDummyLedgerRows (FT-04/demo/test/dummy) ===');
  TABLE(await q(`SELECT transaction_type, COUNT(*)::int AS rows,
                        COUNT(DISTINCT item_id)::int AS items,
                        ROUND(SUM(CASE WHEN transaction_type='PRODUCTION_SCRAP' THEN 0
                                       WHEN direction='IN' THEN quantity ELSE -quantity END)::numeric,2) AS balance_net
                 FROM stock_ledger
                 WHERE notes ILIKE '%FT-04%' OR notes ILIKE '%demo%' OR notes ILIKE '%test%' OR notes ILIKE '%dummy%'
                 GROUP BY 1 ORDER BY 2 DESC`));

  log('\n=== 6. production_entries.inventory_reference_id -> stock_ledger FK? ===');
  TABLE(await q(`SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS ref_table, ccu.column_name AS ref_column
                 FROM information_schema.table_constraints tc
                 JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name
                 JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name
                 WHERE tc.table_name='production_entries' AND kcu.column_name='inventory_reference_id'`));

  log('\n=== 7. Any ledger rows whose reference_type is NOT PRODUCTION_ENTRY (deleted by these endpoints too) ===');
  TABLE(await q(`SELECT COALESCE(reference_type,'(null)') AS ref_type, COUNT(*)::int AS rows
                 FROM stock_ledger GROUP BY 1 ORDER BY 2 DESC LIMIT 20`));

  log('\n=== 8. Balances touched by dummy rows: could the reversal go negative? ===');
  TABLE(await q(`
    WITH rws AS (
      SELECT sl.item_id, sl.warehouse_id,
             SUM(CASE WHEN sl.transaction_type='PRODUCTION_SCRAP' THEN 0
                      WHEN sl.direction='IN' THEN sl.quantity ELSE -sl.quantity END) AS delta
      FROM stock_ledger sl
      WHERE sl.notes ILIKE '%FT-04%' OR sl.notes ILIKE '%demo%' OR sl.notes ILIKE '%test%' OR sl.notes ILIKE '%dummy%'
      GROUP BY 1,2)
    SELECT i.item_code, w.warehouse_code, ROUND(r.delta::numeric,2) AS row_delta,
           ROUND(COALESCE(ib.on_hand,0)::numeric,2) AS on_hand,
           ROUND((COALESCE(ib.on_hand,0) - r.delta)::numeric,2) AS after_reversal
    FROM rws r JOIN items i ON i.id=r.item_id JOIN warehouses w ON w.id=r.warehouse_id
    LEFT JOIN inventory_balances ib ON ib.item_id=r.item_id AND ib.warehouse_id=r.warehouse_id AND ib.status='ACTIVE'
    WHERE ABS(r.delta) > 0.0001 ORDER BY ABS(r.delta) DESC LIMIT 15`));

  await c.end(); log('\n[DONE - read-only]');
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
